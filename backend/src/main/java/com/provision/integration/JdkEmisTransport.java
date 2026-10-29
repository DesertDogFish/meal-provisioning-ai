package com.provision.integration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Реализация {@link Transport} на JDK {@code HttpClient}: cookie-сессия, разные политики
 * редиректов для GET и POST, потоковое тело выгрузки.
 *
 * <p>GET идёт с {@code Redirect.NORMAL} (главная и страница показателя могут отдаваться через
 * 301/302 — это нормальный путь), POST — с {@code Redirect.NEVER}: 302 на POST означает ОТКАЗ
 * портала выдать данные, а не перенаправление (дефект №3 плана
 * {@code plans/done/2026-10-28-emis-download-csrf-and-volume.md}).</p>
 */
class JdkEmisTransport implements Transport {

    private static final Logger log = LoggerFactory.getLogger(JdkEmisTransport.class);

    private final String userAgent;
    private final String baseUrl;

    JdkEmisTransport(String userAgent, String baseUrl) {
        this.userAgent = userAgent;
        this.baseUrl = baseUrl;
    }

    @Override
    public Session open() {
        CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        // GET — с редиректами (как httr::GET в эталоне): главная страница и страница
        // показателя могут отдаваться через 301/302, и это нормальный путь.
        HttpClient getter = baseBuilder(cookies)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        // FIX (дефект №3 плана 2026-10-28-emis-download-csrf-and-volume): POST —
        // БЕЗ следования редиректам, как httr::config(followlocation = FALSE) в эталоне.
        // ЕМИСС отвечает 302 + Location: /indicator/<id>.do, когда ОТКЛОНЯЕТ выгрузку
        // (комбинация фильтров не даёт данных / неизвестные id значений / слишком
        // широкий или узкий запрос). С Redirect.NORMAL мы уходили по Location,
        // получали 200 + HTML страницы показателя и сообщали «истёк CSRF-токен».
        HttpClient poster = baseBuilder(cookies)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkSession session = new JdkSession(getter, poster);
        session.warmUp(); // best-effort: cookie-сессия до первого целевого GET
        return session;
    }

    private HttpClient.Builder baseBuilder(CookieManager cookies) {
        return HttpClient.newBuilder()
                .cookieHandler(cookies)
                .connectTimeout(Duration.ofSeconds(10));
    }

    private class JdkSession implements Session {
        private final HttpClient getter;
        private final HttpClient poster;
        private boolean warmedUp;

        JdkSession(HttpClient getter, HttpClient poster) {
            this.getter = getter;
            this.poster = poster;
        }

        /** Прогрев сессии: GET главной страницы портала (JSESSIONID и пр.).
         *  Живая отладка Fix-13: страница показателя без прогретой сессии может
         *  отдаваться без формы выгрузки/токена. Ошибки проглатываем —
         *  целевой запрос сам сообщит о проблеме. */
        void warmUp() {
            if (warmedUp) return;
            warmedUp = true;
            try {
                get(baseUrl);
            } catch (IOException | RuntimeException e) {
                log.debug("ЕМИСС: прогрев сессии не удался (не критично): {}", e.getMessage());
            }
        }

        @Override
        public PageResult get(String url) throws IOException {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", userAgent)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "ru-RU,ru;q=0.9")
                    .GET()
                    .build();
            return send(getter, req);
        }

        @Override
        public PageResult postForm(String url, String formBody) throws IOException {
            return send(poster, buildPost(url, formBody));
        }

        /**
         * Выгрузка SDMX читается ПОТОКОМ (KB-1): 65 МБ ответа не превращаются в
         * {@code String} (~130 МБ heap) и не разбираются DOM-ом — тело уходит в
         * StAX-парсер по мере чтения.
         */
        @Override
        public StreamResult postFormStream(String url, String formBody) throws IOException {
            try {
                HttpResponse<InputStream> res = poster.send(buildPost(url, formBody),
                        HttpResponse.BodyHandlers.ofInputStream());
                // FIX (дефект №4): заголовки обязательны для диагностики — по Content-Type
                // отличаем SDMX от HTML-заглушки, по Location показываем, куда портал
                // отправил бы нас при отказе 302.
                return new StreamResult(res.statusCode(), res.body(),
                        res.headers().firstValue("content-type").orElse(null),
                        res.headers().firstValue("location").orElse(null));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Запрос к ЕМИСС прерван", e);
            }
        }

        private HttpRequest buildPost(String url, String formBody) {
            return HttpRequest.newBuilder(URI.create(url))
                    // SDMX всей матрицы может выгружаться минутами — щедрый таймаут;
                    // выполняется только в фоновой синхронизации, UI не блокирует.
                    .timeout(Duration.ofSeconds(300))
                    .header("User-Agent", userAgent)
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .header("Accept", "application/xml,text/xml,*/*;q=0.8")
                    .header("Accept-Language", "ru-RU,ru;q=0.9")
                    .POST(HttpRequest.BodyPublishers.ofString(formBody, StandardCharsets.UTF_8))
                    .build();
        }

        private PageResult send(HttpClient httpClient, HttpRequest req) throws IOException {
            try {
                HttpResponse<String> res = httpClient.send(req,
                        HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                // FIX (дефект №4): заголовки обязательны для диагностики — по
                // Content-Type отличаем SDMX от HTML-заглушки, по Location показываем,
                // куда портал отправил бы нас при отказе 302.
                return new PageResult(res.statusCode(), res.body(),
                        res.headers().firstValue("content-type").orElse(null),
                        res.headers().firstValue("location").orElse(null));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("Запрос к ЕМИСС прерван", e);
            }
        }

        @Override
        public void close() {
            // HttpClient закрывается сборщиком мусора; явного close нет до Java 21
        }
    }
}
