package com.provision.integration;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Регрессионные тесты для переработанного OpenFoodFactsProvider:
 * 1. User-Agent строго по доке OFF ("AppName/Version (ContactEmail)");
 *    при настроенной учётке контакт — её email (Fix-9).
 * 2. Fix-9: поиск — API v2 (/api/v2/search; старый /cgi/search.pl закрыт OFF —
 *    стабильный 503). Учётка OFF — ОПЦИОНАЛЬНА и передаётся ТОЛЬКО заголовком
 *    Basic Auth; в query-параметрах (user_id/password) авторизации нет —
 *    v2-API их не принимает, а их наличие провоцирует 503.
 * 3. Цены (fix U11) берутся из Open Prices, обновление карточек — через
 *    OFF Product API v2 ({@link ProductInfoProvider}); при ненастроенном
 *    URL или недоступной сети — graceful degradation (пустой результат
 *    вместо исключения, синхронизация не падает).
 *
 * Чистые парсеры (buildPricesUri/parsePricesResponse/parseCbrRates)
 * покрыты отдельно в {@link OpenPricesSyncTest}.
 */
class OpenFoodFactsProviderTest {

    /** Недостижимый адрес: connection refused срабатывает мгновенно, без зависаний. */
    private static final String DEAD_URL = "http://127.0.0.1:9";

    @Test
    void userAgentFollowsOffDocsFormat() throws Exception {
        Field ua = OpenFoodFactsProvider.class.getDeclaredField("USER_AGENT");
        ua.setAccessible(true);
        String value = (String) ua.get(null);
        assertEquals("ProvisionApp/1.0.0 (support@provision.app)", value,
                "User-Agent должен иметь формат AppName/Version (ContactEmail)");
        assertTrue(value.matches("[A-Za-z0-9_.-]+/[0-9.]+ \\([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\)"),
                "User-Agent не соответствует формату документации OFF");
    }

    @Test
    void userAgentContactFollowsOffDocs() {
        // Fix-11 (дока OFF): UA = "AppName/Version (ContactEmail)" — контакт EMAIL.
        // Приоритет: явный contact-email → user-id, если он похож на email (legacy)
        // → дефолт. USERNAME (не email) в UA-контакт не подставляется.
        assertEquals("ProvisionApp/1.0.0 (app@mail.com)",
                OpenFoodFactsProvider.buildUserAgent("app@mail.com", "oleg_user"));
        assertEquals("ProvisionApp/1.0.0 (legacy@mail.com)",
                OpenFoodFactsProvider.buildUserAgent(null, "legacy@mail.com"));
        assertEquals("ProvisionApp/1.0.0 (support@provision.app)",
                OpenFoodFactsProvider.buildUserAgent("  ", "oleg_user"));
        assertEquals("ProvisionApp/1.0.0 (support@provision.app)",
                OpenFoodFactsProvider.buildUserAgent(null, null));
    }

    @Test
    void basicAuthHeaderIsBuiltOnlyWhenAccountConfigured() {
        // Fix-9: учётка OFF — заголовок Basic Auth; без учётки — null (анонимно)
        assertNull(OpenFoodFactsProvider.basicAuthHeader(null, null));
        assertNull(OpenFoodFactsProvider.basicAuthHeader("", ""));
        assertNull(OpenFoodFactsProvider.basicAuthHeader("user@mail.com", " "));
        assertNull(OpenFoodFactsProvider.basicAuthHeader(null, "secret"));

        String header = OpenFoodFactsProvider.basicAuthHeader("user@mail.com", "secret");
        assertNotNull(header);
        assertTrue(header.startsWith("Basic "), "Схема авторизации — Basic");
        String decoded = new String(java.util.Base64.getDecoder()
                .decode(header.substring("Basic ".length())),
                java.nio.charset.StandardCharsets.UTF_8);
        assertEquals("user@mail.com:secret", decoded);
    }

    @Test
    void friendlyOffErrorReplacesHtmlDumpWithHint() {
        // Fix-9 (п.5): OFF на 503 отдаёт 25 КБ HTML — в ошибке должна быть
        // суть + подсказка про учётку, никакого HTML-дампа.
        String html = "<!DOCTYPE html><html lang=\"en\"><head><title>Page temporarily "
                + "unavailable - Open Food Facts</title><style>*{margin:0}</style></head>"
                + "<body><h1>Page temporarily unavailable</h1></body></html>";
        String msg = OpenFoodFactsProvider.friendlyOffError(503, html, false);
        assertTrue(msg.contains("503"), "Код статуса должен быть виден: " + msg);
        assertTrue(msg.contains("OFF_USER_ID"), "Подсказка про учётку OFF: " + msg);
        assertFalse(msg.contains("<!DOCTYPE"), "HTML-дамп запрещён в сообщении");
        assertFalse(msg.contains("<html"), "HTML-теги запрещены в сообщении");
        assertTrue(msg.length() < 400, "Сообщение должно быть коротким");
    }

