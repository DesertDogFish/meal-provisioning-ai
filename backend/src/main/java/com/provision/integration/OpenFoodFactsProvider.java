package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
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
     * Добавляет user_id/password к query-string, если креды заданы.
     * Спецсимволы в email/пароле обязательно URL-кодируются.
     */
    private String appendAuthParams(StringBuilder urlBuilder) {
        if (hasCredentials()) {
            urlBuilder.append("&user_id=").append(URLEncoder.encode(offUserId, StandardCharsets.UTF_8));
            urlBuilder.append("&password=").append(URLEncoder.encode(offPassword, StandardCharsets.UTF_8));
        }
        return urlBuilder.toString();
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
    private String describeOffFailure(Exception e) {
        int status = -1;
        if (e instanceof HttpServerErrorException hse) {
            status = hse.getStatusCode().value();
        } else if (e instanceof org.springframework.web.client.HttpStatusCodeException hce) {
            status = hce.getStatusCode().value();
        }
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
        return "Open Food Facts недоступен: " + e.getMessage();
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
            String encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
            StringBuilder urlBuilder = new StringBuilder(productsUrl)
                    .append("/cgi/search.pl?search_simple=1&action=process&json=1")
                    .append("&page_size=").append(limit)
                    .append("&fields=code,product_name,brands,quantity,image_url")
                    .append("&search_terms=").append(encodedQuery);
            String url = appendAuthParams(urlBuilder);

            JsonNode response = restClient.get()
                    .uri(url)
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
        } catch (Exception e) {
            String reason = describeOffFailure(e);
            log.error("Failed to search products: {}", reason);
            throw new RuntimeException(reason, e);
        }
        return results;
    }

    @Override
    public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
        List<ExternalPriceDto> results = new ArrayList<>();
        try {
            String url = pricesUrl + "/api/v1/prices?product_code=" + externalCode
                    + "&order_by=-date&size=20";

            JsonNode response = restClient.get()
                    .uri(url)
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
