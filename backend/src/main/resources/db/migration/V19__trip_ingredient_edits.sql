-- V19__trip_ingredient_edits.sql (Фаза 14, N3)
-- Пер-походные правки состава блюда: добавление руками и мягкое удаление.
-- Таблица trip_ingredient_substitutions расширяется флагами added/removed;
-- from/to становятся nullable (добавление: from IS NULL; удаление: to IS NULL).

ALTER TABLE trip_ingredient_substitutions ALTER COLUMN from_ingredient_id DROP NOT NULL;
ALTER TABLE trip_ingredient_substitutions ALTER COLUMN to_ingredient_id DROP NOT NULL;

ALTER TABLE trip_ingredient_substitutions ADD COLUMN IF NOT EXISTS added BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trip_ingredient_substitutions ADD COLUMN IF NOT EXISTS removed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE trip_ingredient_substitutions ADD COLUMN IF NOT EXISTS amount_per_serving NUMERIC(14,3);

-- CHECK: хотя бы один из from/to задан
ALTER TABLE trip_ingredient_substitutions
    DROP CONSTRAINT IF EXISTS trip_ingredient_substitutions_from_or_to_chk;
ALTER TABLE trip_ingredient_substitutions
    ADD CONSTRAINT trip_ingredient_substitutions_from_or_to_chk
    CHECK (from_ingredient_id IS NOT NULL OR to_ingredient_id IS NOT NULL);

-- Уникальность по позиции для «удалений» (to IS NULL) отдельным partial-индексом:
CREATE UNIQUE INDEX IF NOT EXISTS uq_subs_trip_recipe_added
    ON trip_ingredient_substitutions(trip_id, recipe_id, to_ingredient_id)
    WHERE added = TRUE;

-- Мягкие исключения целого продукта из расчёта закупки похода (не привязаны к блюду)
CREATE TABLE IF NOT EXISTS trip_shopping_exclusions (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (trip_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_tse_trip ON trip_shopping_exclusions(trip_id);
