package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Провайдер Open Food Facts.
 *
 * Fix-9 (интеграция, 27.10): приложение стабильно получало 503 «Page
 * temporarily unavailable» — поиск ходил в УСТАРЕВШИЙ эндпоинт
 * {@code /cgi/search.pl}, который OFF закрыл (503 даже с корректным
 * User-Agent). Переведён на {@code GET /api/v2/search} (тот же формат
 * ответа: {products: [...], count, page, ...}).
 *
 * Реализация приведена в соответствие с официальной документацией OFF
 * (https://openfoodfacts.github.io/openfoodfacts-server/api/) и фактической
 * политикой сервиса (2026):
 *
 * 1. Поиск — API v2 ({@code /api/v2/search}); карточка продукта — v2
 *    ({@code /api/v2/product/{code}}).
 *
 * 2. Обязательный User-Agent в формате "AppName/Version (ContactEmail)" —
 *    без него OFF блокирует запросы как ботовые (503). Если настроена учётная
 *    запись OFF, контактом в UA указывается её email (рекомендация OFF).
 *
 * 3. ОПЦИОНАЛЬНАЯ авторизация учёткой OFF (integration.off.user-id/password,
 *    env OFF_USER_ID/OFF_PASSWORD) — HTTP Basic Auth ЗАГОЛОВКОМ (никогда не
 *    query-параметрами: user_id/password в строке запроса v2-API не
 *    аутентифицируют и провоцируют 503). Зарегистрированные пользователи
 *    «не подвержены лимитам запросов и получают приоритетный доступ»
 *    (сообщение самой OFF на странице 503); анонимный поиск жёстко
 *    rate-limit'ится по IP. Без учётки провайдер работает анонимно.
 *
 * 4. Клиентский rate limiting: поиск ограничен 10 запросами в минуту на IP,
 *    поэтому вызовы сериализуются семафором + паузой ~6.5 c между запросами.
 *
 * 5. Обработка 429/503: WARN-логирование, экспоненциальный backoff
 *    (с учётом заголовка Retry-After, если он есть), максимум 3 повтора;
 *    при финальном провале — graceful degradation (пустой список вместо
 *    исключения).
 *
 * 6. Цены (fix U11): прайсы берутся из проекта Open Prices
 *    (https://prices.openfoodfacts.org, GET /api/v1/prices?product_code=...) —
 *    краудсорсинговая база цен OFF по штрихкоду. Цены в иностранных валютах
 *    конвертируются в RUB по ежедневному курсу ЦБ РФ ({@link ExchangeRateService});
 *    без доступного курса такая цена пропускается (graceful degradation —
 *    локальная база хранит только рубли).
 *
 * 7. Обновление карточек продуктов: fetchProductInfo() (см. {@link ProductInfoProvider})
 *    освежает название/бренд/фасовку/фото через OFF Product API v2; изменения
 *    учитываются в SyncLog.updatedCount при синхронизации цен.
 */
@Component
@Slf4j
public class OpenFoodFactsProvider implements PriceProvider, ProductInfoProvider {

    /** Контакт по умолчанию для User-Agent (формат OFF: "AppName/Version (ContactEmail)"). */
    private static final String DEFAULT_CONTACT = "support@provision.app";

    /**
     * User-Agent строго по доке OFF: "AppName/Version (ContactEmail)".
     * При настроенной учётке OFF контакт подставляется из user-id (см. buildUserAgent).
     */
    private static final String USER_AGENT = "ProvisionApp/1.0.0 (" + DEFAULT_CONTACT + ")";

    /** Лимит OFF на поиск: 10 запросов в минуту => минимум 6 секунд между ними. */
    private static final Duration MIN_SEARCH_INTERVAL = Duration.ofMillis(6500);

    /** Максимум повторных попыток при 429/5xx. */
    private static final int MAX_RETRIES = 3;

    /** Сколько последних цен на продукт тянуть из Open Prices (история по датам). */
    static final int PRICES_PAGE_SIZE = 10;

    private final RestClient restClient;

    /** Курсы ЦБ РФ для конвертации цен Open Prices в рубли (fix U11). */
    private final ExchangeRateService exchangeRateService;

    /** Двусторонний семафор: одновременно только один поисковый запрос... */
    private final Semaphore searchPermits = new Semaphore(1, true);

    /** ...плюс глобальная тротлинг-пауза между последовательными запросами. */
    private volatile Instant lastSearchAt = Instant.EPOCH;

    @Value("${integration.off.products-url:https://world.openfoodfacts.org}")
    private String productsUrl;

    /** Open Prices API — источник краудсорсинговых цен по штрихкоду (fix U11). */
    @Value("${integration.off.prices-url:https://prices.openfoodfacts.org}")
    private String pricesUrl;

    /**
     * Fix-9: ОПЦИОНАЛЬНАЯ учётная запись OFF (env OFF_USER_ID/OFF_PASSWORD).
     * Анонимный поиск OFF жёстко лимитирует (503 «Page temporarily
     * unavailable»); зарегистрированные пользователи получают приоритетный
     * доступ без лимитов. Учётка передаётся ТОЛЬКО заголовком Basic Auth —
     * query-параметры user_id/password в API v2 не работают.
     */
    @Value("${integration.off.user-id:}")
    private String offUserId;

    @Value("${integration.off.password:}")
    private String offPassword;

    public OpenFoodFactsProvider(ExchangeRateService exchangeRateService) {
        this.exchangeRateService = exchangeRateService;
        // Fix-9: заголовки проставляются интерсептором на каждый запрос —
        // учётка может быть внедрена @Value после конструктора, а UA зависит
        // от неё (контакт = email учётки, иначе дефолтный).
        this.restClient = RestClient.builder()
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().set(HttpHeaders.USER_AGENT, buildUserAgent(offUserId));
                    String auth = basicAuthHeader(offUserId, offPassword);
                    if (auth != null) {
                        request.getHeaders().set(HttpHeaders.AUTHORIZATION, auth);
                    }
                    return execution.execute(request, body);
                })
                .build();
    }

    /**
     * User-Agent по формату OFF "AppName/Version (ContactEmail)":
     * контакт — email учётки OFF (если настроена), иначе дефолтный.
     * Чистая функция — покрыта юнит-тестом.
     */
    static String buildUserAgent(String contactEmail) {
        String contact = (contactEmail == null || contactEmail.isBlank())
                ? DEFAULT_CONTACT : contactEmail.trim();
        return "ProvisionApp/1.0.0 (" + contact + ")";
    }

    /**
     * Заголовок HTTP Basic Auth для учётки OFF; null — если учётка не
     * настроена (анонимный режим). Чистая функция — покрыта юнит-тестом.
     */
    static String basicAuthHeader(String userId, String password) {
        if (userId == null || userId.isBlank() || password == null || password.isBlank()) {
            return null;
        }
        String token = java.util.Base64.getEncoder().encodeToString(
                (userId.trim() + ":" + password)
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return "Basic " + token;
    }

    @PostConstruct
    void logConfig() {
        boolean authed = basicAuthHeader(offUserId, offPassword) != null;
        log.info("Open Food Facts provider initialized with User-Agent: {} (auth: {})",
                buildUserAgent(offUserId), authed ? "OFF account (Basic Auth header)" : "anonymous");
        if (!authed) {
            log.warn("OFF credentials not set (integration.off.user-id/password or env "
                    + "OFF_USER_ID/OFF_PASSWORD) — anonymous mode: OFF search is heavily "
                    + "rate-limited and may return 503; set an account for priority access");
        }
        log.info("OFF: product cards/search via {} (API v2); prices via Open Prices {} "
                + "(converted to RUB using CBR rates)", productsUrl, pricesUrl);
    }

    @Override
    public String code() {
        return "OFF";
    }

    @Override
    public ConnectionStatus testConnection() {
        // Fix-9: проверка доступности — минимальный READ-запрос к API v2
        // (старый /cgi/search.pl закрыт OFF — стабильный 503).
        String uri = UriStringBuilder.from(productsUrl)
                .path("/api/v2/search")
                .queryParam("search_terms", "milk")
                .queryParam("fields", "code")
                .queryParam("page_size", 1)
                .build();
        try {
            restClient.get()
                    .uri(uri)
                    .retrieve()
                    .toBodilessEntity();
            return ConnectionStatus.success();
        } catch (HttpStatusCodeException e) {
            // Fix-9 (п.5): человекочитаемая ошибка — OFF на 503 отдаёт 25 КБ
            // HTML-заглушки, в тосте/БД это бесполезный дамп. Только суть + подсказка.
            // Fix-9 (п.6): подсказка зависит от режима — с настроенной учёткой 503
            // означает временный IP-блок (ждать), без учётки — настроить креды.
            String message = friendlyOffError(e.getStatusCode().value(), e.getResponseBodyAsString(),
                    basicAuthHeader(offUserId, offPassword) != null);
            log.error("Failed to connect to Open Food Facts: {}", message);
            return ConnectionStatus.error(message);
        } catch (Exception e) {
            log.error("Failed to connect to Open Food Facts: {}", e.getMessage());
            return ConnectionStatus.error(e.getMessage());
        }
    }

    /**
     * Fix-9 (п.5): короткое сообщение об ошибке OFF вместо дампа тела ответа.
     * Типовые коды получают готовую подсказку (что делать); неизвестные —
     * короткий текстовый excerpt (HTML-теги вычищены, максимум 200 символов).
     * Fix-9 (п.6): для 503 подсказка зависит от authed — OFF блокирует по IP
     * ДО проверки учётки, поэтому при настроенных кредах 503 = временный блок
     * (лечится ожиданием), а не «настройте учётку».
     * Чистая функция — покрыта юнит-тестом.
     */
    static String friendlyOffError(int status, String body, boolean authed) {
        String hint = switch (status) {
            case 401, 403 -> "доступ запрещён — проверьте учётку OFF (env OFF_USER_ID/OFF_PASSWORD).";
            case 429 -> authed
                    ? "превышен лимит запросов — подождите несколько минут и повторите один раз."
                    : "превышен лимит запросов — повторите позже; для частых синхронизаций настройте учётку OFF.";
            case 503 -> authed
                    ? "OFF временно ограничил ваш IP из-за частых запросов (ограничение "
                        + "применяется до проверки учётки и снимается автоматически). "
                        + "Подождите 30–60 минут, не повторяя попыток, затем повторите ОДИН раз."
                    : "сервис временно недоступен (перегрузка или лимит анонимных запросов по IP). "
                        + "Настройте учётку OFF (env OFF_USER_ID/OFF_PASSWORD), пересоберите backend и повторите.";
            default -> null;
        };
        if (hint != null) {
            return "Open Food Facts: HTTP " + status + " — " + hint;
        }
        String excerpt = body == null ? "" : body.replaceAll("<[^>]*>", " ")
                .replaceAll("\\s+", " ").trim();
        if (excerpt.length() > 200) {
            excerpt = excerpt.substring(0, 200) + "…";
        }
        return "Open Food Facts: HTTP " + status + (excerpt.isEmpty() ? "" : " — " + excerpt);
    }

    @Override
    public List<ExternalProductDto> searchProducts(String query, int limit) {
        // Fix-9: поиск через API v2 (https://world.openfoodfacts.org/api/v2/search).
        // Учётка OFF (если настроена) уходит заголовком Basic Auth в интерсепторе;
        // в query-параметрах авторизации НЕТ — v2 их не принимает.
        String uri = UriStringBuilder.from(productsUrl)
                .path("/api/v2/search")
                .queryParam("search_terms", query)
                .queryParam("fields", "code,product_name,brands,quantity,image_url")
                .queryParam("page_size", limit)
                .build();

        JsonNode response = executeWithThrottlingAndRetry(uri, "search \"" + query + "\"");
        if (response == null) {
            // Graceful degradation: после исчерпания ретраев — пустой результат.
            return Collections.emptyList();
        }

        List<ExternalProductDto> results = new ArrayList<>();
        if (response.has("products")) {
            for (JsonNode product : response.get("products")) {
                // Общий билдер карточки (fix U11): code и name обязательны,
                // brand/фасовка/фото — best-effort.
                buildProductDto(null, product).ifPresent(results::add);
            }
        }
        return results;
    }

    /**
     * Синхронизация цен (fix U11): Open Prices (prices.openfoodfacts.org) —
     * краудсорсинговые цены OFF по штрихкоду. Берём последние PRICES_PAGE_SIZE
     * цен (order_by=-date), конвертируем в RUB по курсу ЦБ РФ и возвращаем
     * как ExternalPriceDto(currency="RUB") — пайплайн IntegrationService
     * пишет их в IngredientPrice по датам.
     *
     * Graceful degradation: URL не настроен / сеть недоступна / курс валюты
     * неизвестен — возвращаем пустой список (или пропускаем цену), не роняем
     * синхронизацию.
     */
    @Override
    public List<ExternalPriceDto> fetchPrices(String externalCode, LocalDate since) {
        if (externalCode == null || externalCode.isBlank() || pricesUrl == null) {
            return Collections.emptyList();
        }
        String uri = buildPricesUri(pricesUrl, externalCode, since, PRICES_PAGE_SIZE);
        JsonNode response = executeWithThrottlingAndRetry(uri, "prices for code " + externalCode);
        if (response == null) {
            return Collections.emptyList();
        }
        List<ExternalPriceDto> prices = parsePricesResponse(response, exchangeRateService::rateToRub);
        log.info("Open Prices: {} RUB price(s) for code {} (requested since {})",
                prices.size(), externalCode, since);
        return prices;
    }

    /**
     * Обновление карточки продукта (fix U11): OFF Product API v2 —
     * название, бренд, фасовка, фото по штрихкоду.
     */
    @Override
    public Optional<ExternalProductDto> fetchProductInfo(String externalCode) {
        if (externalCode == null || externalCode.isBlank() || productsUrl == null) {
            return Optional.empty();
        }
        String uri = UriStringBuilder.from(productsUrl)
                .path("/api/v2/product/" + externalCode)
                .queryParam("fields", "code,product_name,brands,quantity,image_url")
                .build();
        JsonNode response = executeWithThrottlingAndRetry(uri, "product card " + externalCode);
        if (response == null || !response.has("product") || response.get("product").isNull()) {
            return Optional.empty();
        }
        return buildProductDto(externalCode, response.get("product"));
    }

    /**
     * Чистый строитель URI Open Prices (без HTTP) — вынесен для юнит-тестов.
     * date_gte добавляется только если задан since.
     */
    static String buildPricesUri(String baseUrl, String productCode, LocalDate since, int size) {
        UriStringBuilder builder = UriStringBuilder.from(baseUrl)
                .path("/api/v1/prices")
                .queryParam("product_code", productCode)
                .queryParam("order_by", "-date")
                .queryParam("size", size);
        if (since != null) {
            builder.queryParam("date_gte", since.toString());
        }
        return builder.build();
    }

    /**
     * Чистый парсер ответа Open Prices (без HTTP) — вынесен для юнит-тестов.
     *
     * Формат items[]: {"price":2.5,"currency":"EUR","date":"2026-10-01",
     * "product_code":"3017620422003",...}. Цена конвертируется в RUB через
     * rateToRub; валюта без курса и битые элементы пропускаются.
     */
    static List<ExternalPriceDto> parsePricesResponse(JsonNode response,
                                                      java.util.function.Function<String, BigDecimal> rateToRub) {
        List<ExternalPriceDto> result = new ArrayList<>();
        if (response == null || !response.has("items") || !response.get("items").isArray()) {
            return result;
        }
        for (JsonNode item : response.get("items")) {
            JsonNode priceNode = item.get("price");
            JsonNode currencyNode = item.get("currency");
            JsonNode dateNode = item.get("date");
            JsonNode codeNode = item.get("product_code");
            if (priceNode == null || !priceNode.isNumber() || currencyNode == null
                    || dateNode == null || codeNode == null) {
                continue;
            }
            BigDecimal price = priceNode.decimalValue();
            if (price.signum() <= 0) {
                continue;
            }
            String currency = currencyNode.asText().trim().toUpperCase();
            BigDecimal rate = rateToRub.apply(currency);
            if (rate == null || rate.signum() <= 0) {
                log.debug("Skipping Open Prices item in {}: no CBR rate to RUB", currency);
                continue;
            }
            try {
                LocalDate date = LocalDate.parse(dateNode.asText().trim().substring(0, 10));
                BigDecimal rub = price.multiply(rate).setScale(2, RoundingMode.HALF_UP);
                result.add(new ExternalPriceDto(codeNode.asText(), rub, "RUB", date));
            } catch (Exception e) {
                log.warn("Skipping Open Prices item with unparsable date '{}': {}",
                        dateNode.asText(), e.getMessage());
            }
        }
        return result;
    }

    /**
     * Общий билдер ExternalProductDto из JSON-узла продукта OFF
     * (используется и поиском, и обновлением карточки).
     */
    private Optional<ExternalProductDto> buildProductDto(String fallbackCode, JsonNode product) {
        String code = product.hasNonNull("code") ? product.get("code").asText() : fallbackCode;
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        String name = product.hasNonNull("product_name") ? product.get("product_name").asText() : null;
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        String brand = product.hasNonNull("brands") ? product.get("brands").asText() : null;
        String quantity = product.hasNonNull("quantity") ? product.get("quantity").asText() : null;
        String imageUrl = product.hasNonNull("image_url") ? product.get("image_url").asText() : null;
        PackInfo packInfo = parseQuantity(quantity);
        return Optional.of(new ExternalProductDto(code, name, brand,
                packInfo.amount(), packInfo.unit(), imageUrl));
    }

    /**
     * Единый исполнитель GET-запроса к OFF с клиентским throttling'ом
     * (10 req/min) и экспоненциальным retry на 429/5xx.
     *
     * @return тело ответа JSON, либо null после исчерпания попыток
     *         (graceful degradation — не роняем вызывающий код).
     */
    private JsonNode executeWithThrottlingAndRetry(String uri, String description) {
        try {
            acquireSearchSlot();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while waiting for OFF search slot");
            return null;
        }

        HttpStatusCodeException lastError = null;
        for (int attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                ResponseEntity<JsonNode> entity = restClient.get()
                        .uri(uri)
                        .retrieve()
                        .onStatus(status -> status.value() == 429 || status.is5xxServerError(),
                                (request, response) -> {
                                    // Не выбрасываем сразу: сохраняем тело для парсинга
                                    throw new OffRateLimitedException(response.getStatusCode().value(),
                                            readBodyQuietly(response));
                                })
                        .toEntity(JsonNode.class);
                return entity.getBody();
            } catch (OffRateLimitedException e) {
                lastError = e;
                long backoffMs = computeBackoffMs(e, attempt);
                log.warn("Open Food Facts {} returned HTTP {} (attempt {}/{}), retrying in {} ms",
                        description, e.getStatusCode().value(), attempt + 1, MAX_RETRIES + 1, backoffMs);
                if (attempt == MAX_RETRIES) {
                    break;
                }
                sleep(backoffMs);
            } catch (HttpStatusCodeException e) {
                // Прочие 4xx — повтор бессмысленен.
                log.warn("Open Food Facts {} failed with HTTP {}: {}",
                        description, e.getStatusCode().value(), e.getStatusText());
                return null;
            } catch (Exception e) {
                log.warn("Open Food Facts {} failed: {}", description, e.getMessage());
                return null;
            }
        }

        log.error("Open Food Facts {} unavailable after {} retries (last error: HTTP {}). "
                + "Returning empty result (graceful degradation).",
                description, MAX_RETRIES + 1,
                lastError != null ? lastError.getStatusCode().value() : "n/a");
        return null;
    }

    /**
     * Блокирует слот поиска и выдерживает паузу, чтобы суммарная частота
     * не превысила 10 запросов в минуту (интервал >= 6.5 с).
     *
     * FIX (U11): раньше ожидание считалось как «прошло − интервал» — при
     * стартовом lastSearchAt = EPOCH первый запрос уходил в сон ~56 лет
     * (полный hang провайдера), а permit никогда не возвращался в семафор —
     * второй запрос блокировался навсегда. Корректная формула:
     * «интервал − прошло»; permit освобождается в finally.
     */
    private void acquireSearchSlot() throws InterruptedException {
        searchPermits.acquire();
        try {
            long waitMs = Duration.between(Instant.now(), lastSearchAt.plus(MIN_SEARCH_INTERVAL)).toMillis();
            if (waitMs > 0) {
                log.debug("Throttling OFF request: sleeping {} ms (limit 10 req/min)", waitMs);
                TimeUnit.MILLISECONDS.sleep(waitMs);
            }
            lastSearchAt = Instant.now();
        } finally {
            searchPermits.release();
        }
    }

    /**
     * Экспоненциальная пауза: Retry-After от OFF, если задан; иначе 5s, 10s, 20s.
     */
    private long computeBackoffMs(HttpStatusCodeException e, int attempt) {
        String retryAfter = e.getResponseHeaders() != null
                ? e.getResponseHeaders().getFirst(HttpHeaders.RETRY_AFTER)
                : null;
        if (retryAfter != null) {
            try {
                long seconds = Long.parseLong(retryAfter.trim());
                return Math.min(TimeUnit.SECONDS.toMillis(Math.max(seconds, 1)),
                        TimeUnit.MINUTES.toMillis(5));
            } catch (NumberFormatException ignored) {
                // HTTP-date формат Retry-After не поддерживаем — fallback ниже.
            }
        }
        return TimeUnit.SECONDS.toMillis(5L << attempt); // 5s, 10s, 20s
    }

    private static void sleep(long ms) {
        try {
            TimeUnit.MILLISECONDS.sleep(ms);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private static String readBodyQuietly(org.springframework.http.client.ClientHttpResponse response) {
        try {
            return new String(response.getBody().readAllBytes(),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    /** Внутренний маркер "можно повторить" (429 / 5xx). */
    private static class OffRateLimitedException extends HttpStatusCodeException {
        private final String body;

        OffRateLimitedException(int statusCode, String bodyAsString) {
            super(org.springframework.http.HttpStatus.valueOf(statusCode), "", null,
                    java.nio.charset.StandardCharsets.UTF_8);
            this.body = bodyAsString;
        }

        public String getResponseBodyAsString() {
            return body != null ? body : "";
        }
    }

    /**
     * Простой сборщик URI с корректным percent-encoding значений
     * (пробел -> %20, спецсимволы экранируются). Авторизационные параметры
     * в query намеренно отсутствуют — учётка OFF (Fix-9) передаётся
     * заголовком Basic Auth (интерсептор RestClient), а не строкой запроса.
     */
    private static final class UriStringBuilder {
        private final StringBuilder sb = new StringBuilder();

        static UriStringBuilder from(String base) {
            UriStringBuilder b = new UriStringBuilder();
            b.sb.append(base);
            return b;
        }

        UriStringBuilder path(String p) {
            sb.append(p);
            return this;
        }

        UriStringBuilder queryParam(String key, Object value) {
            sb.append(sb.indexOf("?") >= 0 ? '&' : '?')
              .append(key).append('=')
              .append(java.net.URLEncoder.encode(String.valueOf(value),
                      java.nio.charset.StandardCharsets.UTF_8));
            return this;
        }

        String build() {
            return sb.toString();
        }
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
