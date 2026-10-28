package com.provision.service;

import com.provision.dto.sync.SyncKpiResponse;
import com.provision.dto.sync.SyncLogResponse;
import com.provision.entity.Integration;
import com.provision.entity.SyncLog;
import com.provision.entity.User;
import com.provision.exception.ConflictException;
import com.provision.exception.NotFoundException;
import com.provision.repository.IntegrationRepository;
import com.provision.repository.SyncLogRepository;
import com.provision.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.criteria.Predicate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class SyncLogService {

    // FIX (P1, аудит): раньше метод markRunningAsFailedOnStartup существовал, но не вызывался
    // нигде — зависшие SYNC-логи вечно оставались в статусе RUNNING после рестарта.
    // Привязка к ApplicationReadyEvent гарантирует выполнение при каждом старте приложения.
    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        try {
            markRunningAsFailedOnStartup();
        } catch (Exception e) {
            // Не роняем старт приложения из-за гигиены логов синхронизаций.
            log.error("Failed to mark running syncs as failed on startup", e);
        }
    }


    private final SyncLogRepository syncLogRepository;
    private final IntegrationRepository integrationRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<SyncLogResponse> getSyncLogs(
            String provider,
            String type,
            String status,
            LocalDateTime from,
            LocalDateTime to
    ) {
        return syncLogRepository.findAll(filtersSpec(provider, type, status, from, to)).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public SyncLogResponse getSyncLog(Long id) {
        SyncLog syncLog = syncLogRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Sync log not found with id: " + id));
        return toResponse(syncLog);
    }

    @Transactional
    public SyncLogResponse startSync(String providerCode, Long userId) {
        // Проверка существования провайдера
        Integration integration = integrationRepository.findByProvider(providerCode)
                .orElseThrow(() -> new NotFoundException("Integration not found: " + providerCode));

        // Проверка статуса подключения
        if (!"CONNECTED".equals(integration.getStatus())) {
            throw new ConflictException("INTEGRATION_DISCONNECTED: Provider is not connected");
        }

        // Проверка на параллельный запуск
        Optional<SyncLog> runningSync = syncLogRepository.findRunningByProvider(providerCode);
        if (runningSync.isPresent()) {
            throw new ConflictException("SYNC_ALREADY_RUNNING: Sync is already running for provider " + providerCode);
        }

        // Получение пользователя
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        // Создание записи синка
        SyncLog syncLog = SyncLog.builder()
                .provider(providerCode)
                .type("PRICES")
                .status("RUNNING")
                .triggeredBy("MANUAL")
                .triggeredUser(user)
                .startedAt(LocalDateTime.now())
                .createdCount(0)
                .updatedCount(0)
                .errorCount(0)
                .build();

        syncLog = syncLogRepository.save(syncLog);
        log.info("Started sync for provider {} by user {}", providerCode, user.getEmail());

        return toResponse(syncLog);
    }

    @Transactional
    public void completeSync(Long syncLogId, Integer createdCount, Integer updatedCount, Integer errorCount, Map<String, Object> details) {
        SyncLog syncLog = syncLogRepository.findById(syncLogId)
                .orElseThrow(() -> new NotFoundException("Sync log not found"));

        syncLog.setStatus(errorCount > 0 && createdCount == 0 && updatedCount == 0 ? "FAILED" : "SUCCESS");
        syncLog.setFinishedAt(LocalDateTime.now());
        syncLog.setCreatedCount(createdCount);
        syncLog.setUpdatedCount(updatedCount);
        syncLog.setErrorCount(errorCount);
        syncLog.setDetails(details);

        syncLogRepository.save(syncLog);
        log.info("Completed sync #{}: status={}, created={}, updated={}, errors={}", 
                syncLogId, syncLog.getStatus(), createdCount, updatedCount, errorCount);
    }

    @Transactional
    public void failSync(Long syncLogId, String errorMessage) {
        SyncLog syncLog = syncLogRepository.findById(syncLogId)
                .orElseThrow(() -> new NotFoundException("Sync log not found"));

        syncLog.setStatus("FAILED");
        syncLog.setFinishedAt(LocalDateTime.now());
        syncLog.setDetails(Map.of("fatalError", errorMessage));

        syncLogRepository.save(syncLog);
        log.error("Failed sync #{}: {}", syncLogId, errorMessage);
    }

    @Transactional
    public void markRunningAsFailedOnStartup() {
        List<SyncLog> runningSyncs = syncLogRepository.findAllRunning();
        for (SyncLog syncLog : runningSyncs) {
            syncLog.setStatus("FAILED");
            syncLog.setFinishedAt(LocalDateTime.now());
            syncLog.setDetails(Map.of("fatalError", "Прерван перезапуском приложения"));
            syncLogRepository.save(syncLog);
            log.warn("Marked sync #{} as FAILED due to application restart", syncLog.getId());
        }
    }

    /**
     * Fix-12: фильтрация журнала синков через JPA Specification вместо JPQL
     * «(:param IS NULL OR col = :param)» — тот паттерн на Hibernate 6 +
     * PostgreSQL ронял оба эндпоинта (/admin/sync-logs и /kpi) в рантайме
     * (нетипизированные NULL-параметры). Здесь предикаты создаются только для
     * непустых фильтров — NULL-параметров в SQL не попадает вовсе.
     * Сортировка: свежие запуски сверху (startedAt DESC).
     */
    private static Specification<SyncLog> filtersSpec(String provider, String type, String status,
                                                      java.time.LocalDateTime from, java.time.LocalDateTime to) {
        return (root, query, cb) -> {
            List<Predicate> ps = new java.util.ArrayList<>();
            if (provider != null && !provider.isBlank()) {
                ps.add(cb.equal(root.get("provider"), provider));
            }
            if (type != null && !type.isBlank()) {
                ps.add(cb.equal(root.get("type"), type));
            }
            if (status != null && !status.isBlank()) {
                ps.add(cb.equal(root.get("status"), status));
            }
            if (from != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("startedAt"), from));
            }
            if (to != null) {
                ps.add(cb.lessThanOrEqualTo(root.get("startedAt"), to));
            }
            if (query != null) {
                query.orderBy(cb.desc(root.get("startedAt")));
            }
            return ps.isEmpty() ? cb.conjunction() : cb.and(ps.toArray(new Predicate[0]));
        };
    }

    @Transactional(readOnly = true)
    public SyncKpiResponse getKpi(String provider, Integer days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days != null ? days : 7);
        
        List<SyncLog> logs = syncLogRepository.findAll(filtersSpec(provider, null, null, since, null));
        
        long totalRuns = logs.size();
        long successfulRuns = logs.stream().filter(l -> "SUCCESS".equals(l.getStatus())).count();
        double successRate = totalRuns > 0 ? (double) successfulRuns / totalRuns * 100 : 0;
        long totalUpdated = logs.stream().mapToLong(SyncLog::getUpdatedCount).sum();
        long totalErrors = logs.stream().mapToLong(SyncLog::getErrorCount).sum();

        return new SyncKpiResponse(totalRuns, successRate, totalUpdated, totalErrors);
    }

    private SyncLogResponse toResponse(SyncLog syncLog) {
        Double durationSeconds = null;
        if (syncLog.getFinishedAt() != null) {
            durationSeconds = (double) (syncLog.getFinishedAt().toEpochSecond(java.time.ZoneOffset.UTC) - 
                                       syncLog.getStartedAt().toEpochSecond(java.time.ZoneOffset.UTC));
        }

        SyncLogResponse.SyncDetails details = null;
        if (syncLog.getDetails() != null) {
            // Парсинг JSONB в структуру
            details = parseDetails(syncLog.getDetails());
        }

        return new SyncLogResponse(
                syncLog.getId(),
                syncLog.getProvider(),
                syncLog.getType(),
                syncLog.getStatus(),
                syncLog.getTriggeredBy(),
                syncLog.getTriggeredUser() != null ? syncLog.getTriggeredUser().getEmail() : null,
                syncLog.getStartedAt(),
                syncLog.getFinishedAt(),
                durationSeconds,
                syncLog.getCreatedCount(),
                syncLog.getUpdatedCount(),
                syncLog.getErrorCount(),
                details
        );
    }

    @SuppressWarnings("unchecked")
    private SyncLogResponse.SyncDetails parseDetails(Map<String, Object> detailsMap) {
        // FIX ("Не удалось загрузить журнал синков" сразу при открытии):
        // раньше здесь были слепые касты ((Integer) ...), ((Number) item.get("productId")).longValue(),
        // (Boolean) ... . Один неожиданный элемент в jsonb (item без productId -> NPE,
        // requestCount как Long/строка -> ClassCastException) ронял весь GET /admin/sync-logs в 500,
        // и страница не открывалась целиком. Теперь парсим defensively: битые поля => null,
        // битый элемент списка => skip + warning в лог.
        Integer requestCount = asInteger(detailsMap.get("requestCount"));

        List<Map<String, Object>> itemsList = (List<Map<String, Object>>) detailsMap.get("items");
        List<SyncLogResponse.SyncItem> items = null;
        if (itemsList != null) {
            items = new ArrayList<>();
            for (Map<String, Object> item : itemsList) {
                try {
                    Number productId = asNumber(item.get("productId"));
                    items.add(new SyncLogResponse.SyncItem(
                            productId != null ? productId.longValue() : null,
                            asString(item.get("productName")),
                            asString(item.get("externalCode")),
                            parseLocalDate(item.get("priceDate")),
                            asBigDecimal(item.get("oldPrice")),
                            asBigDecimal(item.get("newPrice")),
                            asString(item.get("action")),
                            asString(item.get("reason")),
                            asBoolean(item.get("anomaly"))
                    ));
                } catch (Exception e) {
                    log.warn("Skipping malformed sync log item: {}", e.getMessage());
                }
            }
        }

        List<Map<String, Object>> errorsList = (List<Map<String, Object>>) detailsMap.get("errors");
        List<SyncLogResponse.SyncError> errors = null;
        if (errorsList != null) {
            errors = new ArrayList<>();
            for (Map<String, Object> err : errorsList) {
                try {
                    errors.add(new SyncLogResponse.SyncError(
                            asString(err.get("externalCode")),
                            asString(err.get("message"))
                    ));
                } catch (Exception e) {
                    log.warn("Skipping malformed sync log error entry: {}", e.getMessage());
                }
            }
        }

        return new SyncLogResponse.SyncDetails(requestCount, items, errors);
    }

    // --- defensive helpers для парсинга jsonb (см. FIX выше) ---
    private static String asString(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static Number asNumber(Object v) {
        return v instanceof Number n ? n : null;
    }

    private static Integer asInteger(Object v) {
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Integer.valueOf(s.trim()); } catch (NumberFormatException ignored) { }
        }
        return null;
    }

    private static Boolean asBoolean(Object v) {
        if (v instanceof Boolean b) return b;
        if (v instanceof String s) return Boolean.valueOf(s);
        return null;
    }

    private static BigDecimal asBigDecimal(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal bd) return bd;
        if (v instanceof Number n) return new BigDecimal(n.toString());
        try { return new BigDecimal(v.toString().trim()); } catch (NumberFormatException e) { return null; }
    }

    private static LocalDate parseLocalDate(Object v) {
        if (v == null) return null;
        try { return LocalDate.parse(v.toString()); } catch (Exception e) { return null; }
    }
}
