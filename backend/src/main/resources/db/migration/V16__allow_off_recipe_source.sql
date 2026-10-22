-- V16__allow_off_recipe_source.sql
-- Добавление 'OFF' в CHECK-ограничения колонки source.
-- Без этого маппинги ингредиентов Open Food Facts не сохраняются:
-- "violates check constraint ingredient_mappings_source_check".

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'API', 'AI'));

ALTER TABLE staging_recipes DROP CONSTRAINT IF EXISTS staging_recipes_source_check;
ALTER TABLE staging_recipes ADD CONSTRAINT staging_recipes_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'API', 'AI'));

ALTER TABLE ingredient_mappings DROP CONSTRAINT IF EXISTS ingredient_mappings_source_check;
ALTER TABLE ingredient_mappings ADD CONSTRAINT ingredient_mappings_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'API', 'AI'));

-- ingredient_prices.source (CHECK из V5) уже допускает 'OFF' — изменений не требуется.
