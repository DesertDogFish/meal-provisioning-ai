-- V20__trip_catalog_snapshots.sql
-- Изоляция данных похода: copy-on-write снепшоты каталога.
--
-- Проблема: trip_meals/overrides/exclusions ссылались на ГЛОБАЛЬНЫЕ recipes/ingredients,
-- из-за чего (а) админ не мог удалить/заменить продукт или блюдо, занятые чужим походом
-- (FK RESTRICT + usedIn-проверки), и (б) правки справочника и цен ретроспективно меняли
-- уже спланированные походы.
--
-- Решение (легковесное, без новых сущностей-дублёров): те же таблицы recipes/ingredients
-- получают trip_id (владелец-поход; NULL = глобальный справочник) и snapshot_of (ссылка на
-- исходную запись справочника, ON DELETE SET NULL — удаление оригинала не роняет копию).
-- При добавлении приёма пищи бэкенд создаёт копию рецепта + копии задействованных продуктов
-- + одну актуальную строку цены на копию продукта (план похода замораживается).
-- Уникальность имени продукта сохраняется ТОЛЬКО среди глобальных записей (partial index).
--
-- Бэкфил: существующие походы переводятся на снепшоты этой же миграцией (temp-таблицы
-- соответствий), включая перепривязку overrides/exclusions/substitutions. После миграции
-- все trip_meals указывают на trip-scoped копии рецептов.

-- 0) Колонки снепшотов
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS trip_id BIGINT REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS snapshot_of BIGINT REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS trip_id BIGINT REFERENCES trips(id) ON DELETE CASCADE;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS snapshot_of BIGINT REFERENCES ingredients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recipes_trip ON recipes(trip_id);
CREATE INDEX IF NOT EXISTS idx_recipes_snapshot_of ON recipes(snapshot_of);
CREATE INDEX IF NOT EXISTS idx_ingredients_trip ON ingredients(trip_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_snapshot_of ON ingredients(snapshot_of);

-- 1) Уникальность идентичности продукта — только среди глобальных записей
DROP INDEX IF EXISTS uniq_product_identity;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_identity_global
    ON ingredients (name_norm, unit) WHERE trip_id IS NULL;

-- 2) Бэкфил: продукты, задействованные существующими походами.
-- DROP в начале: TestDataIsolation перенакатывает Flyway в той же сессии —
-- temp-таблицы прошлого прогона иначе ловят 42P07 «relation already exists».
DROP TABLE IF EXISTS ing_src;
DROP TABLE IF EXISTS map_ing;
DROP TABLE IF EXISTS rec_src;
DROP TABLE IF EXISTS map_rec;

CREATE TEMP TABLE ing_src AS
SELECT DISTINCT t.id AS trip_id, i.id AS src_id, i.name, i.unit, i.category_id,
       i.kcal_per_100g, i.piece_weight_g, i.pack_size, i.round_to_packs, i.name_norm
FROM trips t
JOIN trip_days td ON td.trip_id = t.id
JOIN trip_meals tm ON tm.trip_day_id = td.id
JOIN recipes r ON r.id = tm.recipe_id AND r.trip_id IS NULL
JOIN recipe_ingredients ri ON ri.recipe_id = r.id
JOIN ingredients i ON i.id = ri.ingredient_id AND i.trip_id IS NULL
UNION
SELECT DISTINCT t.id, i.id, i.name, i.unit, i.category_id,
       i.kcal_per_100g, i.piece_weight_g, i.pack_size, i.round_to_packs, i.name_norm
FROM trips t
JOIN trip_price_overrides o ON o.trip_id = t.id
JOIN ingredients i ON i.id = o.ingredient_id AND i.trip_id IS NULL
UNION
SELECT DISTINCT t.id, i.id, i.name, i.unit, i.category_id,
       i.kcal_per_100g, i.piece_weight_g, i.pack_size, i.round_to_packs, i.name_norm
FROM trips t
JOIN trip_shopping_exclusions e ON e.trip_id = t.id
JOIN ingredients i ON i.id = e.ingredient_id AND i.trip_id IS NULL
UNION
SELECT DISTINCT t.id, i.id, i.name, i.unit, i.category_id,
       i.kcal_per_100g, i.piece_weight_g, i.pack_size, i.round_to_packs, i.name_norm
FROM trips t
JOIN trip_ingredient_substitutions s ON s.trip_id = t.id
LEFT JOIN ingredients i ON i.id IN (s.from_ingredient_id, s.to_ingredient_id) AND i.trip_id IS NULL
WHERE i.id IS NOT NULL;

