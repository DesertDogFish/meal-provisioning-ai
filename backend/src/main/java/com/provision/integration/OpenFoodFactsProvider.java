package com.provision.integration;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
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
 * Fix-11 (27.10, по официальной доке https://openfoodfacts.github.io/openfoodfacts-server/api/):
 * - полнотекстовый поиск переведён на Search-a-licious (search.openfoodfacts.org,
 *   {@code GET /search?q=...} → {hits:[...]}): {@code /api/v2/search} параметр
 *   search_terms ИГНОРИРУЕТ («Full-text search is not available in the v2
 *   server-side API» — выдача = вся база без фильтрации), а {@code /cgi/search.pl}
 *   закрыт (Fix-9: стабильный 503 даже с корректным User-Agent);
 * - user_id учётки OFF — это USERNAME, «You must not use your email address»
 *   (сноска user_id_not_email официальной доки); email-контакт для User-Agent —
 *   отдельная опция integration.off.contact-email;
 * - rate-limits доки: 10 req/min/IP на поиск, 15 req/min/IP на карточки продуктов;
 *   превышение — вплоть до IP-бана; плюс глобальные лимиты (503 независимо от IP).
 *
 * Реализация приведена в соответствие с официальной документацией OFF
 * и фактической политикой сервиса (2026):
 *
 * 1. Поиск — Search-a-licious ({@code GET /search?q=}); карточка продукта —
 *    v2 ({@code /api/v2/product/{code}}); цены — Open Prices.
 *
 * 2. Обязательный User-Agent в формате "AppName/Version (ContactEmail)" —
 *    без него OFF блокирует запросы как ботовые (503). Контакт — EMAIL
 *    (integration.off.contact-email; legacy: user-id, если он похож на email;
 *    иначе дефолтный адрес).
 *
 * 3. ОПЦИОНАЛЬНАЯ авторизация учёткой OFF (integration.off.user-id = USERNAME
 *    + password, env OFF_USER_ID/OFF_PASSWORD) — HTTP Basic Auth ЗАГОЛОВКОМ.
 *    По доке READ-операции авторизации не требуют (только кастомный UA), а
 *    query-параметры user_id/password разрешены только на POST/PUT/DELETE;
 *    учётка даёт приоритетный доступ при глобальных лимитах («Registered users
 *    are not subject to request limits» — сообщение OFF на странице 503).
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

    /** Fix-11 (п.6): максимум дополнительных попыток testConnection при транзиентных I/O-сбоях. */
    private static final int IO_RETRIES = 2;

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
     * Fix-11: полнотекстовый поиск — сервис Search-a-licious
     * (https://search.openfoodfacts.org, GET /search?q=...). Официальная дока
     * OFF: «Full-text search is NOT available in the v2 server-side API» —
     * /api/v2/search молча ИГНОРИРУЕТ search_terms и возвращает всю базу
     * (count ≈ 4.8 млн, в «результатах» — случайные продукты).
     */
    @Value("${integration.off.search-url:https://search.openfoodfacts.org}")
    private String searchUrl;

    /**
     * Fix-9: ОПЦИОНАЛЬНАЯ учётная запись OFF (env OFF_USER_ID/OFF_PASSWORD).
     * Fix-11 (по доке OFF): user_id — это USERNAME аккаунта, «You must not use
     * your email address». READ-операции по доке авторизации не требуют вовсе
     * (только кастомный User-Agent), но учётка даёт приоритетный доступ при
     * глобальных лимитах (сообщение OFF на странице 503). Передаётся ТОЛЬКО
     * заголовком Basic Auth — query-параметры user_id/password докой запрещены
     * на GET-запросах.
     */
    @Value("${integration.off.user-id:}")
    private String offUserId;

    @Value("${integration.off.password:}")
    private String offPassword;

    /**
     * Fix-11: контакт для User-Agent (дока OFF: «AppName/Version (ContactEmail)»
     * — именно EMAIL). Username учётки email'ом не является, поэтому контакт —
     * отдельная опция (env OFF_CONTACT_EMAIL); если не задан, а user-id похож
     * на email (legacy-конфиг) — используется он, иначе дефолтный адрес.
     */
    @Value("${integration.off.contact-email:}")
    private String offContactEmail;

    /**
     * Fix-11 (п.7): ОПЦИОНАЛЬНЫЙ прокси для всех запросов OFF
     * (env OFF_PROXY_URL, примеры: http://127.0.0.1:8888, socks5://host:1080).
     * Нужен там, где провайдер/файрвол режет TLS до хостов OFF
     * (search.openfoodfacts.org на OVH — подтверждённый кейс: «Remote host
     * terminated the handshake» / curl (35) с хост-машины).
     */
    @Value("${integration.off.proxy-url:}")
    private String offProxyUrl;

    /**
     * Фабрика запросов держится отдельной ссылкой: Fix-11 (п.7) может
     * выставить на ней прокси в @PostConstruct (после инъекции @Value),
     * не пересоздавая RestClient. Таймауты обязательны: без них зависший
     * запрос к OFF блокировал бы поток синхронизации навсегда.
     */
    private final org.springframework.http.client.SimpleClientHttpRequestFactory requestFactory;

    public OpenFoodFactsProvider(ExchangeRateService exchangeRateService) {
        this.exchangeRateService = exchangeRateService;
        this.requestFactory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        this.requestFactory.setConnectTimeout((int) TimeUnit.SECONDS.toMillis(10));
        this.requestFactory.setReadTimeout((int) TimeUnit.SECONDS.toMillis(30));
        // Fix-9: заголовки проставляются интерсептором на каждый запрос —
        // учётка может быть внедрена @Value после конструктора, а UA зависит
        // от неё (Fix-11: контакт — EMAIL из contact-email, не username).
        this.restClient = RestClient.builder()
                .requestFactory(this.requestFactory)
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().set(HttpHeaders.USER_AGENT,
                            buildUserAgent(offContactEmail, offUserId));
                    String auth = basicAuthHeader(offUserId, offPassword);
                    if (auth != null) {
                        request.getHeaders().set(HttpHeaders.AUTHORIZATION, auth);
                    }
                    return execution.execute(request, body);
                })
                .build();
    }

    /**
     * User-Agent по формату OFF "AppName/Version (ContactEmail)" (дока:
     * «always use a custom User-Agent … in the form of AppName/Version
     * (ContactEmail)»). Приоритет контакта: явный contact-email → user-id,
     * если он похож на email (legacy-конфиги) → дефолтный адрес.
     * Чистая функция — покрыта юнит-тестом.
     */
    static String buildUserAgent(String contactEmail, String userId) {
        String contact = contactEmail != null && !contactEmail.isBlank()
                ? contactEmail.trim()
                : (userId != null && userId.contains("@") && !userId.isBlank()
                        ? userId.trim() : DEFAULT_CONTACT);
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
                buildUserAgent(offContactEmail, offUserId),
                authed ? "OFF account (Basic Auth header)" : "anonymous");
        if (!authed) {
            log.warn("OFF credentials not set (integration.off.user-id/password or env "
                    + "OFF_USER_ID/OFF_PASSWORD) — anonymous mode: OFF search is heavily "
                    + "rate-limited and may return 503; set an account for priority access");
        } else if (offUserId != null && offUserId.contains("@")) {
            // Fix-11 (дока OFF, сноска user_id_not_email): «user_id is the username
            // of your account. You must not use your email address.»
            log.warn("OFF_USER_ID '{}' looks like an EMAIL — OFF docs require the account "
                    + "USERNAME (not email); Basic Auth may be rejected. Check your profile "
                    + "on world.openfoodfacts.org and set OFF_USER_ID to the username.", offUserId);
        }
        // Fix-11 (п.7): прокси применяется к общей фабрике запросов — действует
        // на ВСЕ хосты OFF (search/products/prices). UserInfo в лог не выводим.
        java.net.Proxy proxy = parseProxyUrl(offProxyUrl);
        if (proxy != null) {
            requestFactory.setProxy(proxy);
            log.info("OFF requests routed via proxy: {}",
                    offProxyUrl.trim().replaceAll("://[^@/]+@", "://***@"));
        } else if (offProxyUrl != null && !offProxyUrl.isBlank()) {
            log.warn("integration.off.proxy-url '{}' не распознан (ждём http://host:port "
                    + "или socks5://host:port) — работаем напрямую", offProxyUrl);
        }
        log.info("OFF: full-text search via {} (Search-a-licious); product cards via {} "
                + "(API v2); prices via Open Prices {} (converted to RUB using CBR rates)",
                searchUrl, productsUrl, pricesUrl);
    }

    /**
     * Fix-11 (п.7): парсер proxy-url → java.net.Proxy; null — прокси не задан.
     * Поддержка: http(s)://host:port (HTTP-прокси; для HTTPS-целей — CONNECT-туннель)
     * и socks5://host:port. Дефолтные порты: http→3128, socks→1080.
     * Чистая функция — покрыта юнит-тестом.
     */
    static java.net.Proxy parseProxyUrl(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        try {
            java.net.URI u = java.net.URI.create(url.trim());
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            String host = u.getHost();
            if (host == null || host.isBlank()) {
                return null;
            }
            boolean socks = scheme.equals("socks5") || scheme.equals("socks");
            boolean http = scheme.equals("http") || scheme.equals("https");
            if (!socks && !http) {
                return null;
            }
            int port = u.getPort() > 0 ? u.getPort() : (socks ? 1080 : 3128);
            return new java.net.Proxy(socks ? java.net.Proxy.Type.SOCKS : java.net.Proxy.Type.HTTP,
                    new java.net.InetSocketAddress(host, port));
        } catch (Exception e) {
            return null;
        }
    }

    @Override
    public String code() {
        return "OFF";
    }

    @Override
    public ConnectionStatus testConnection() {
        // Fix-11: проверка доступности — минимальный запрос к ПОИСКОВОМУ сервису
        // (Search-a-licious): именно он используется потоком импорта продуктов.
        // История: /cgi/search.pl закрыт OFF (503); /api/v2/search игнорирует
        // search_terms (full-text не поддержан в v2 — официальная дока).
        String uri = UriStringBuilder.from(searchUrl)
                .path("/search")
                .queryParam("q", "milk")
                .queryParam("fields", "code")
                .queryParam("page_size", 1)
                .build();
        boolean authed = basicAuthHeader(offUserId, offPassword) != null;
        // Fix-11 (п.6): транзиентные сетевые/TLS-сбои («Remote host terminated
        // the handshake», таймауты) ретраятся — единичный обрыв рукопожатия не
        // должен ронять «Подключить»; 4xx не ретраятся. Connection refused —
        // тоже без ретраев (нечего слушать).
        // Fix-11 (п.8): если поисковый сервис СОВСЕМ недоступен (провайдер режет
        // TLS до OVH-хоста — подтверждённый кейс пользователя) или отвечает 5xx,
        // пробуем фолбэк-хост Open Prices (та же инфраструктура, что
        // world.openfoodfacts.org) — через него поиск тоже умеет работать.
        String lastFailure = null;
        for (int attempt = 0; attempt <= IO_RETRIES; attempt++) {
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
                lastFailure = friendlyOffError(e.getStatusCode().value(), e.getResponseBodyAsString(), authed);
                if (e.getStatusCode().is5xxServerError()) {
                    log.warn("OFF search probe got HTTP {} — trying Open Prices fallback",
                            e.getStatusCode().value());
                    break; // 5xx — пробуем фолбэк
                }
                log.error("Failed to connect to Open Food Facts: {}", lastFailure);
                return ConnectionStatus.error(lastFailure); // 4xx — фолбэк бессмыслен
            } catch (ResourceAccessException e) {
                String root = rootCauseMessage(e);
                lastFailure = friendlyIoError(root, searchUrl);
                log.warn("OFF connection attempt {}/{} failed (I/O): {}", attempt + 1, IO_RETRIES + 1, root);
                if (isTransientIoFailure(e) && attempt < IO_RETRIES) {
                    sleep(1000L << attempt); // 1s, 2s
                    continue;
                }
                break;
            } catch (Exception e) {
                log.error("Failed to connect to Open Food Facts: {}", e.getMessage());
                return ConnectionStatus.error(e.getMessage());
            }
        }
        return fallbackConnectionProbe(lastFailure);
    }

    /**
     * Fix-11 (п.8): фолбэк-зонд «Подключить» — Open Prices на той же
     * инфраструктуре, что world.openfoodfacts.org (доступен там, где
     * search.openfoodfacts.org блокируют). Успех → интеграция РАБОТАЕТ
     * (поиск продуктов пойдёт через каталог Open Prices — подмножество OFF
     * с заявленными ценами), о чём честно сообщаем в message.
     */
    private ConnectionStatus fallbackConnectionProbe(String primaryFailure) {
        if (pricesUrl == null || pricesUrl.isBlank()) {
            log.error("Failed to connect to Open Food Facts: {}", primaryFailure);
            return ConnectionStatus.error(primaryFailure);
        }
        String uri = UriStringBuilder.from(pricesUrl)
                .path("/api/v1/products")
                .queryParam("size", 1)
                .build();
        try {
            restClient.get()
                    .uri(uri)
                    .retrieve()
                    .toBodilessEntity();
            String message = "Подключено через резервный хост: search.openfoodfacts.org "
                    + "недоступен из вашей сети (" + primaryFailure + "). Поиск продуктов "
                    + "будет идти через каталог Open Prices (подмножество OFF — продукты "
                    + "с заявленными ценами); синхронизация цен и карточки работают штатно.";
            log.warn("{}", message);
            return ConnectionStatus.success(message);
        } catch (Exception e) {
            String message = primaryFailure
                    + " Резервный хост Open Prices тоже недоступен: " + rootCauseMessage(e);
            log.error("Failed to connect to Open Food Facts (both hosts): {}", message);
            return ConnectionStatus.error(message);
        }
    }

    /**
     * Fix-11 (п.6): человекочитаемая сетевая ошибка вместо сырого
     * «I/O error on GET request … Remote host terminated the handshake».
     * Чистая функция (принимает текст root-причины) — покрыта юнит-тестом.
     */
    static String friendlyIoError(String rootCauseMessage, String endpointUrl) {
        String msg = rootCauseMessage == null ? "" : rootCauseMessage.toLowerCase();
        String host = "сервис OFF";
        try {
            host = java.net.URI.create(endpointUrl == null ? "" : endpointUrl).getHost();
        } catch (Exception ignored) { /* остаёмся на общей формулировке */ }
        if (msg.contains("handshake") || msg.contains("ssl") || msg.contains("tls")) {
            return "Не удалось установить TLS-соединение с " + host + " (рукопожатие оборвано). "
                    + "Вероятные причины: хост заблокирован/фильтруется вашим провайдером "
                    + "(search.openfoodfacts.org размещён на OVH, доступность зависит от сети) "
                    + "или сбой на стороне сервиса. Проверьте с хост-машины: "
                    + "curl -v \"https://" + host + "/search?q=milk&page_size=1\". "
                    + "Если провайдер блокирует — запустите backend через VPN/прокси или повторите позже.";
        }
        if (msg.contains("timed out") || msg.contains("timeout")) {
            return host + " не ответил вовремя — сервис перегружен или сеть нестабильна; повторите через несколько минут.";
        }
        if (msg.contains("unknown host") || msg.contains("unresolved") || msg.contains("name or service not known")) {
            return "Не удалось разрешить имя " + host + " (DNS). Проверьте DNS контейнера: "
                    + "docker compose exec backend nslookup " + host;
        }
        if (msg.contains("connection refused")) {
            return host + " отказал в соединении — сервис недоступен; повторите позже.";
        }
        String shortMsg = rootCauseMessage == null ? "неизвестная сетевая ошибка"
                : (rootCauseMessage.length() > 200 ? rootCauseMessage.substring(0, 200) + "…" : rootCauseMessage);
        return "Сетевая ошибка доступа к " + host + ": " + shortMsg;
    }

    /**
     * Fix-11 (п.6): транзиентный ли сетевой сбой (стоит ли ретраить)?
     * TLS-рукопожатие/обрывы/таймауты — да; connection refused — нет (быстрый провал).
     */
    static boolean isTransientIoFailure(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof java.net.ConnectException) {
                return false; // никто не слушает — ретрай бессмыслен
            }
            if (c instanceof javax.net.ssl.SSLException
                    || c instanceof java.net.SocketTimeoutException
                    || c instanceof java.io.EOFException) {
                return true;
            }
            if (c instanceof java.net.SocketException) {
                String m = String.valueOf(c.getMessage()).toLowerCase();
                if (m.contains("reset") || m.contains("broken pipe")) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Сообщение самой глубокой причины — в нём суть (handshake/timeout/…). */
    static String rootCauseMessage(Throwable t) {
        Throwable root = t;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        return root.getMessage() != null ? root.getMessage() : root.getClass().getSimpleName();
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
        // Fix-11: полнотекстовый поиск — Search-a-licious (search.openfoodfacts.org,
        // GET /search?q=...): /api/v2/search параметр search_terms ИГНОРИРУЕТ
        // («Full-text search is not available in the v2 server-side API» — official
        // docs; выдача = вся база без фильтрации), а /cgi/search.pl закрыт (503).
        // Учётка OFF (если настроена) уходит заголовком Basic Auth в интерсепторе;
        // в query-параметрах авторизации НЕТ (дока: на GET — никогда).
        String uri = UriStringBuilder.from(searchUrl)
                .path("/search")
                .queryParam("q", query)
                .queryParam("fields", "code,product_name,brands,quantity,image_url")
                .queryParam("page_size", limit)
                .build();

        JsonNode response = executeWithThrottlingAndRetry(uri, "search \"" + query + "\"");
        if (response != null) {
            return parseSearchHits(response);
        }
        // Fix-11 (п.8): Search-a-licious недоступен (провайдер блокирует OVH-хост,
        // сбой) — фолбэк на поиск продуктов в Open Prices: хост на той же
        // инфраструктуре, что world.openfoodfacts.org, каталог уже (продукты
        // с заявленными ценами), но импорт продолжает работать.
        log.warn("Search-a-licious unavailable — falling back to Open Prices product search for \"{}\"", query);
        return searchViaOpenPrices(query, limit);
    }

    /**
     * Fix-11 (п.8): фолбэк-поиск — Open Prices
     * {@code GET /api/v1/products?product_name__like=…&size=…} (регистронезависимый
     * LIKE по названию; параметр проверен живым запросом 27.10: search=... API
     * игнорирует, волшебный суффикс — __like).
     */
    private List<ExternalProductDto> searchViaOpenPrices(String query, int limit) {
        if (pricesUrl == null || pricesUrl.isBlank()) {
            return Collections.emptyList();
        }
        String uri = UriStringBuilder.from(pricesUrl)
                .path("/api/v1/products")
                .queryParam("product_name__like", query)
                .queryParam("size", limit)
                .build();
        JsonNode response = executeWithThrottlingAndRetry(uri, "fallback product search \"" + query + "\"");
        if (response == null) {
            // Graceful degradation: оба хоста недоступны — пустой результат.
            return Collections.emptyList();
        }
        return parseOpenPricesProducts(response);
    }

    /**
     * Fix-11 (п.8): парсер ответа Open Prices /api/v1/products —
     * {items:[{code, product_name, brands (СТРОКА), quantity, image_url,
     * product_quantity, product_quantity_unit, price_count,…}], total,…}.
     * Позиции без code/name пропускаются (в каталоге есть заглушки без метаданных).
     * Чистая функция — покрыта юнит-тестом.
     */
    static List<ExternalProductDto> parseOpenPricesProducts(JsonNode response) {
        List<ExternalProductDto> results = new ArrayList<>();
        if (response == null || !response.has("items") || !response.get("items").isArray()) {
            return results;
        }
        for (JsonNode item : response.get("items")) {
            String code = textOrNull(item, "code");
            String name = textOrNull(item, "product_name");
            if (code == null || name == null) {
                continue; // заглушки без названия/кода бесполезны
            }
            String quantity = textOrNull(item, "quantity");
            if (quantity == null) {
                // product_quantity + product_quantity_unit ("394" + "ml" → "394 ml")
                JsonNode pq = item.path("product_quantity");
                String unit = textOrNull(item, "product_quantity_unit");
                if (pq.isNumber() || pq.isTextual()) {
                    quantity = pq.asText() + (unit != null ? " " + unit : "");
                }
            }
            PackInfo packInfo = parseQuantity(quantity);
            results.add(new ExternalProductDto(code, name, textOrNull(item, "brands"),
                    packInfo.amount(), packInfo.unit(), textOrNull(item, "image_url")));
        }
        return results;
    }

    /**
     * Fix-11: парсер ответа Search-a-licious — {hits: [{code, product_name,
     * brands: [..], quantity, image_url}], count, page, ...}. Отличия от v2:
     * массив называется hits, brands — МАССИВ строк (join через ", ").
     * Позиции без code/name пропускаются. Чистая функция — покрыта юнит-тестом.
     */
    static List<ExternalProductDto> parseSearchHits(JsonNode response) {
        List<ExternalProductDto> results = new ArrayList<>();
        if (response == null || !response.has("hits") || !response.get("hits").isArray()) {
            return results;
        }
        for (JsonNode hit : response.get("hits")) {
            String code = textOrNull(hit, "code");
            String name = textOrNull(hit, "product_name");
            if (code == null || name == null) {
                continue; // без кода/названия карточка бесполезна
            }
            String brand = null;
            JsonNode brands = hit.path("brands");
            if (brands.isArray()) {
                StringBuilder sb = new StringBuilder();
                for (JsonNode b : brands) {
                    String t = b.asText(null);
                    if (t != null && !t.isBlank()) {
                        if (sb.length() > 0) sb.append(", ");
                        sb.append(t.trim());
                    }
                }
                brand = sb.length() > 0 ? sb.toString() : null;
            } else if (brands.isTextual() && !brands.asText().isBlank()) {
                brand = brands.asText(); // совместимость с v2-формой (строка)
            }
            PackInfo packInfo = parseQuantity(textOrNull(hit, "quantity"));
            results.add(new ExternalProductDto(code, name, brand,
                    packInfo.amount(), packInfo.unit(), textOrNull(hit, "image_url")));
        }
        return results;
    }

    /** Текстовое поле узла или null (missing/null/пусто). */
    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String t = v.asText();
        return t == null || t.isBlank() ? null : t;
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
            } catch (ResourceAccessException e) {
                // Fix-11 (п.6): транзиентные сетевые/TLS-сбои (обрыв рукопожатия,
                // таймаут, reset) ретраятся как 429/5xx; connection refused —
                // быстрый провал без ретраев (нечего слушать).
                if (isTransientIoFailure(e) && attempt < MAX_RETRIES) {
                    long backoffMs = 1000L << attempt; // 1s, 2s, 4s
                    log.warn("Open Food Facts {} network failure ({}), retrying in {} ms (attempt {}/{})",
                            description, rootCauseMessage(e), backoffMs, attempt + 1, MAX_RETRIES + 1);
                    sleep(backoffMs);
                    continue;
                }
                log.warn("Open Food Facts {} network failure (not retried): {}",
                        description, rootCauseMessage(e));
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

    private static PackInfo parseQuantity(String quantity) {
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

    private static String normalizeUnit(String unit, BigDecimal amount) {
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
