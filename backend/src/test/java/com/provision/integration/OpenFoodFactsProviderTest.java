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
    void userAgentUsesOffAccountEmailWhenConfigured() {
        // Fix-9: контакт в UA — email учётки (рекомендация OFF), иначе дефолт
        assertEquals("ProvisionApp/1.0.0 (user@mail.com)",
                OpenFoodFactsProvider.buildUserAgent("user@mail.com"));
        assertEquals("ProvisionApp/1.0.0 (support@provision.app)",
                OpenFoodFactsProvider.buildUserAgent(null));
        assertEquals("ProvisionApp/1.0.0 (support@provision.app)",
                OpenFoodFactsProvider.buildUserAgent("  "));
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
    void searchRequestUriIsApiV2WithoutAuthParams() throws Exception {
        // Fix-9: проверяем формируемый URI поиска: API v2, только поисковые
        // параметры; user_id/password в строке запроса ЗАПРЕЩЕНЫ (v2 их не
        // принимает; авторизация — заголовком, см. basicAuthHeaderIsBuilt…).
        Class<?> builderClass = Class.forName(
                "com.provision.integration.OpenFoodFactsProvider$UriStringBuilder");
        Method from = builderClass.getDeclaredMethod("from", String.class);
        Method path = builderClass.getDeclaredMethod("path", String.class);
        Method qp = builderClass.getDeclaredMethod("queryParam", String.class, Object.class);
        Method build = builderClass.getDeclaredMethod("build");
        from.setAccessible(true); path.setAccessible(true); qp.setAccessible(true); build.setAccessible(true);

        Object b = from.invoke(null, "https://world.openfoodfacts.org");
        b = path.invoke(b, "/api/v2/search");
        b = qp.invoke(b, "search_terms", "milk");
        b = qp.invoke(b, "fields", "code,product_name,brands,quantity,image_url");
        b = qp.invoke(b, "page_size", 5);
        String uri = (String) build.invoke(b);

        assertTrue(uri.contains("/api/v2/search"), "Поиск должен идти через API v2");
        assertFalse(uri.contains("search.pl"), "Старый /cgi/search.pl закрыт OFF (503) — использовать запрещено");
        assertFalse(uri.contains("user_id"), "GET-запрос поиска не должен содержать user_id");
        assertFalse(uri.contains("password"), "GET-запрос поиска не должен содержать password");
        assertTrue(uri.contains("search_terms=milk"));
        assertTrue(uri.contains("page_size=5"));
    }

    @Test
    void providerSourceUsesV2SearchAndHeaderAuthOnly() {
        // Fix-9 (страховка от регрессии): в исходнике провайдера нет старого
        // эндпоинта и нет авторизации query-параметрами; учётка — только
        // через заголовок (interceptor + basicAuthHeader).
        try {
            java.nio.file.Path src = java.nio.file.Path.of(
                    "src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            if (!java.nio.file.Files.exists(src)) {
                src = java.nio.file.Path.of(
                        "backend/src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            }
            String code = java.nio.file.Files.readString(src);
            // проверяем именно СТРОКОВЫЙ ЛИТЕРАЛ эндпоинта (упоминания в
            // javadoc/комментариях допустимы — они документируют запрет)
            assertFalse(code.contains("\"/cgi/search.pl\""),
                    "Старый эндпоинт /cgi/search.pl закрыт OFF — в коде его быть не должно");
            assertFalse(code.contains("queryParam(\"user_id\""),
                    "Авторизация query-параметром user_id запрещена (v2 её не принимает)");
            assertFalse(code.contains("queryParam(\"password\""),
                    "Авторизация query-параметром password запрещена");
            assertTrue(code.contains("\"/api/v2/search\""), "Поиск — через API v2");
            assertTrue(code.contains("basicAuthHeader"), "Учётка OFF — заголовком Basic Auth");
        } catch (java.io.IOException e) {
            fail("Не удалось прочитать исходник провайдера: " + e.getMessage());
        }
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
