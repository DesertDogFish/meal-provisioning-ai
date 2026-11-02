-- V36__refresh_token_reuse_detection.sql
-- Подзадача 4 аудита 02.11.2026 (OAuth Security BCP, «refresh token replay»):
-- ротированный refresh-токен больше НЕ удаляется физически, а помечается
-- (revoked_at + replaced_by_id — цепочка ротаций). Предъявление уже
-- отозванного токена трактуется как кража: AuthService отзывает ВСЮ семью
-- refresh-токенов пользователя и логирует инцидент (метрика auth.refresh.reuse).
-- Физическая очистка истёкших — ленивая, в том же запросе refresh
-- (deleteExpiredTokens по expires_at).
-- Повторный прогон безопасен: IF NOT EXISTS / guard по pg_constraint.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by_id BIGINT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refresh_tokens_replaced_by') THEN
        ALTER TABLE refresh_tokens
            ADD CONSTRAINT fk_refresh_tokens_replaced_by
            FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL;
    END IF;
END$$;

-- выбор «все активные токены пользователя» (user_id) уже покрыт idx_refresh_tokens_user_id;
-- индекс по revoked_at — для ленивой чистки и аудита «что отозвано и когда».
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at);