    @Test
    void friendlyOffError503DiffersByAuthMode() {
        // Fix-9 (п.6): OFF блокирует по IP ДО проверки учётки — при настроенных
        // кредах 503 означает временный блок IP (ждать), а не «настройте учётку».
        String authedMsg = OpenFoodFactsProvider.friendlyOffError(503, null, true);
        assertTrue(authedMsg.contains("ограничил ваш IP"), "Режим с учёткой — про IP-блок: " + authedMsg);
        assertTrue(authedMsg.contains("30–60"), "Подсказка подождать: " + authedMsg);
        assertFalse(authedMsg.contains("OFF_USER_ID"),
                "С настроенной учёткой совет «настройте учётку» бессмысленен: " + authedMsg);

        String anonMsg = OpenFoodFactsProvider.friendlyOffError(503, null, false);
        assertTrue(anonMsg.contains("OFF_USER_ID"), "Анонимный режим — совет настроить учётку: " + anonMsg);
        assertFalse(anonMsg.contains("ограничил ваш IP"));
    }

    @Test
    void friendlyOffErrorCoversTypicalCodesAndTruncatesUnknown() {
        assertTrue(OpenFoodFactsProvider.friendlyOffError(429, "", false).contains("лимит"));
        assertTrue(OpenFoodFactsProvider.friendlyOffError(429, "", true).contains("лимит"));
        assertTrue(OpenFoodFactsProvider.friendlyOffError(401, null, false).contains("OFF_USER_ID"));
        assertTrue(OpenFoodFactsProvider.friendlyOffError(403, null, true).contains("OFF_USER_ID"));
        // неизвестный код: короткий excerpt без тегов, длинное тело режется
        String longBody = "x".repeat(5000);
        String msg = OpenFoodFactsProvider.friendlyOffError(500, "<b>oops</b> " + longBody, false);
        assertTrue(msg.startsWith("Open Food Facts: HTTP 500"));
        assertFalse(msg.contains("<b>"));
        assertTrue(msg.length() <= 260, "Excerpt должен быть обрезан: " + msg.length());
        // null-тело не роняет
        assertEquals("Open Food Facts: HTTP 502",
                OpenFoodFactsProvider.friendlyOffError(502, null, false));
    }

    @Test
    void friendlyIoErrorExplainsTlsHandshakeTermination() {
        // Fix-11 (п.6): реальный кейс пользователя — «Remote host terminated the
        // handshake» на search.openfoodfacts.org: сообщение должно объяснять
        // probable-причину (провайдер/OVH) и давать команду проверки с хоста.
        String msg = OpenFoodFactsProvider.friendlyIoError(
                "Remote host terminated the handshake", "https://search.openfoodfacts.org");
        assertTrue(msg.contains("TLS"), "Суть — TLS-рукопожатие: " + msg);
        assertTrue(msg.contains("search.openfoodfacts.org"), "Хост в сообщении: " + msg);
        assertTrue(msg.contains("curl"), "Подсказка как проверить с хоста: " + msg);
        assertFalse(msg.contains("I/O error on GET request"), "Сырой текст Spring запрещён");
    }

    @Test
    void friendlyIoErrorCoversTimeoutDnsRefusedAndUnknown() {
        assertTrue(OpenFoodFactsProvider.friendlyIoError(
                "Connect to x timed out", "https://search.openfoodfacts.org").contains("не ответил вовремя"));
        assertTrue(OpenFoodFactsProvider.friendlyIoError(
                "search.openfoodfacts.org: Name or service not known", "https://search.openfoodfacts.org")
                .contains("DNS"));
        assertTrue(OpenFoodFactsProvider.friendlyIoError(
                "Connection refused", "https://world.openfoodfacts.org").contains("отказал в соединении"));
        String unknown = OpenFoodFactsProvider.friendlyIoError("weird socket thing", "https://world.openfoodfacts.org");
        assertTrue(unknown.contains("Сетевая ошибка"));
        assertTrue(unknown.contains("weird socket thing"));
        // null не роняет
        assertTrue(OpenFoodFactsProvider.friendlyIoError(null, null).contains("Сетевая ошибка"));
    }

