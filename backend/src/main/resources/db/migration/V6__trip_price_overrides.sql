-- V6__trip_price_overrides.sql
-- Таблица для хранения фактических цен (оверрайдов) по походам

CREATE TABLE trip_price_overrides (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    actual_price NUMERIC(14,2) NOT NULL CHECK (actual_price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    comment VARCHAR(500),
    updated_by BIGINT REFERENCES users(id),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (trip_id, ingredient_id)
);

CREATE INDEX idx_tpo_trip ON trip_price_overrides(trip_id);
CREATE INDEX idx_tpo_ingredient ON trip_price_overrides(ingredient_id);
