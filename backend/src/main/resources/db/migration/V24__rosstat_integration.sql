-- V24__rosstat_integration.sql
-- Fix-13: интеграция с Росстатом (ЕМИСС) вместо Open Food Facts.
--
-- 1) 'ROSSTAT' добавляется в CHECK-ограничения колонок source (по образцу V16):
--    без этого маппинги/цены Росстата не сохранялись бы
--    ("violates check constraint ..._source_check").
-- 2) Строка интеграции ROSSTAT создаётся сразу (getAllIntegrations() читает
--    таблицу integrations; строки создаются лениво при connect — без сида
--    карточка провайдера не появилась бы в UI до первого подключения).
-- 3) Строка интеграции OFF удаляется (провайдер демонтирован). Legacy-данные
--    (external_products/ingredient_mappings c provider='OFF', source='OFF')
--    сохраняются: 'OFF' остаётся в enum RecipeSource и в CHECK-ограничениях.

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'ROSSTAT', 'API', 'AI'));

ALTER TABLE staging_recipes DROP CONSTRAINT IF EXISTS staging_recipes_source_check;
ALTER TABLE staging_recipes ADD CONSTRAINT staging_recipes_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'ROSSTAT', 'API', 'AI'));

ALTER TABLE ingredient_mappings DROP CONSTRAINT IF EXISTS ingredient_mappings_source_check;
ALTER TABLE ingredient_mappings ADD CONSTRAINT ingredient_mappings_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'ROSSTAT', 'API', 'AI'));

ALTER TABLE ingredient_prices DROP CONSTRAINT IF EXISTS ingredient_prices_source_check;
ALTER TABLE ingredient_prices ADD CONSTRAINT ingredient_prices_source_check
    CHECK (source IN ('MANUAL', 'OFF', 'ROSSTAT', 'API'));

INSERT INTO integrations (provider, status, base_url)
SELECT 'ROSSTAT', 'DISCONNECTED', 'https://www.fedstat.ru'
WHERE NOT EXISTS (SELECT 1 FROM integrations WHERE provider = 'ROSSTAT');

DELETE FROM integrations WHERE provider = 'OFF';