    @Test
    void isTransientIoFailureRetriesTlsButNotRefused() {
        // TLS-обрыв/таймаут/reset — транзиентные (ретраим); refused — быстрый провал
        assertTrue(OpenFoodFactsProvider.isTransientIoFailure(
                new org.springframework.web.client.ResourceAccessException("io",
                        new javax.net.ssl.SSLException("Remote host terminated the handshake"))));
        assertTrue(OpenFoodFactsProvider.isTransientIoFailure(
                new org.springframework.web.client.ResourceAccessException("io",
                        new java.net.SocketTimeoutException("read timed out"))));
        assertTrue(OpenFoodFactsProvider.isTransientIoFailure(
                new org.springframework.web.client.ResourceAccessException("io",
                        new java.net.SocketException("Connection reset"))));
        assertFalse(OpenFoodFactsProvider.isTransientIoFailure(
                new org.springframework.web.client.ResourceAccessException("io",
                        new java.net.ConnectException("Connection refused"))));
    }

    @Test
    void parseProxyUrlSupportsHttpAndSocksAndRejectsGarbage() {
        // Fix-11 (п.7): провайдер блокирует TLS до хостов OFF у некоторых
        // провайдеров — OFF_PROXY_URL даёт обходной маршрут.
        assertNull(OpenFoodFactsProvider.parseProxyUrl(null));
        assertNull(OpenFoodFactsProvider.parseProxyUrl("   "));

        java.net.Proxy http = OpenFoodFactsProvider.parseProxyUrl("http://127.0.0.1:8888");
        assertNotNull(http);
        assertEquals(java.net.Proxy.Type.HTTP, http.type());
        assertEquals(new java.net.InetSocketAddress("127.0.0.1", 8888), http.address());

        java.net.Proxy socks = OpenFoodFactsProvider.parseProxyUrl("socks5://localhost:1080");
        assertNotNull(socks);
        assertEquals(java.net.Proxy.Type.SOCKS, socks.type());

        // дефолтный порт http-прокси
        assertEquals(new java.net.InetSocketAddress("localhost", 3128),
                OpenFoodFactsProvider.parseProxyUrl("http://localhost").address());

        // мусор — null (работаем напрямую, WARN в логах)
        assertNull(OpenFoodFactsProvider.parseProxyUrl("ftp://host:21"));
        assertNull(OpenFoodFactsProvider.parseProxyUrl("not a url at all"));
    }

    @Test
    void rootCauseMessageDigsToDeepestCause() {
        Exception wrapped = new RuntimeException("outer",
                new IllegalStateException("middle", new javax.net.ssl.SSLException("handshake terminated")));
        assertEquals("handshake terminated", OpenFoodFactsProvider.rootCauseMessage(wrapped));
        // без cause — собственное сообщение
        assertEquals("plain", OpenFoodFactsProvider.rootCauseMessage(new RuntimeException("plain")));
    }

    @Test
    void searchRequestUriIsSearchALiciousWithoutAuthParams() throws Exception {
        // Fix-11: URI поиска — Search-a-licious (GET /search?q=...): /api/v2/search
        // игнорирует search_terms (full-text в v2 нет — official docs), /cgi/search.pl
        // закрыт. user_id/password в строке запроса ЗАПРЕЩЕНЫ (дока: на GET — никогда;
        // авторизация — заголовком, см. basicAuthHeaderIsBuilt…).
        Class<?> builderClass = Class.forName(
                "com.provision.integration.OpenFoodFactsProvider$UriStringBuilder");
        Method from = builderClass.getDeclaredMethod("from", String.class);
        Method path = builderClass.getDeclaredMethod("path", String.class);
        Method qp = builderClass.getDeclaredMethod("queryParam", String.class, Object.class);
        Method build = builderClass.getDeclaredMethod("build");
        from.setAccessible(true); path.setAccessible(true); qp.setAccessible(true); build.setAccessible(true);

        Object b = from.invoke(null, "https://search.openfoodfacts.org");
        b = path.invoke(b, "/search");
        b = qp.invoke(b, "q", "milk");
        b = qp.invoke(b, "fields", "code,product_name,brands,quantity,image_url");
        b = qp.invoke(b, "page_size", 5);
        String uri = (String) build.invoke(b);

        assertTrue(uri.startsWith("https://search.openfoodfacts.org/search?"),
                "Поиск должен идти через Search-a-licious: " + uri);
        assertFalse(uri.contains("search.pl"), "Старый /cgi/search.pl закрыт OFF (503) — использовать запрещено");
        assertFalse(uri.contains("search_terms"), "search_terms в v2 игнорируется — параметр запрещён");
        assertFalse(uri.contains("user_id"), "GET-запрос поиска не должен содержать user_id");
        assertFalse(uri.contains("password"), "GET-запрос поиска не должен содержать password");
        assertTrue(uri.contains("q=milk"));
        assertTrue(uri.contains("page_size=5"));
    }

