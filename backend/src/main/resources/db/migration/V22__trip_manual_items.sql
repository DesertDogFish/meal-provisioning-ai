-- V22__trip_manual_items.sql
-- Fix-2 (список 26.10, U40 / PLAN R3): ручные позиции закупки — продукты к дню
-- похода или ко всему походу (day_id IS NULL), ВНЕ блюд: аптечка, антисептик,
-- топливо и т.п. Количество — АБСОЛЮТ (не на порцию), единица — из продукта.
--
-- day_id ON DELETE CASCADE: при смене дат похода (TripService.updateTrip) дни,
-- ушедшие из диапазона, удаляются вместе со своими ручными позициями;
-- trip_id ON DELETE CASCADE — удаление похода чистит позиции.
-- ingredient_id RESTRICT: продукт, занятый ручной позицией, нельзя удалить
-- из справочника молча (usedIn-проверка удаления продукта — задача R3, п.3).

CREATE TABLE IF NOT EXISTS trip_manual_items (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id BIGINT REFERENCES trip_days(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    amount NUMERIC(14,3) NOT NULL,
    note VARCHAR(255),
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT trip_manual_items_amount_chk CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_tmi_trip ON trip_manual_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_tmi_day ON trip_manual_items(day_id);
