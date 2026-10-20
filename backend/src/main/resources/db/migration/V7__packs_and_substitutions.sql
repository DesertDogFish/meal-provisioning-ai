-- V7__packs_and_substitutions.sql
-- Упаковки компонентов и замены в походах

-- Добавляем поля упаковок в ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_size NUMERIC(14,3);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS round_to_packs BOOLEAN NOT NULL DEFAULT FALSE;

-- Таблица замен компонентов в походах
CREATE TABLE trip_ingredient_substitutions (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    from_ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    to_ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    ratio NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (ratio > 0),
    comment VARCHAR(500),
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (trip_id, recipe_id, from_ingredient_id),
    CHECK (from_ingredient_id <> to_ingredient_id)
);

CREATE INDEX idx_subs_trip ON trip_ingredient_substitutions(trip_id);
CREATE INDEX idx_subs_recipe ON trip_ingredient_substitutions(recipe_id);
