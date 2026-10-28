-- V25__sync_partial_status.sql
-- Fix-15: честный статус синхронизации.
--
-- Раньше IntegrationService.finalizeSyncLog хардкодил 'SUCCESS' даже когда
-- ВСЕ маппинги упали с ошибками (боль: «в журнале SUCCESS, но Ошибки: 2»).
-- Новая семантика:
--   SUCCESS — ошибок нет;
--   PARTIAL — есть ошибки, но часть работы выполнена (цены созданы/обновлены);
--   FAILED  — есть ошибки и не записано ничего.
-- CHECK-ограничение V5 (RUNNING/SUCCESS/FAILED) расширяется значением PARTIAL.

ALTER TABLE sync_logs DROP CONSTRAINT IF EXISTS sync_logs_status_check;
ALTER TABLE sync_logs ADD CONSTRAINT sync_logs_status_check
    CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED'));
