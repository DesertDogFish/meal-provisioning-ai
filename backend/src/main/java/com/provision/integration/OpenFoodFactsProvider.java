package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.provision.exception.IntegrationAuthException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
public class OpenFoodFactsProvider implements PriceProvider {

    private final RestClient restClient;

    @Value("${integration.off.products-url:https://world.openfoodfacts.org}")
    private String productsUrl;

    @Value("${integration.off.prices-url:https://prices.openfoodfacts.org}")
    private String pricesUrl;

    // Учётная запись на world.openfoodfacts.org для обхода лимитов анонимных
    // запросов (503/429). Пустые значения => анонимный режим.
    // Значения приходят только из ENV (OFF_USER_ID / OFF_PASSWORD), не из git.
    @Value("${integration.off.user-id:${OFF_USER_ID:}}")
    private String offUserId;

    @Value("${integration.off.password:${OFF_PASSWORD:}}")
    private String offPassword;

    public OpenFoodFactsProvider() {
        this.restClient = RestClient.builder()
                .defaultHeader("User-Agent", "Provision/1.0 (admin@provision.app)")
                .build();
    }

    private boolean hasCredentials() {
        return StringUtils.hasText(offUserId) && StringUtils.hasText(offPassword);
    }

    /**
     * Добавляет user_id/password к query, если креды заданы.
     * Ручное склейвание строк с URLEncoder убрано: оно ломало передачу
     * пароля со спецсимволами (#/@) — OFF отвечал 403.
     */
    private UriComponentsBuilder withAuth(UriComponentsBuilder builder) {
        if (hasCredentials()) {
            builder.queryParam("user_id", offUserId)
                   .queryParam("password", offPassword);
        }
        return builder;
    }

    /**
     * Безопасная сборка URI. build()+encode() НЕ подходит: Spring считает
     * '@' разрешённым символом QUERY_PARAM и оставляет его в пароле как есть,
     * из-за чего OFF не добирает креды (403). Поэтому значения кодируются
     * явно через URLEncoder (%23 для #, %40 для @), а URI собирается
     * build(true) без двойного кодирования ('%' — валидный символ query).
     */
    private URI buildUri(UriComponentsBuilder builder) {
        String base = builder.toUriString().split("\\?")[0];
        UriComponentsBuilder encoded = UriComponentsBuilder.fromUriString(base);
        builder.build().getQueryParams().forEach((key, values) ->
                values.forEach(v -> encoded.queryParam(key, encodeQueryValue(v))));
        return encoded.build(true).toUri();
    }

