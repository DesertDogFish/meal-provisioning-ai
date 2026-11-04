-- V39__emis_factor_on_ingredient.sql
-- BL-14: коэффициент фасовки на привязке («наш продукт = N упаковок ЕМИСС»).
-- Альтернатива переводу продукта на фасовку ЕМИСС (V29): вместо пересчёта
-- piece_weight_g и истории цен храним множитель emis_factor и применяем его
-- при перекладывании цен из локальной копии ЕМИСС в ingredient_prices.
-- NULL/отсутствие → 1 (поведение как раньше).
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS emis_factor NUMERIC(10,3);
UPDATE ingredients SET emis_factor = 1 WHERE emis_factor IS NULL;
