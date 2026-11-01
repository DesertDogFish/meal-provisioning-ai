-- KB-24: Оптимистичные блокировки (@Version) для 7 сущностей похода
-- version BIGINT NOT NULL DEFAULT 0 — безопасна к перенакату (IF NOT EXISTS)
-- Hibernate validate проходит при наличии колонки

DO $$
BEGIN
    -- trips
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='version') THEN
        ALTER TABLE trips ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_days
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_days' AND column_name='version') THEN
        ALTER TABLE trip_days ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_meals
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_meals' AND column_name='version') THEN
        ALTER TABLE trip_meals ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_manual_items
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_manual_items' AND column_name='version') THEN
        ALTER TABLE trip_manual_items ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_price_overrides
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_price_overrides' AND column_name='version') THEN
        ALTER TABLE trip_price_overrides ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_shopping_exclusions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_shopping_exclusions' AND column_name='version') THEN
        ALTER TABLE trip_shopping_exclusions ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
    
    -- trip_ingredient_substitutions
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_ingredient_substitutions' AND column_name='version') THEN
        ALTER TABLE trip_ingredient_substitutions ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
    END IF;
END$$;
