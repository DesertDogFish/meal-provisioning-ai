-- trip-workflow-redesign п.2: явное утверждение меню похода (этап ①).
-- Toggle-мутация owner-only; оптимистичная блокировка — общий @Version (V34).
-- БЕЗ backfill: продукт в бете, реальных походов нет — старые строки остаются
-- неутверждёнными (РЕШЕНО владельцем 03.11.2026).
ALTER TABLE trips ADD COLUMN menu_approved_at TIMESTAMPTZ NULL;
