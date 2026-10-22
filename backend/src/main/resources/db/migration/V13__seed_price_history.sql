-- V13__seed_price_history.sql
-- Демо-история цен: месячные срезы ingredient_prices за последние 24 месяца,
-- чтобы GET /admin/prices и блок «Цены» (E2E-05) в реальном режиме бэкенда
-- отдавали непустую историю (раньше сид был только по effective_from='2026-01-01').
-- Детерминированный сезонный дрейф вокруг базовой цены.

INSERT INTO ingredient_prices (ingredient_id, price_per_unit, currency, effective_from)
SELECT p.ingredient_id,
       ROUND(CAST(MAX(q.price_per_unit) * (1.0 + 0.03 * SIN(EXTRACT(MONTH FROM p.effective_from)::int * 1.1)) AS numeric), 2),
       'RUB',
       p.effective_from
FROM (
    SELECT i.id AS ingredient_id,
           (DATE_TRUNC('month', DATE '2026-10-01') - (n || ' month')::interval)::date AS effective_from
    FROM ingredients i
    CROSS JOIN generate_series(1, 23) AS n
) p
JOIN ingredient_prices q ON q.ingredient_id = p.ingredient_id
GROUP BY p.ingredient_id, p.effective_from;