    @Test
    void providerSourceUsesSearchServiceAndHeaderAuthOnly() {
        // Fix-11 (страховка от регрессии): поиск — Search-a-licious; старые
        // эндпоинты и query-авторизация запрещены; учётка — только заголовком.
        try {
            java.nio.file.Path src = java.nio.file.Path.of(
                    "src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            if (!java.nio.file.Files.exists(src)) {
                src = java.nio.file.Path.of(
                        "backend/src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            }
            String code = java.nio.file.Files.readString(src);
            // проверяем именно СТРОКОВЫЕ ЛИТЕРАЛЫ (упоминания в javadoc/комментариях
            // допустимы — они документируют запрет)
            assertFalse(code.contains("\"/cgi/search.pl\""),
                    "Старый эндпоинт /cgi/search.pl закрыт OFF — в коде его быть не должно");
            assertFalse(code.contains("\"/api/v2/search\""),
                    "/api/v2/search игнорирует search_terms (full-text в v2 нет) — для поиска запрещён");
            assertFalse(code.contains("queryParam(\"user_id\""),
                    "Авторизация query-параметром user_id запрещена (дока OFF: только POST/PUT/DELETE)");
            assertFalse(code.contains("queryParam(\"password\""),
                    "Авторизация query-параметром password запрещена");
            assertTrue(code.contains("\"/search\""), "Поиск — через GET /search (Search-a-licious)");
            assertTrue(code.contains("search.openfoodfacts.org"),
                    "Дефолтный поисковый хост — search.openfoodfacts.org");
            assertTrue(code.contains("basicAuthHeader"), "Учётка OFF — заголовком Basic Auth");
        } catch (java.io.IOException e) {
            fail("Не удалось прочитать исходник провайдера: " + e.getMessage());
        }
    }

    @Test
    void parseSearchHitsHandlesRealSearchALiciousShape() throws Exception {
        // Fix-11: реальный формат Search-a-licious (проверено живым запросом 27.10):
        // {hits:[{code, product_name, brands:[...], quantity, image_url}], count, ...}
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        com.fasterxml.jackson.databind.JsonNode response = om.readTree("""
                {
                  "hits": [
                    {"code": "5000316000256",
                     "product_name": "Moo Milk chocolate flavoured",
                     "brands": ["Moo Milk", "SODIPOL"],
                     "quantity": "1l",
                     "image_url": "https://images.openfoodfacts.org/img/front_en.jpg"},
                    {"code": "1", "product_name": "Без бренда", "brands": []},
                    {"product_name": "Без кода — пропускается"},
                    {"code": "2"}
                  ],
                  "count": 2, "page": 1, "page_size": 4
                }
                """);
        List<ExternalProductDto> parsed = OpenFoodFactsProvider.parseSearchHits(response);
        assertEquals(2, parsed.size(), "Позиции без code/name пропускаются");

        ExternalProductDto milk = parsed.get(0);
        assertEquals("5000316000256", milk.code());
        assertEquals("Moo Milk chocolate flavoured", milk.name());
        assertEquals("Moo Milk, SODIPOL", milk.brand(), "brands[] — join через ', '");
        assertEquals("https://images.openfoodfacts.org/img/front_en.jpg", milk.imageUrl());
        // quantity "1l" → 1 L (базовая единица)
        assertThat(milk.packAmount()).isEqualByComparingTo("1");
        assertEquals("L", milk.packUnit());

        ExternalProductDto noBrand = parsed.get(1);
        assertNull(noBrand.brand(), "Пустой brands[] → null");
        assertNull(noBrand.imageUrl());
    }

    @Test
    void parseSearchHitsIsGracefulOnGarbage() throws Exception {
        assertTrue(OpenFoodFactsProvider.parseSearchHits(null).isEmpty());
        com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
        // v2-ответ (products, не hits) больше не парсим — поиск ходит в Search-a-licious
        assertTrue(OpenFoodFactsProvider.parseSearchHits(
                om.readTree("{\"products\":[{\"code\":\"1\",\"product_name\":\"x\"}]}")).isEmpty());
        assertTrue(OpenFoodFactsProvider.parseSearchHits(om.readTree("{}")).isEmpty());
    }

    @Test
    void providerSupportsProductInfoUpdates() {
        assertTrue(ProductInfoProvider.class.isAssignableFrom(OpenFoodFactsProvider.class),
                "U11: провайдер должен поддерживать обновление карточек (ProductInfoProvider)");
    }

    @Test
    void fetchPricesReturnsEmptyWhenPricesUrlNotConfigured() {
        // Plain new без Spring: @Value-поля null — prices-url не настроен.
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        List<ExternalPriceDto> prices = assertDoesNotThrow(
                () -> provider.fetchPrices("3017620422003", LocalDate.now().minusMonths(1)));
        assertTrue(prices.isEmpty(),
                "Без настроенного prices-url fetchPrices обязан возвращать пустой список");
    }

    @Test
    void fetchPricesReturnsEmptyForBlankCode() {
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        assertTrue(provider.fetchPrices(null, null).isEmpty());
        assertTrue(provider.fetchPrices("  ", null).isEmpty());
    }

    @Test
    void fetchPricesIsGracefulWhenNetworkUnavailable() throws Exception {
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        setStringField(provider, "pricesUrl", DEAD_URL);
        List<ExternalPriceDto> prices = assertDoesNotThrow(
                () -> provider.fetchPrices("3017620422003", LocalDate.now().minusMonths(1)));
        assertTrue(prices.isEmpty(),
                "При недоступной сети fetchPrices обязан вернуть пустой список, а не исключение");
    }

    @Test
    void fetchProductInfoIsGracefulWhenNetworkUnavailable() throws Exception {
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        setStringField(provider, "productsUrl", DEAD_URL);
        var info = assertDoesNotThrow(() -> provider.fetchProductInfo("3017620422003"));
        assertTrue(info.isEmpty(),
                "При недоступной сети fetchProductInfo обязан вернуть empty, а не исключение");
    }

    @Test
    void fetchProductInfoReturnsEmptyForBlankCode() {
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        assertTrue(provider.fetchProductInfo(null).isEmpty());
        assertTrue(provider.fetchProductInfo("  ").isEmpty());
    }

    @Test
    void throttleDoesNotSleepForeverAndReleasesPermit() throws Exception {
        // Регрессия (U11): acquireSearchSlot раньше считал ожидание как
        // (прошло − интервал): при lastSearchAt = EPOCH первый вызов уходил
        // в сон ~56 лет, а permit не возвращался в семафор (deadlock на втором).
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        Method acquire = OpenFoodFactsProvider.class.getDeclaredMethod("acquireSearchSlot");
        acquire.setAccessible(true);
        Field lastSearchAt = OpenFoodFactsProvider.class.getDeclaredField("lastSearchAt");
        lastSearchAt.setAccessible(true);

        // Первый вызов (lastSearchAt = EPOCH) — без многолетнего сна.
        assertTimeoutPreemptively(Duration.ofSeconds(5), () -> {
            long start = System.nanoTime();
            acquire.invoke(provider);
            assertThat((System.nanoTime() - start) / 1_000_000)
                    .as("Первый вызов acquireSearchSlot не должен спать")
                    .isLessThan(1000);
        });

        // Второй вызов: отодвигаем lastSearchAt в прошлое, чтобы не ждать
        // реальные 6.5 с; без release пермита invoke() заблокировался бы навсегда.
        lastSearchAt.set(provider, Instant.now().minusSeconds(60));
        assertTimeoutPreemptively(Duration.ofSeconds(5), () -> {
            long start = System.nanoTime();
            acquire.invoke(provider);
            assertThat((System.nanoTime() - start) / 1_000_000)
                    .as("Второй вызов не должен виснуть — permit возвращается в семафор")
                    .isLessThan(1000);
        });
    }

    @Test
    void credentialsAreOptionalAndNeverLeakToStrings() throws Exception {
        // Fix-9: учётка ОПЦИОНАЛЬНА (анонимный режим — без неё), а её значения
        // не должны попадать в логи/исключения: toString провайдера не содержит
        // пароль, logConfig логирует только режим (auth: anonymous/OFF account).
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider(new ExchangeRateService());
        setStringField(provider, "offUserId", "user@mail.com");
        setStringField(provider, "offPassword", "s3cret");
        String repr = String.valueOf(provider);
        assertFalse(repr.contains("s3cret"), "Пароль не должен попадать в toString");
        // без учётки basicAuthHeader -> null (анонимный режим остаётся рабочим)
        assertNull(OpenFoodFactsProvider.basicAuthHeader(null, null));
    }

    private static void setStringField(Object target, String name, String value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
