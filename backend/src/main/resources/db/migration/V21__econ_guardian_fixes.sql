-- V21__econ_guardian_fixes.sql
-- Три исправления данных/схемы под «экономический страж» (EconomicConsistencyTest):
--
-- 1) SCALED-правки состава («замена на себя», from==to, FORM-meal-composition-spec §3)
--    физически не сохранялись: безымянный CHECK из V7 (from_ingredient_id <> to_ingredient_id)
--    отклонял строку → сохранение состава с правкой количества падало в 500
--    (DataIntegrityViolation «trip_ingredient_substitutions_check»). Сервисный уровень
--    по-прежнему запрещает SUBST from==to (MealCompositionService.validate) — для SCALE
--    такая строка легальна.
ALTER TABLE trip_ingredient_substitutions
    DROP CONSTRAINT IF EXISTS trip_ingredient_substitutions_check;

-- 2) EXTRA — АБСОЛЮТ на приём. Старая схема хранила amount_per_serving = abs/people,
--    а SummaryService дополнительно делил на base_servings → вклад EXTRA в закупку
--    занижался в base раз и расходился с составом/UI/mock. Теперь в amount_per_serving
--    added-строк лежит абсолют; конвертируем legacy-строки (× effectivePeople первого
--    приёма рецепта в этом походе — best effort, точное people на момент ввода
--    не восстанавливаемо).
-- DROP в начале: TestDataIsolation перенакатывает Flyway в той же сессии (урок V20).
DROP TABLE IF EXISTS extra_abs_fix;

CREATE TEMP TABLE extra_abs_fix AS
SELECT s.id AS sub_id,
       COALESCE(fm.meal_people_override, fm.day_people_override, t.default_people, 1) AS people
FROM trip_ingredient_substitutions s
JOIN trips t ON t.id = s.trip_id
LEFT JOIN LATERAL (
    SELECT tm.people_override AS meal_people_override,
           td.people_override AS day_people_override
    FROM trip_meals tm
    JOIN trip_days td ON td.id = tm.trip_day_id
    WHERE td.trip_id = s.trip_id
      AND tm.recipe_id = s.recipe_id
    ORDER BY tm.id
    LIMIT 1
) fm ON true
WHERE s.added = TRUE
  AND s.amount_per_serving IS NOT NULL;

UPDATE trip_ingredient_substitutions s
SET amount_per_serving = ROUND(s.amount_per_serving * f.people, 3)
FROM extra_abs_fix f
WHERE s.id = f.sub_id;

-- 3) Дедупликация снепшотов продуктов: TripCatalogSnapshotService.createRecipeCopy до фикса
--    создавал СВОЮ копию продукта на каждый рецепт похода (вместо переиспользования
--    findByTripIdAndSnapshotOf) — один продукт разъезжался на несколько строк закупки
--    (дубли «Гречка 4.2» + «Гречка 1.5» вместо 5.7, отдельные упаковки/цены), а
--    findByTripIdAndSnapshotOf падал IncorrectResultSize (500 при вводе чека).
--    Каноническая копия — MIN(id) на (trip_id, snapshot_of); ссылки перепривязываем,
--    дубли цен/исключений удаляем, копии удаляем.
DROP TABLE IF EXISTS ing_dedup;

CREATE TEMP TABLE ing_dedup AS
SELECT trip_id, snapshot_of, MIN(id) AS keep_id
FROM ingredients
WHERE trip_id IS NOT NULL AND snapshot_of IS NOT NULL
GROUP BY trip_id, snapshot_of
HAVING count(*) > 1;

UPDATE recipe_ingredients ri
SET ingredient_id = d.keep_id
FROM ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE ri.ingredient_id = i.id AND i.id <> d.keep_id;

-- Правки состава: сначала убираем строки дублей, которые после перепривязки
-- столкнулись бы с каноническими по unique-индексам, затем перепривязываем остальные.
DELETE FROM trip_ingredient_substitutions s
USING ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE s.from_ingredient_id = i.id AND i.id <> d.keep_id
  AND EXISTS (SELECT 1 FROM trip_ingredient_substitutions k
              WHERE k.trip_id = s.trip_id AND k.recipe_id = s.recipe_id
                AND k.from_ingredient_id = d.keep_id);

DELETE FROM trip_ingredient_substitutions s
USING ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE s.to_ingredient_id = i.id AND i.id <> d.keep_id AND s.added = TRUE
  AND EXISTS (SELECT 1 FROM trip_ingredient_substitutions k
              WHERE k.trip_id = s.trip_id AND k.recipe_id = s.recipe_id
                AND k.to_ingredient_id = d.keep_id AND k.added = TRUE);

UPDATE trip_ingredient_substitutions s
SET from_ingredient_id = d.keep_id
FROM ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE s.from_ingredient_id = i.id AND i.id <> d.keep_id;

UPDATE trip_ingredient_substitutions s
SET to_ingredient_id = d.keep_id
FROM ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE s.to_ingredient_id = i.id AND i.id <> d.keep_id;

-- Оверрайды/исключения: строки дублей, конфликтующие с канонической (unique trip+ingredient),
-- удаляем; остальные перепривязываем.
DELETE FROM trip_price_overrides o
USING ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE o.ingredient_id = i.id AND i.id <> d.keep_id
  AND EXISTS (SELECT 1 FROM trip_price_overrides k
              WHERE k.trip_id = o.trip_id AND k.ingredient_id = d.keep_id);

UPDATE trip_price_overrides o
SET ingredient_id = d.keep_id
FROM ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE o.ingredient_id = i.id AND i.id <> d.keep_id;

DELETE FROM trip_shopping_exclusions e
USING ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE e.ingredient_id = i.id AND i.id <> d.keep_id;

DELETE FROM ingredient_prices p
USING ingredients i
JOIN ing_dedup d ON d.trip_id = i.trip_id AND d.snapshot_of = i.snapshot_of
WHERE p.ingredient_id = i.id AND i.id <> d.keep_id;

DELETE FROM ingredients i
USING ing_dedup d
WHERE i.trip_id = d.trip_id AND i.snapshot_of = d.snapshot_of AND i.id <> d.keep_id;

-- 4) Замороженные цены снепшотов обязаны быть видимы на ЛЮБОЙ день похода
--    (effective_from <= start_date): и серверный срез (loadLatestPrices на endDate +
--    спуск по дням), и клиентский findPriceForDate(day) берут строки effective_from <= дата.
--    V20-бэкфил копировал effective_from оригинала как есть — у походов с прошедшими
--    датами план терялся (plannedCost=null, заниженные итоги, «чушь» в KPI «на человека»).
UPDATE ingredient_prices p
SET effective_from = t.start_date
FROM ingredients i
JOIN trips t ON t.id = i.trip_id
WHERE p.ingredient_id = i.id
  AND i.trip_id IS NOT NULL
  AND p.effective_from > t.start_date;
