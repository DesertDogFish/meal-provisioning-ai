-- V32__trip_checklist_bought.sql
-- KB-15: серверное хранение отметок «взято» (checklist bought) по походу.
-- Раньше отметки жили только в localStorage браузера и терялись при смене устройства.
-- neededStamp — метка «на какой версии потребности» сделана отметка (клиентский
-- монотонный штамп): при пересчёте потребности старая отметка перестаёт совпадать
-- и позиция снова считается невзятой.
-- Полная замена набора — идемпотентный PUT, поэтому уникальность по тройке
-- (trip_id, ingredient_id, needed_stamp).

CREATE TABLE IF NOT EXISTS trip_checklist_bought (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id),
    needed_stamp BIGINT NOT NULL,
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_tcb_trip_ingredient_stamp UNIQUE (trip_id, ingredient_id, needed_stamp)
);

CREATE INDEX IF NOT EXISTS idx_tcb_trip ON trip_checklist_bought(trip_id);
