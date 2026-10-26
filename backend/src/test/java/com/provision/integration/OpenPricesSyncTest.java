package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Юнит-тесты fix U11: синхронизация цен из Open Prices (prices.openfoodfacts.org)
 * с конвертацией в RUB по ежедневным курсам ЦБ РФ.
 *
 * Все парсеры — чистые функции (без HTTP): buildPricesUri, parsePricesResponse,
 * ExchangeRateService.parseCbrRates. Сетевая graceful-проверка использует
 * недостижимый адрес 127.0.0.1:9 (connection refused срабатывает мгновенно).
 */
@DisplayName("U11: Open Prices → RUB + курсы ЦБ РФ")
class OpenPricesSyncTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** EUR → 80, RUB → 1, остальное неизвестно (null). */
    private static final Function<String, BigDecimal> RATES = currency -> switch (currency) {
        case "EUR" -> new BigDecimal("80");
        case "RUB" -> BigDecimal.ONE;
        default -> null;
    };

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new AssertionError("Тестовый JSON невалиден: " + e.getMessage(), e);
        }
    }

    // ---------- parsePricesResponse ----------

    @Test
    @DisplayName("Цена в EUR конвертируется в RUB по курсу (2.5 × 80 = 200.00)")
    void eurPriceConvertedToRub() {
        JsonNode response = json("""
                {"items":[{"price":2.5,"currency":"EUR","date":"2026-10-01",
                            "product_code":"3017620422003"}]}
                """);
        List<ExternalPriceDto> prices =
                OpenFoodFactsProvider.parsePricesResponse(response, RATES);

        assertThat(prices).hasSize(1);
        ExternalPriceDto p = prices.get(0);
        assertThat(p.code()).isEqualTo("3017620422003");
        assertThat(p.price()).isEqualByComparingTo(new BigDecimal("200.00"));
        assertThat(p.currency()).isEqualTo("RUB");
        assertThat(p.date()).isEqualTo(LocalDate.of(2026, 10, 1));
    }

    @Test
    @DisplayName("Цена в RUB проходит без изменения (курс 1)")
    void rubPricePassesThrough() {
        JsonNode response = json("""
                {"items":[{"price":149.99,"currency":"RUB","date":"2026-10-02",
                            "product_code":"4600000000001"}]}
                """);
        List<ExternalPriceDto> prices =
                OpenFoodFactsProvider.parsePricesResponse(response, RATES);

        assertThat(prices).hasSize(1);
        assertThat(prices.get(0).price()).isEqualByComparingTo(new BigDecimal("149.99"));
        assertThat(prices.get(0).currency()).isEqualTo("RUB");
    }

    @Test
    @DisplayName("Валюта без курса ЦБ пропускается, остальные цены сохраняются")
    void unknownCurrencySkippedOthersKept() {
        JsonNode response = json("""
                {"items":[
                  {"price":2.5,"currency":"EUR","date":"2026-10-01","product_code":"A"},
                  {"price":149.99,"currency":"RUB","date":"2026-10-02","product_code":"B"},
                  {"price":3.0,"currency":"USD","date":"2026-10-03","product_code":"C"}
                ]}
                """);
        List<ExternalPriceDto> prices =
                OpenFoodFactsProvider.parsePricesResponse(response, RATES);

        assertThat(prices).hasSize(2)
                .extracting(ExternalPriceDto::code)
                .containsExactly("A", "B");
    }

    @Test
    @DisplayName("Битые элементы пропускаются: цена ≤ 0, нет полей, непарсящаяся дата")
    void malformedItemsSkipped() {
        JsonNode response = json("""
                {"items":[
                  {"price":-5,"currency":"RUB","date":"2026-10-01","product_code":"NEG"},
                  {"price":0,"currency":"RUB","date":"2026-10-01","product_code":"ZERO"},
                  {"currency":"RUB","date":"2026-10-01","product_code":"NOPRICE"},
                  {"price":10,"date":"2026-10-01","product_code":"NOCUR"},
                  {"price":10,"currency":"RUB","product_code":"NODATE"},
                  {"price":10,"currency":"RUB","date":"31.12.2026","product_code":"BADDATE"},
                  {"price":"десять","currency":"RUB","date":"2026-10-01","product_code":"STRPRICE"},
                  {"price":99.90,"currency":"RUB","date":"2026-10-05T12:30:00","product_code":"OK"}
                ]}
                """);
        List<ExternalPriceDto> prices =
                OpenFoodFactsProvider.parsePricesResponse(response, RATES);

        assertThat(prices).hasSize(1);
        assertThat(prices.get(0).code()).isEqualTo("OK");
        assertThat(prices.get(0).date()).isEqualTo(LocalDate.of(2026, 10, 5));
        assertThat(prices.get(0).price()).isEqualByComparingTo(new BigDecimal("99.90"));
    }

    @Test
    @DisplayName("Пустые/мусорные ответы дают пустой список (null, {}, items-строка)")
    void garbageResponsesGiveEmptyList() {
        assertThat(OpenFoodFactsProvider.parsePricesResponse(null, RATES)).isEmpty();
        assertThat(OpenFoodFactsProvider.parsePricesResponse(json("{}"), RATES)).isEmpty();
        assertThat(OpenFoodFactsProvider.parsePricesResponse(
                json("{\"items\":\"oops\"}"), RATES)).isEmpty();
        assertThat(OpenFoodFactsProvider.parsePricesResponse(
                json("{\"items\":[]}"), RATES)).isEmpty();
    }

    // ---------- buildPricesUri ----------

    @Test
    @DisplayName("URI Open Prices: product_code, order_by=-date, size; date_gte только при since")
    void pricesUriContainsRequiredParams() {
        String withoutSince = OpenFoodFactsProvider.buildPricesUri(
                "https://prices.openfoodfacts.org", "3017620422003", null, 10);
        assertThat(withoutSince)
                .startsWith("https://prices.openfoodfacts.org/api/v1/prices?")
                .contains("product_code=3017620422003")
                .contains("order_by=-date")
                .contains("size=10")
                .doesNotContain("date_gte");

        String withSince = OpenFoodFactsProvider.buildPricesUri(
                "https://prices.openfoodfacts.org", "3017620422003",
                LocalDate.of(2026, 9, 1), 10);
        assertThat(withSince).contains("date_gte=2026-09-01");
    }

    // ---------- ExchangeRateService.parseCbrRates ----------

    @Test
    @DisplayName("daily_json.js: USD (Nominal 1) и HUF (Nominal 100) → курс за единицу, RUB = 1")
    void cbrRatesValueDividedByNominal() {
        Map<String, BigDecimal> rates = ExchangeRateService.parseCbrRates("""
                {"Date":"2026-10-26T11:30:00+03:00","PreviousDate":"2026-10-25T11:30:00+03:00",
                 "Valute":{
                   "R01235":{"ID":"R01235","NumCode":"840","CharCode":"USD","Nominal":1,
                              "Name":"Доллар США","Value":80.5381,"Previous":80.1234},
                   "R01135":{"ID":"R01135","NumCode":"348","CharCode":"HUF","Nominal":100,
                              "Name":"Венгерский форинт","Value":22.2247,"Previous":22.1111}
                 }}
                """);

        assertThat(rates)
                .containsEntry("RUB", BigDecimal.ONE)
                .containsKey("USD")
                .containsKey("HUF");
        assertThat(rates.get("USD")).isEqualByComparingTo(new BigDecimal("80.5381"));
        assertThat(rates.get("HUF")).isEqualByComparingTo(new BigDecimal("0.222247"));
    }

    @Test
    @DisplayName("Мусор вместо daily_json.js → пустая карта (сохраняется предыдущий кэш)")
    void cbrGarbageGivesEmptyMap() {
        assertThat(ExchangeRateService.parseCbrRates(null)).isEmpty();
        assertThat(ExchangeRateService.parseCbrRates("")).isEmpty();
        assertThat(ExchangeRateService.parseCbrRates("не json")).isEmpty();
        assertThat(ExchangeRateService.parseCbrRates("{\"PreviousDate\":\"x\"}")).isEmpty();
        assertThat(ExchangeRateService.parseCbrRates("{\"Valute\":{}}")).isEmpty();
        // Valute есть, но ни одной валюты с числовым Value — ответ мусорный.
        assertThat(ExchangeRateService.parseCbrRates(
                "{\"Valute\":{\"USD\":{\"CharCode\":\"USD\"}}}")).isEmpty();
    }

    // ---------- ExchangeRateService.rateToRub (без сети / с мёртвым URL) ----------

    @Test
    @DisplayName("RUB → 1 всегда, офлайн и без обращения к ЦБ; null/blank → null")
    void rubRateIsOneOffline() {
        ExchangeRateService service = new ExchangeRateService();
        assertThat(service.rateToRub("RUB")).isEqualByComparingTo(BigDecimal.ONE);
        assertThat(service.rateToRub("rub")).isEqualByComparingTo(BigDecimal.ONE);
        assertThat(service.rateToRub(null)).isNull();
        assertThat(service.rateToRub("  ")).isNull();
    }

    @Test
    @DisplayName("ЦБ недоступен → rateToRub(не RUB) = null без исключения (цена пропускается)")
    void unknownCurrencyRateIsNullWhenCbrUnreachable() throws Exception {
        ExchangeRateService service = new ExchangeRateService();
        Field cbrUrl = ExchangeRateService.class.getDeclaredField("cbrUrl");
        cbrUrl.setAccessible(true);
        cbrUrl.set(service, "http://127.0.0.1:9");

        assertThat(assertDoesNotThrow(() -> service.rateToRub("USD"))).isNull();
    }
}
