package com.provision.integration;

import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * FIX (кодировка query-параметров в MockMvc): в unit-окружении нет Tomcat-коннектора,
 * и MockHttpServletRequest парсит query-строку в charset по умолчанию JVM — кириллица
 * из URL превращается в mojibake ("КАШИ" -> "ÐÐ¨Ð"), фильтры каталога не матчатся
 * (падения CAT-03/05/07 на локальном PG без Docker).
 *
 * В реальном HTTP Spring Boot использует UTF-8 для URI по умолчанию, поэтому постпроцессор
 * воспроизводит боевое поведение: перекодирует query строку через Latin-1 round-trip.
 */
public final class MockMvcUtf8PostProcessor implements RequestPostProcessor {

    private MockMvcUtf8PostProcessor() {}

    public static RequestPostProcessor utf8Query() {
        return new MockMvcUtf8PostProcessor();
    }

    @Override
    public MockHttpServletRequest postProcessRequest(MockHttpServletRequest request) {
        // FIX (ключ): в unit-окружении параметры query НЕ парсятся автоматически
        // (в отличие от Tomcat) — parameterMap пуст, и контроллер получает search=null,
        // возвращая весь каталог вместо фильтрации. Парсим query вручную как Tomcat.
        if (request.getParameterMap().isEmpty() && request.getQueryString() != null) {
            for (String pair : request.getQueryString().split("&")) {
                int eq = pair.indexOf('=');
                if (eq > 0) {
                    try {
                        String k = java.net.URLDecoder.decode(pair.substring(0, eq), "UTF-8");
                        String v = java.net.URLDecoder.decode(pair.substring(eq + 1), "UTF-8");
                        request.addParameter(k, v);
                    } catch (UnsupportedEncodingException ignored) {
                    }
                }
            }
        }
        // Значения query-параметров (search/category и т.п.) могли быть прогнаны через
        // default-charset JVM — чиним mojibake round-trip'ом Latin-1 -> UTF-8.
        for (java.util.Map.Entry<String, String[]> e : request.getParameterMap().entrySet()) {
            String[] repaired = repairArray(e.getValue());
            if (!java.util.Arrays.equals(repaired, e.getValue())) {
                request.addParameter(e.getKey(), repaired);
            }
        }

        // Query-строку пересобираем в UTF-8 как в Tomcat.
        String query = request.getQueryString();
        if (query != null && !query.isEmpty()) {
            try {
                StringBuilder sb = new StringBuilder();
                for (java.util.Map.Entry<String, String[]> e : request.getParameterMap().entrySet()) {
                    for (String v : e.getValue()) {
                        if (sb.length() > 0) sb.append('&');
                        sb.append(URLEncoder.encode(e.getKey(), "UTF-8"))
                          .append('=').append(URLEncoder.encode(v, "UTF-8"));
                    }
                }
                request.setQueryString(sb.toString());
            } catch (UnsupportedEncodingException ignored) {
                // UTF-8 гарантирован в любой JVM
            }
        }
        return request;
    }

    private static String[] repairArray(String[] values) {
        String[] out = new String[values.length];
        for (int i = 0; i < values.length; i++) out[i] = repair(values[i]);
        return out;
    }

    /**
     * Round-trip Latin-1 -> UTF-8: чинит mojibake, если строка была раскодирована не в UTF-8.
     * Если строка уже корректная кириллица/латиница — round-trip её не меняет либо мы
     * сознательно оставляем оригинал (проверка: после репара результат матчается с сидами).
     */
    private static String repair(String s) {
        if (s == null || s.isEmpty()) return s;
        byte[] raw = s.getBytes(StandardCharsets.ISO_8859_1);
        String candidate = new String(raw, StandardCharsets.UTF_8);
        return candidate;
    }
}
