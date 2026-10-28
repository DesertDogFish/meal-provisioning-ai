-- V26__emis_local_copy.sql
-- Локальная копия ЕМИСС в нашей БД (plans/2026-10-28-emis-local-copy-and-product-linking.md).
--
-- Зачем: раньше цена искалась во внешней выгрузке по ingredient_mappings.external_code,
-- где хранился id ЗНАЧЕНИЯ ФИЛЬТРА со страницы (например 1743453), а не код классификатора
-- ЕМИСС (105 = «Фарш мясной, кг»). Из-за этого синк отвечал «У категории нет данных о ценах
-- в выгрузке». Теперь портал — только транспорт: выгрузка разбирается и кладётся в наши
-- таблицы, а продукт привязан к коду классификатора напрямую (ingredients.emis_code).
--
-- 1) emis_products — справочник «Товары и услуги» (ось s_grtov, 885 позиций).
--    CodeLists в SDMX-ответе всегда полные, поэтому справочник засевается целиком
--    из любой выгрузки (сид — V27, чтобы приложение работало без доступа к порталу).
-- 2) emis_prices — точки цен: товар × регион × год × месяц. Регион по умолчанию
--    643004.АГ = «Российская Федерация без учета новых субъектов (с 01.01.2023)».
--    Глубина — два последних года (конфиг period-years).
-- 3) ingredients.emis_code — «софт-привязка» продукта к строке справочника.
--
-- Внешних ключей между emis_* и ingredients НЕТ намеренно: привязка декларативная
-- («мы знаем, откуда хотим брать цену») и не должна ломать продукт, если справочник
-- ещё не загружен, а upsert цен не должен зависеть от порядка записи справочника.
-- Повторный прогон безопасен (IF NOT EXISTS / DROP INDEX IF EXISTS).

-- Единица измерения зашита в название позиции классификатора («Фарш мясной, кг»,
-- «Консервы мясные, 350 г», «Спички, коробок»), поэтому она разбирается на три
-- машиночитаемых поля: kind/amount/scale — по ним цена ЕМИСС приводится к единице
-- нашего продукта (UnitPriceConverter). unit_label хранит исходный суффикс для UI.
-- kind='OTHER' — услуги, метры, сутки, поездки: к продуктам не приводится.
CREATE TABLE IF NOT EXISTS emis_products (
    code        VARCHAR(16) PRIMARY KEY,
    name        VARCHAR(500) NOT NULL,
    unit_kind   VARCHAR(8)  NOT NULL DEFAULT 'OTHER'
                CHECK (unit_kind IN ('MASS', 'VOLUME', 'COUNT', 'OTHER')),
    unit_amount NUMERIC(10, 3) NOT NULL DEFAULT 1 CHECK (unit_amount > 0),
    unit_scale  VARCHAR(4)  NOT NULL DEFAULT 'PCS'
                CHECK (unit_scale IN ('KG', 'G', 'L', 'ML', 'PCS')),
    unit_label  VARCHAR(32),
    loaded_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_emis_products_name ON emis_products (name);

CREATE TABLE IF NOT EXISTS emis_prices (
    id           BIGSERIAL PRIMARY KEY,
    emis_code    VARCHAR(16) NOT NULL,
    region_code  VARCHAR(16) NOT NULL,
    period_year  INT NOT NULL,
    period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    price        NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
    loaded_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (emis_code, region_code, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_emis_prices_lookup
    ON emis_prices (emis_code, region_code, period_year DESC, period_month DESC);

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS emis_code VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_ingredients_emis_code ON ingredients (emis_code);