    private static String encodeQueryValue(String value) {
        try {
            // application/x-www-form-urlencoded: пробел -> '+', остальные
            // спецсимволы -> percent-encoding. Для email/пароля/кириллицы — то,
            // что ожидает OFF (совпадает с --data-urlencode в curl).
            return java.net.URLEncoder.encode(value, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encode query param", e);
        }
    }

    @PostConstruct
    void logAuthMode() {
        if (hasCredentials()) {
            log.info("Open Food Facts provider running in AUTHENTICATED mode (user: {})",
                    offUserId.replaceAll("(^.).*(@.*)", "$1***$2"));
        } else {
            log.warn("OFF credentials not set, running in anonymous mode");
        }
    }

    /**
     * Формирует человекочитаемое сообщение о сбое внешнего API OFF
     * (5xx/429) с учётом наличия учётных записей.
     */
    private String describeOffFailure(HttpStatusCodeException e) {
        int status = e.getStatusCode().value();
        boolean rateLimited = status == 503 || status == 429;

        if (rateLimited && !hasCredentials()) {
            return "Open Food Facts отклонил анонимный запрос (" + status
                    + "). Требуется регистрация на world.openfoodfacts.org и настройка"
                    + " OFF_USER_ID/OFF_PASSWORD.";
        }
        if (rateLimited) {
            return "Сервис Open Food Facts временно перегружен (" + status
                    + "), попробуйте позже.";
        }
        return "Open Food Facts недоступен: HTTP " + status;
    }

    /**
     * Единая обработка HTTP-ошибок OFF:
     * 401/403 при переданных кредах — понятная ошибка учётной записи
     * (IntegrationAuthException -> 502 для клиента, а не 500);
     * прочие статусы — человекочитаемое описание.
     */
    private RuntimeException toOffException(HttpStatusCodeException e) {
        int status = e.getStatusCode().value();
        if ((status == 401 || status == 403) && hasCredentials()) {
            log.error("OFF Auth failed despite credentials present (HTTP {})", status);
            return new IntegrationAuthException(
                    "Open Food Facts отклонил авторизацию учётной записи (HTTP " + status
                            + "). Проверьте OFF_USER_ID/OFF_PASSWORD.", e);
        }
        if (status == 401 || status == 403) {
            return new IntegrationAuthException(
                    "Open Food Facts требует авторизацию (HTTP " + status
                            + "). Настройте OFF_USER_ID/OFF_PASSWORD.", e);
        }
        return new RuntimeException(describeOffFailure(e), e);
    }

    @Override
    public String code() {
        return "OFF";
    }

    @Override
    public ConnectionStatus testConnection() {
        try {
            restClient.get()
                    .uri(pricesUrl + "/api/v1/prices?size=1")
                    .retrieve()
                    .toBodilessEntity();
            return ConnectionStatus.success();
        } catch (Exception e) {
            log.error("Failed to connect to Open Food Facts: {}", e.getMessage());
            return ConnectionStatus.error(e.getMessage());
        }
    }

    @Override
    public List<ExternalProductDto> searchProducts(String query, int limit) {
        List<ExternalProductDto> results = new ArrayList<>();
        try {
            // build(true): строгий percent-encoding значений, включая # и @
            // в пароле (см. buildUri) — иначе OFF отвечает 403.
            URI uri = buildUri(withAuth(UriComponentsBuilder.fromUriString(productsUrl)
                    .path("/cgi/search.pl")
                    .queryParam("search_simple", 1)
                    .queryParam("action", "process")
                    .queryParam("json", 1)
                    .queryParam("page_size", limit)
                    .queryParam("fields", "code,product_name,brands,quantity,image_url")
                    .queryParam("search_terms", query)));

            JsonNode response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(JsonNode.class);

            if (response != null && response.has("products")) {
                for (JsonNode product : response.get("products")) {
                    String code = product.has("code") ? product.get("code").asText() : null;
                    String name = product.has("product_name") ? product.get("product_name").asText() : null;
                    String brand = product.has("brands") ? product.get("brands").asText() : null;
                    String quantity = product.has("quantity") ? product.get("quantity").asText() : null;
                    String imageUrl = product.has("image_url") ? product.get("image_url").asText() : null;

                    if (code != null && name != null) {
                        PackInfo packInfo = parseQuantity(quantity);
                        results.add(new ExternalProductDto(
                                code,
                                name,
                                brand,
                                packInfo.amount(),
                                packInfo.unit(),
                                imageUrl
                        ));
                    }
                }
            }
        } catch (HttpStatusCodeException e) {
            RuntimeException mapped = toOffException(e);
            log.error("Failed to search products: {}", mapped.getMessage());
            throw mapped;
        } catch (Exception e) {
            String reason = "Open Food Facts недоступен: " + e.getMessage();
            log.error("Failed to search products: {}", reason);
            throw new RuntimeException(reason, e);
        }
        return results;
    }

    @Override
    public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
        List<ExternalPriceDto> results = new ArrayList<>();
        try {
            URI uri = buildUri(UriComponentsBuilder.fromUriString(pricesUrl)
                    .path("/api/v1/prices")
                    .queryParam("product_code", externalCode)
                    .queryParam("order_by", "-date")
                    .queryParam("size", 20));

            JsonNode response = restClient.get()
                    .uri(uri)
                    .retrieve()
                    .body(JsonNode.class);

            if (response != null && response.has("prices")) {
                for (JsonNode priceNode : response.get("prices")) {
                    String code = priceNode.has("product_code") ? priceNode.get("product_code").asText() : null;
                    BigDecimal price = priceNode.has("price") ? priceNode.get("price").decimalValue() : null;
                    String currency = priceNode.has("currency") ? priceNode.get("currency").asText() : null;
                    Long dateEpoch = priceNode.has("date") ? priceNode.get("date").asLong() : null;

                    if (code != null && price != null && currency != null && dateEpoch != null) {
                        LocalDate date = Instant.ofEpochSecond(dateEpoch)
                                .atZone(ZoneId.systemDefault())
                                .toLocalDate();

                        if (since == null || !date.isBefore(since)) {
                            results.add(new ExternalPriceDto(code, price, currency, date));
                        }
                    }
                }
            }
        } catch (HttpStatusCodeException e) {
            // Цены OFF — второстепенный источник: не роняем синхронизацию,
            // но 401/403 логируем отдельно как проблему авторизации.
            if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403) {
                log.error("OFF prices API auth rejected (HTTP {}) for code {}",
                        e.getStatusCode().value(), externalCode);
            } else {
                log.error("Failed to fetch prices for code {}: HTTP {}",
                        externalCode, e.getStatusCode().value());
            }
        } catch (Exception e) {
            log.error("Failed to fetch prices for code {}: {}", externalCode, e.getMessage());
        }
        return results;
    }

    private PackInfo parseQuantity(String quantity) {
        if (quantity == null || quantity.isEmpty()) {
            return new PackInfo(null, null);
        }

        // Pattern: "900 g", "1.5 kg", "1 L", "500 ml", "6 pcs"
        Pattern pattern = Pattern.compile("([0-9.,]+)\\s*([a-zA-Z]+)");
        Matcher matcher = pattern.matcher(quantity);

        if (matcher.find()) {
            String amountStr = matcher.group(1).replace(",", ".");
            String unitStr = matcher.group(2).toLowerCase();

            try {
                BigDecimal amount = new BigDecimal(amountStr);
                String unit = normalizeUnit(unitStr, amount);

                // Convert to base units (KG, L, PCS)
                if (unit.equals("g")) {
                    amount = amount.divide(BigDecimal.valueOf(1000));
                    unit = "KG";
                } else if (unit.equals("kg")) {
                    unit = "KG";
                } else if (unit.equals("ml")) {
                    amount = amount.divide(BigDecimal.valueOf(1000));
                    unit = "L";
                } else if (unit.equals("l")) {
                    unit = "L";
                } else if (unit.equals("pcs") || unit.equals("шт")) {
                    unit = "PCS";
                }

                return new PackInfo(amount, unit);
            } catch (NumberFormatException e) {
                log.warn("Failed to parse quantity: {}", quantity);
            }
        }

        return new PackInfo(null, null);
    }

    private String normalizeUnit(String unit, BigDecimal amount) {
        if (unit.equals("g") || unit.equals("gr") || unit.equals("gram") || unit.equals("grams")) {
            return "g";
        } else if (unit.equals("kg") || unit.equals("kilo") || unit.equals("kilos")) {
            return "kg";
        } else if (unit.equals("ml") || unit.equals("milliliter") || unit.equals("milliliters")) {
            return "ml";
        } else if (unit.equals("l") || unit.equals("liter") || unit.equals("liters")) {
            return "l";
        } else if (unit.equals("pcs") || unit.equals("шт") || unit.equals("piece") || unit.equals("pieces")) {
            return "pcs";
        }
        return unit;
    }

    private record PackInfo(BigDecimal amount, String unit) {}
}
