-- V11__kcal_per_100g_and_pack_unit.sql
-- CR-1: калорийность всегда на 100 г/мл
-- CR-2: единицы KG/L/PCS/PACK

-- 1. Переименование колонки калорийности
ALTER TABLE ingredients RENAME COLUMN calories_per_unit TO kcal_per_100g;
COMMENT ON COLUMN ingredients.kcal_per_100g IS
  'Ккал на 100 г (KG) / 100 мл (L); для PCS/PACK пересчёт через piece_weight_g';

-- 2. Вес одной штуки/упаковки (обязателен для PCS/PACK при наличии ккал)
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS piece_weight_g NUMERIC(10,2)
  CHECK (piece_weight_g > 0);
COMMENT ON COLUMN ingredients.piece_weight_g IS
  'Вес 1 шт / 1 уп в граммах. Обязательно для PCS/PACK если заполнена kcal_per_100g';

-- 3. Пометка deprecated для ручных ккал рецепта
COMMENT ON COLUMN recipes.calories_per_serving IS
  'Deprecated: считается из kcal_per_100g продуктов по формуле ядра';

-- 4. Расширение constraint единиц (добавляем PACK)
DO $$
BEGIN
  BEGIN
    ALTER TABLE ingredients DROP CONSTRAINT ingredients_unit_check;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
END $$;
ALTER TABLE ingredients ADD CONSTRAINT ingredients_unit_check
  CHECK (unit IN ('KG','L','PCS','PACK'));
