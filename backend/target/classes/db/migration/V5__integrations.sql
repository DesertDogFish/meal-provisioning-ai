-- V5__integrations.sql
-- Таблицы для интеграции с внешними провайдерами цен (Open Food Facts)

-- Интеграции с провайдерами
CREATE TABLE integrations (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(40) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED' 
        CHECK (status IN ('DISCONNECTED', 'CONNECTED', 'ERROR')),
    base_url VARCHAR(255),
    settings JSONB,
    last_connected_at TIMESTAMP,
    last_sync_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_status ON integrations(status);

-- Внешние продукты (кэш из OFF)
CREATE TABLE external_products (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,
    external_code VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    pack_amount NUMERIC(14,3),
    pack_unit VARCHAR(10),
    image_url VARCHAR(500),
    raw JSONB,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (provider, external_code)
);

CREATE INDEX idx_external_products_provider ON external_products(provider);
CREATE INDEX idx_external_products_external_code ON external_products(external_code);
CREATE INDEX idx_external_products_name ON external_products(name);

-- Журнал синхронизаций
CREATE TABLE sync_logs (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(40) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CATALOG', 'PRICES')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    started_at TIMESTAMP NOT NULL DEFAULT now(),
    finished_at TIMESTAMP,
    created_count INT NOT NULL DEFAULT 0,
    updated_count INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    details JSONB
);

CREATE INDEX idx_sync_logs_provider ON sync_logs(provider);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);

-- Добавляем поля для внешнего кода в маппинги
ALTER TABLE ingredient_mappings ADD COLUMN IF NOT EXISTS external_code VARCHAR(64);
ALTER TABLE ingredient_mappings ADD COLUMN IF NOT EXISTS external_product_id BIGINT 
    REFERENCES external_products(id) ON DELETE SET NULL;

-- Добавляем source в ingredient_prices для отслеживания источника цены
ALTER TABLE ingredient_prices ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'MANUAL'
    CHECK (source IN ('MANUAL', 'OFF', 'API'));
