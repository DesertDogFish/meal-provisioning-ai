-- V23__shopping_exclusions_day_scope.sql
-- Fix-5 / PLAN R2 (шаг 2): по-дневные исключения закупки.
-- Раньше исключение действовало на ВЕСЬ поход (unique trip_id+ingredient_id).
-- Теперь day_date NULL = глобальное исключение (прежняя семантика),
-- day_date = конкретный день — позиция снимается только с этого дня
-- (Fix-2 п.5: «исключение во вторник не должно вычёркивать продукт в среду»).
--
-- Уникальность — два partial-индекса (переносимо между версиями PG, в отличие
-- от NULLS NOT DISTINCT из PG15): отдельная пара (trip, ingredient) для глобальных
-- и тройка (trip, ingredient, day) для дневных.

ALTER TABLE trip_shopping_exclusions
    ADD COLUMN IF NOT EXISTS day_date DATE NULL;

ALTER TABLE trip_shopping_exclusions
    DROP CONSTRAINT IF EXISTS trip_shopping_exclusions_trip_id_ingredient_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tse_trip_ingredient_global
    ON trip_shopping_exclusions (trip_id, ingredient_id)
    WHERE day_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tse_trip_ingredient_day
    ON trip_shopping_exclusions (trip_id, ingredient_id, day_date)
    WHERE day_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tse_trip_day ON trip_shopping_exclusions (trip_id, day_date);
