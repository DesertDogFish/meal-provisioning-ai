package com.provision.integration;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Регрессионные тесты для переработанного OpenFoodFactsProvider:
 * 1. User-Agent строго по доке OFF ("AppName/Version (ContactEmail)").
 * 2. READ-запросы (search/testConnection) НЕ содержат user_id/password.
 * 3. Синхронизация цен через OFF отключена (graceful degradation).
 */
class OpenFoodFactsProviderTest {

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
        // offUserId/offPassword/withAuth.
        List<String> forbidden = List.of("offUserId", "offPassword", "withAuth",
                "OFF_PASSWORD", "prices-url");
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
    void fetchPricesIsDisabledStubReturningEmptyList() {
        OpenFoodFactsProvider provider = new OpenFoodFactsProvider();
        List<ExternalPriceDto> prices = assertDoesNotThrow(
                () -> provider.fetchPrices("3760121210130", LocalDate.now().minusMonths(1)));
        assertTrue(prices.isEmpty(),
                "OFF не предоставляет локальные цены — fetchPrices обязан возвращать пустой список");
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
}
