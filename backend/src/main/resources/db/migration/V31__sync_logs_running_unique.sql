-- V31: не более одной одновременно бегущей синхронизации на провайдера
-- (внешний аудит 30.10.2026, AU-03; план plans/2026-10-30-external-audit-p0.md).
--
-- ЗАЧЕМ. IntegrationService.startSyncLog проверял «уже бежит» парой
--   SELECT ... WHERE status='RUNNING'  →  INSERT status='RUNNING'
-- без блокировки и без ограничения БД: между запросами второй поток успевал пройти
-- ту же проверку. Два одновременных POST /admin/integrations/{provider}/sync/prices
-- давали два SyncLog(RUNNING) и два параллельных PriceSyncService.runPriceSync —
-- гонку записи в emis_prices/ingredient_prices и недетерминированные счётчики в журнале.
-- В схеме были только неуникальные индексы (V5: provider, started_at; V10: triggered_by,
-- status), поэтому БД конфликт не ловила.
--
-- ЧТО ДЕЛАЕМ. Источник истины переносим в БД: частичный уникальный индекс
-- «один RUNNING на провайдера». SELECT остаётся как быстрый путь для внятного 409
-- (не тратим INSERT ради очевидного отказа), но при гонке второй поток упирается
-- в индекс и получает DataIntegrityViolationException, который
-- GlobalExceptionHandler (AU-14) и startSyncLog превращают в тот же 409
-- SYNC_ALREADY_RUNNING. Поведение для клиента не меняется, гонка исчезает.
--
-- ПОЧЕМУ СНАЧАЛА UPDATE. Индекс частичный (WHERE status='RUNNING'), поэтому он не
-- создастся, если в существующей БД гонка уже наплодила несколько RUNNING на одного
-- провайдера. Дедуплицируем: выживаем все, кроме самой ранней записи провайдера.
-- Самую раннюю оставляем RUNNING намеренно — её на следующем старте закроет
-- SyncLogService.markRunningAsFailedOnStartup() (onApplicationReady), то есть уже
-- существующий и протестированный механизм, а не новый код в миграции.
--
-- details не перезаписываем, а дописываем (COALESCE || jsonb_build_object): в существующих
-- строках там отчёт предыдущего запуска, терять его нельзя.
--
-- Повторный прогон безопасен: UPDATE идемпотентен, индекс под IF NOT EXISTS.

UPDATE sync_logs s
SET status      = 'FAILED',
    finished_at = COALESCE(s.finished_at, now()),
    details     = COALESCE(s.details, '{}'::jsonb) || jsonb_build_object(
            'dedupedBy', 'V31',
            'reason', 'Дублирующая запись RUNNING закрыта миграцией V31 (гонка check-then-act в startSyncLog)')
WHERE s.status = 'RUNNING'
  AND EXISTS (SELECT 1
              FROM sync_logs o
              WHERE o.provider = s.provider
                AND o.status = 'RUNNING'
                AND o.id < s.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_logs_running
    ON sync_logs (provider)
    WHERE status = 'RUNNING';
