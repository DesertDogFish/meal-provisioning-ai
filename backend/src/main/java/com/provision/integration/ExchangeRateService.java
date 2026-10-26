package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * Курсы валют к рублю по ежедневным данным ЦБ РФ (fix U11).
 *
 * Open Prices (prices.openfoodfacts.org) отдаёт краудсорсинговые цены в валюте
 * магазина (чаще EUR/USD). Локальная база цен хранит только RUB, поэтому перед
 * записью цена конвертируется: rate = Value / Nominal из daily_json.js ЦБ РФ
 * (для RUB курс всегда 1).
 *
 * Поведение:
 * 1. Кэш на календарные сутки: первый вызов rateToRub(не RUB) за день тянет
 *    daily_json.js, остальные берут значения из памяти.
 * 2. Graceful degradation: если ЦБ недоступен — используется предыдущий кэш;
 *    если кэша нет — rateToRub возвращает null, и вызывающий код пропускает
 *    цену в неизвестной валюте (вместо падения всей синхронизации).
 * 3. Парсинг вынесен в чистый статический {@link #parseCbrRates(String)} —
 *    тестируется без сети.
 */
@Service
@Slf4j
public class ExchangeRateService {

    static final String DEFAULT_CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Точность промежуточного курса; итоговая цена всё равно округляется до копеек. */
    private static final int RATE_SCALE = 10;

    private final RestClient restClient;

    @Value("${integration.cbr.url:" + DEFAULT_CBR_URL + "}")
    private String cbrUrl = DEFAULT_CBR_URL;

    /** Кэш курсов: CharCode -> курс за 1 единицу валюты в RUB. RUB всегда присутствует. */
    private volatile Map<String, BigDecimal> rates = Map.of("RUB", BigDecimal.ONE);

    /** Дата (локальная), на которую кэш актуален; null — ещё не загружали. */
    private volatile LocalDate ratesDate = null;

    public ExchangeRateService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * Курс валюты к RUB (за 1 единицу), либо null, если курс неизвестен
     * (валюта вне справочника ЦБ или справочник не удалось загрузить).
     */
    public BigDecimal rateToRub(String currency) {
        if (currency == null || currency.isBlank()) {
            return null;
        }
        String code = currency.trim().toUpperCase();
        if ("RUB".equals(code)) {
            return BigDecimal.ONE;
        }
        ensureFresh();
        return rates.get(code);
    }

    /** Подтягивает daily_json.js, если кэш старше текущей даты. Ошибки не пробрасывает. */
    private synchronized void ensureFresh() {
        LocalDate today = LocalDate.now();
        if (today.equals(ratesDate)) {
            return;
        }
        try {
            String body = restClient.get()
                    .uri(cbrUrl)
                    .retrieve()
                    .body(String.class);
            Map<String, BigDecimal> parsed = parseCbrRates(body);
            if (!parsed.isEmpty()) {
                rates = parsed;
                ratesDate = today;
                log.info("CBR exchange rates loaded for {}: {} currencies", today, parsed.size());
            } else {
                log.warn("CBR response contained no usable rates; keeping previous cache");
            }
        } catch (Exception e) {
            log.warn("Failed to load CBR exchange rates from {} ({}); falling back to cache",
                    cbrUrl, e.getMessage());
        }
    }

    /**
     * Чистый парсер ответа daily_json.js: {@code {"Valute":{"USD":{"Nominal":1,"Value":80.5381,...}}}}.
     * Курс = Value / Nominal (у некоторых валют Nominal = 10/100). RUB добавляется
     * принудительно со значением 1. При любой ошибке разбора — пустая карта
     * (вызывающий код сохраняет старый кэш).
     */
    static Map<String, BigDecimal> parseCbrRates(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = MAPPER.readTree(json);
            JsonNode valute = root.get("Valute");
            if (valute == null || !valute.isObject()) {
                return Map.of();
            }
            Map<String, BigDecimal> result = new HashMap<>();
            result.put("RUB", BigDecimal.ONE);
            var fields = valute.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                JsonNode v = entry.getValue();
                JsonNode valueNode = v.get("Value");
                if (valueNode == null || !valueNode.isNumber()) {
                    continue;
                }
                BigDecimal value = valueNode.decimalValue();
                JsonNode nominalNode = v.get("Nominal");
                BigDecimal nominal = nominalNode != null && nominalNode.isNumber()
                        && nominalNode.decimalValue().signum() > 0
                        ? nominalNode.decimalValue()
                        : BigDecimal.ONE;
                String charCode = v.hasNonNull("CharCode") ? v.get("CharCode").asText() : entry.getKey();
                if (charCode != null && !charCode.isBlank()) {
                    result.put(charCode.trim().toUpperCase(),
                            value.divide(nominal, RATE_SCALE, RoundingMode.HALF_UP));
                }
            }
            // Valute был, но ни одной валюты не распознано — считаем ответ мусорным.
            return result.size() > 1 ? Map.copyOf(result) : Map.of();
        } catch (Exception e) {
            return Map.of();
        }
    }
}
