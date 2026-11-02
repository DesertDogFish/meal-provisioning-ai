-- V37__trip_checklist_actual_qty.sql
-- BL-27: серверное хранение ФАКТИЧЕСКОГО количества в чеклисте похода
-- («сколько реально берём/взяли» — {amount, unit}).
--
-- Раньше факт жил только в localStorage браузера (trip-checklist-actualqty-{tripId}),
-- поэтому в магазине с другого устройства пользователь видел расчётные значения,
-- а введённые ранее факты терялись при очистке кеша. Отметки «взято» уже
-- перенесены в V32/V33 — здесь вторая половина той же карточки BL-27.
--
-- Ключ агрегата — (trip_id, ingredient_id): факт задаётся на ПОЗИЦИЮ чеклиста, а
-- не на штамп потребности (в отличие от «взято»): при изменении числа людей факт
-- НЕ аннулируется, суммы пересчитываются от текущего «нужно».
-- amount — в ЧЕЛОВЕЧЕСКОЙ единице (unit), не в базовых единицах продукта.
-- version — оптимистичная блокировка (@Version) под AU-13/BL-41.

CREATE TABLE IF NOT EXISTS trip_checklist_actual_qty (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    amount NUMERIC(14, 3) NOT NULL CHECK (amount > 0),
    unit VARCHAR(16) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_tcaq_trip_ingredient UNIQUE (trip_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_tcaq_trip ON trip_checklist_actual_qty(trip_id);