CREATE TEMP TABLE map_ing (trip_id BIGINT, src_id BIGINT, new_id BIGINT);

WITH ins AS (
    INSERT INTO ingredients (name, unit, category_id, kcal_per_100g, piece_weight_g,
                             pack_size, round_to_packs, name_norm, trip_id, snapshot_of)
    SELECT s.name, s.unit, s.category_id, s.kcal_per_100g, s.piece_weight_g,
           s.pack_size, s.round_to_packs, s.name_norm, s.trip_id, s.src_id
    FROM ing_src s
    ORDER BY s.trip_id, s.src_id
    RETURNING trip_id, snapshot_of, id
)
INSERT INTO map_ing (trip_id, src_id, new_id)
SELECT trip_id, snapshot_of, id FROM ins;

-- Заморозка плановой цены: одна актуальная строка на копию продукта
INSERT INTO ingredient_prices (ingredient_id, effective_from, price_per_unit, currency, source)
SELECT m.new_id, p.effective_from, p.price_per_unit, p.currency, p.source
FROM map_ing m
CROSS JOIN LATERAL (
    SELECT pp.effective_from, pp.price_per_unit, pp.currency, pp.source
    FROM ingredient_prices pp
    WHERE pp.ingredient_id = m.src_id AND pp.effective_from <= CURRENT_DATE
    ORDER BY pp.effective_from DESC
    LIMIT 1
) p;

-- 3) Бэкфил: рецепты, на которые ссылается меню походов
CREATE TEMP TABLE rec_src AS
SELECT DISTINCT t.id AS trip_id, r.id AS src_id, r.name, r.meal_type, r.category,
       r.cook_minutes, r.base_servings, r.calories_per_serving, r.source
FROM trips t
JOIN trip_days td ON td.trip_id = t.id
JOIN trip_meals tm ON tm.trip_day_id = td.id
JOIN recipes r ON r.id = tm.recipe_id AND r.trip_id IS NULL;

CREATE TEMP TABLE map_rec (trip_id BIGINT, src_id BIGINT, new_id BIGINT);

WITH ins AS (
    INSERT INTO recipes (name, meal_type, category, cook_minutes, base_servings,
                         calories_per_serving, source, trip_id, snapshot_of)
    SELECT s.name, s.meal_type, s.category, s.cook_minutes, s.base_servings,
           s.calories_per_serving, s.source, s.trip_id, s.src_id
    FROM rec_src s
    ORDER BY s.trip_id, s.src_id
    RETURNING trip_id, snapshot_of, id
)
INSERT INTO map_rec (trip_id, src_id, new_id)
SELECT trip_id, snapshot_of, id FROM ins;

-- Составы копий рецептов → на копии продуктов того же похода
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT mr.new_id, mi.new_id, ri.amount
FROM rec_src s
JOIN map_rec mr ON mr.trip_id = s.trip_id AND mr.src_id = s.src_id
JOIN recipe_ingredients ri ON ri.recipe_id = s.src_id
JOIN map_ing mi ON mi.trip_id = s.trip_id AND mi.src_id = ri.ingredient_id;

-- 4) Перепривязка ссылок походов на снепшоты
UPDATE trip_meals tm SET recipe_id = mr.new_id
FROM trip_days td, map_rec mr
WHERE tm.trip_day_id = td.id
  AND mr.trip_id = td.trip_id
  AND mr.src_id = tm.recipe_id;

UPDATE trip_price_overrides o SET ingredient_id = mi.new_id
FROM map_ing mi
WHERE mi.trip_id = o.trip_id AND mi.src_id = o.ingredient_id;

UPDATE trip_shopping_exclusions e SET ingredient_id = mi.new_id
FROM map_ing mi
WHERE mi.trip_id = e.trip_id AND mi.src_id = e.ingredient_id;

UPDATE trip_ingredient_substitutions s SET from_ingredient_id = mi.new_id
FROM map_ing mi
WHERE mi.trip_id = s.trip_id AND mi.src_id = s.from_ingredient_id;

UPDATE trip_ingredient_substitutions s SET to_ingredient_id = mi.new_id
FROM map_ing mi
WHERE mi.trip_id = s.trip_id AND mi.src_id = s.to_ingredient_id;

UPDATE trip_ingredient_substitutions s SET recipe_id = mr.new_id
FROM map_rec mr
WHERE mr.trip_id = s.trip_id AND mr.src_id = s.recipe_id;

-- Temp-таблицы умирают вместе с сессией миграции; явных DROP не требуется.
