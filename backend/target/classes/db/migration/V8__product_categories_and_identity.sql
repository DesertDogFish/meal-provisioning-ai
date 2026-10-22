-- V8__product_categories_and_identity.sql
-- Экран "Продукты": справочник категорий, нормализованное имя, уникальность (name_norm, unit)

-- 1. Справочник категорий (закрытый список)
CREATE TABLE product_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO product_categories (name, slug, sort_order) VALUES
 ('Крупы','krupy',1),
 ('Консервы','konservy',2),
 ('Напитки','napitki',3),
 ('Молочное','molochnoe',4),
 ('Овощи и зелень','ovoshchi',5),
 ('Фрукты и сухофрукты','frukty',6),
 ('Сладкое','sladkoe',7),
 ('Бакалея','bakaleya',8),
 ('Специи','spetsii',9),
 ('Мясо','myaso',10),
 ('Рыба','ryba',11),
 ('Хлеб','hleb',12),
 ('Масла','masla',13),
 ('Бобовые','bobovye',14),
 ('Орехи','orehi',15),
 ('Сухофрукты','suhofrukty',16),
 ('Супы','supy',17),
 ('Грибы','griby',18),
 ('Прочее','prochee',99);

CREATE INDEX idx_product_categories_sort ON product_categories(sort_order);

-- 2. Категория становится обязательной ссылкой
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES product_categories(id);

-- Миграция старых текстовых категорий в ссылки
UPDATE ingredients i SET category_id = c.id
  FROM product_categories c
  WHERE lower(trim(i.category)) = lower(c.name) AND i.category_id IS NULL;

-- Остальное — в "Прочее"
UPDATE ingredients SET category_id = (SELECT id FROM product_categories WHERE slug='prochee')
  WHERE category_id IS NULL;

ALTER TABLE ingredients ALTER COLUMN category_id SET NOT NULL;

-- Удаляем старую текстовую колонку (если она есть)
ALTER TABLE ingredients DROP COLUMN IF EXISTS category;

-- 3. Нормализованное имя для проверки дублей
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS name_norm VARCHAR(255);

UPDATE ingredients SET name_norm =
  lower(btrim(regexp_replace(replace(replace(name,'Ё','Е'),'ё','е'), '\s+', ' ', 'g')))
  WHERE name_norm IS NULL;

ALTER TABLE ingredients ALTER COLUMN name_norm SET NOT NULL;

-- Снимаем старую уникальность по имени
DO $$
BEGIN
  BEGIN
    ALTER TABLE ingredients DROP CONSTRAINT ingredients_name_key;
  EXCEPTION
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- Уникальность: (name_norm, unit)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_identity ON ingredients (name_norm, unit);
CREATE INDEX IF NOT EXISTS idx_ingredients_category_id ON ingredients(category_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_name_norm ON ingredients(name_norm);
