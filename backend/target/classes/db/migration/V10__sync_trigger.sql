-- V10__sync_trigger.sql
-- Добавляем происхождение запуска синка

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
    CHECK (triggered_by IN ('MANUAL', 'SCHEDULED'));

ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS triggered_user BIGINT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sync_logs_triggered_by ON sync_logs(triggered_by);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
