package com.provision.integration;

import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * FIX (двойная декодировка query-параметров в MockMvc, падения CAT-03/05).
 *
 * Корень проблемы: MockHttpServletRequestBuilder#buildRequest сам разбирает query-строку
 * и ДЕКОДИРУЕТ ключи/значения через UriUtils.decode(..., UTF-8) (проверено по байткоду
 * spring-test 6.1.6: lambda$addRequestParams$5). Предыдущая версия постпроцессора
 * ПОВТОРНО декодировала query через URLDecoder(UTF-8) и звала request.addParameter(...) —
 * но addParameter аппендит значение к уже существующему параметру, а не заменяет его.
 * В итоге search получал два значения ("тушенка" + мусор от двойного decode), контроллер
 * брал некорректное, SQL LIKE не матчался -> пустая выборка (CAT-03/05).
 *
 * Решение: нормализуем запрос одним проходом — пересобираем query из УЖЕ корректно
 * декодированного parameterMap в каноничный percent-encoded вид и перезаписываем
 * параметры setParameter() (по одному значению на ключ). Идемпотентно; повторного
 * URLDecoder нет — именно он и был багом.
 */
public final class MockMvcUtf8PostProcessor implements RequestPostProcessor {

    private MockMvcUtf8PostProcessor() {}

    public static RequestPostProcessor utf8Query() {
        return new MockMvcUtf8PostProcessor();
    }

    @Override
    public MockHttpServletRequest postProcessRequest(MockHttpServletRequest request) {
        String qs = request.getQueryString();
        if (qs == null || qs.isEmpty()) {
            return request;
        }
        java.util.Map<String, String[]> snapshot = new java.util.LinkedHashMap<>(request.getParameterMap());
        request.removeAllParameters();
        StringBuilder sb = new StringBuilder();
        try {
            for (java.util.Map.Entry<String, String[]> e : snapshot.entrySet()) {
                for (String v : e.getValue()) {
                    if (sb.length() > 0) sb.append('&');
                    sb.append(URLEncoder.encode(e.getKey(), "UTF-8"))
                      .append('=').append(URLEncoder.encode(v, "UTF-8"));
                    request.setParameter(e.getKey(), v);
                }
            }
        } catch (UnsupportedEncodingException ignored) {
            // UTF-8 гарантирован в любой JVM
        }
        if (sb.length() > 0) {
            request.setQueryString(sb.toString());
        }
        return request;
    }
}
