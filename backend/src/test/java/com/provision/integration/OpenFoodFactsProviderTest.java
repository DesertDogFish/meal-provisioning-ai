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
 * 1. User-Agent строго по доке OFF ("AppName/Version (ContactEmail)").
 * 2. READ-запросы (search/testConnection) НЕ содержат user_id/password.
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
    void searchRequestUriHasNoAuthParams() throws Exception {
        // Проверяем формируемый URI поиска: только поисковые параметры.
        Class<?> builderClass = Class.forName(
                "com.provision.integration.OpenFoodFactsProvider$UriStringBuilder");
        Method from = builderClass.getDeclaredMethod("from", String.class);
        Method path = builderClass.getDeclaredMethod("path", String.class);
        Method qp = builderClass.getDeclaredMethod("queryParam", String.class, Object.class);
        Method build = builderClass.getDeclaredMethod("build");
        from.setAccessible(true); path.setAccessible(true); qp.setAccessible(true); build.setAccessible(true);

        Object b = from.invoke(null, "https://world.openfoodfacts.org");
        b = path.invoke(b, "/cgi/search.pl");
        b = qp.invoke(b, "search_simple", 1);
        b = qp.invoke(b, "action", "process");
        b = qp.invoke(b, "json", 1);
        b = qp.invoke(b, "page_size", 5);
        b = qp.invoke(b, "fields", "code,product_name,brands,quantity,image_url");
        b = qp.invoke(b, "search_terms", "milk");
        String uri = (String) build.invoke(b);

        assertFalse(uri.contains("user_id"), "GET-запрос поиска не должен содержать user_id");
        assertFalse(uri.contains("password"), "GET-запрос поиска не должен содержать password");
        assertTrue(uri.contains("search_terms=milk"));
        assertTrue(uri.contains("page_size=5"));
    }

    @Test
    void providerClassSourceHasNoCredentialPlumbing() {
        // Страховка от регрессии: в исходнике провайдера больше нет
        // offUserId/offPassword/withAuth. (prices-url больше НЕ запрещён:
        // c fix U11 цены синхронизируются из Open Prices.)
        List<String> forbidden = List.of("offUserId", "offPassword", "withAuth", "OFF_PASSWORD");
        try {
            java.nio.file.Path src = java.nio.file.Path.of(
                    "src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            if (!java.nio.file.Files.exists(src)) {
                src = java.nio.file.Path.of(
                        "backend/src/main/java/com/provision/integration/OpenFoodFactsProvider.java");
            }
            String code = java.nio.file.Files.readString(src);
            for (String s : forbidden) {
                assertFalse(code.contains(s),
                        "В OpenFoodFactsProvider не должно быть упоминаний: " + s);
            }
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
    void testConnectionDoesNotRequireCredentialsAnymore() throws Exception {
        // У провайдера больше нет полей авторизации.
        for (Field f : OpenFoodFactsProvider.class.getDeclaredFields()) {
            assertFalse(f.getName().toLowerCase().contains("password"),
                    "Поле с паролем не должно существовать: " + f.getName());
            assertFalse(f.getName().toLowerCase().contains("userid"),
                    "Поле с user_id не должно существовать: " + f.getName());
        }
    }

    private static void setStringField(Object target, String name, String value) throws Exception {
        Field f = target.getClass().getDeclaredField(name);
        f.setAccessible(true);
        f.set(target, value);
    }
}
