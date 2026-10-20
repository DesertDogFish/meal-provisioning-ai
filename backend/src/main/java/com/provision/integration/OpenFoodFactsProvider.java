package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
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

    public OpenFoodFactsProvider() {
        this.restClient = RestClient.builder()
                .defaultHeader("User-Agent", "Provision/1.0 (admin@provision.app)")
                .build();
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
            return ConnectionStatus.available();
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
            String url = productsUrl + "/cgi/search.pl?search_simple=1&action=process&json=1"
                    + "&page_size=" + limit
                    + "&fields=code,product_name,brands,quantity,image_url"
                    + "&search_terms=" + encodedQuery;

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
            log.error("Failed to search products: {}", e.getMessage());
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
