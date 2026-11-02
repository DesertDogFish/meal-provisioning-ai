-- KB-24 (продолжение): оптимистичные блокировки для trip_checklist_bought
-- version BIGINT NOT NULL DEFAULT 0 — безопасна к перенакату (IF NOT EXISTS)
-- Hibernate validate проходит при наличии колонки

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_checklist_bought' AND column_name='version') THEN
        ALTER TABLE trip_checklist_bought ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
END$$;
