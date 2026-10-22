-- V2__catalog_extensions.sql
-- Расширение каталога: code для ингредиентов, category и cook_minutes для рецептов

-- Добавляем code для ингредиентов (для внешних интеграций)
ALTER TABLE ingredients ADD COLUMN code VARCHAR(64) UNIQUE;

-- Добавляем category и cook_minutes для рецептов
ALTER TABLE recipes ADD COLUMN category VARCHAR(40);
ALTER TABLE recipes ADD COLUMN cook_minutes INT NOT NULL DEFAULT 0 CHECK (cook_minutes >= 0);

-- Индексы для фильтрации
CREATE INDEX idx_recipes_meal_category ON recipes (meal_type, category);
CREATE INDEX idx_recipes_cook ON recipes (cook_minutes);
CREATE INDEX idx_ingredients_code ON ingredients (code);
