-- Users table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Refresh tokens table
CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Ingredients table
CREATE TABLE ingredients (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    unit VARCHAR(10) NOT NULL CHECK (unit IN ('KG', 'L', 'PCS')),
    category VARCHAR(100) NOT NULL,
    calories_per_unit NUMERIC(10, 2),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ingredients_name ON ingredients(name);
CREATE INDEX idx_ingredients_category ON ingredients(category);

-- Ingredient prices table
CREATE TABLE ingredient_prices (
    id BIGSERIAL PRIMARY KEY,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    price_per_unit NUMERIC(10, 2) NOT NULL CHECK (price_per_unit >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'RUB',
    effective_from DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ingredient_id, effective_from)
);

CREATE INDEX idx_ingredient_prices_ingredient_id ON ingredient_prices(ingredient_id);
CREATE INDEX idx_ingredient_prices_effective_from ON ingredient_prices(effective_from);

-- Recipes table
CREATE TABLE recipes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
    base_servings INTEGER NOT NULL CHECK (base_servings > 0),
    calories_per_serving INTEGER,
    source VARCHAR(20) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'API', 'AI')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipes_name ON recipes(name);
CREATE INDEX idx_recipes_meal_type ON recipes(meal_type);

-- Recipe ingredients table
CREATE TABLE recipe_ingredients (
    id BIGSERIAL PRIMARY KEY,
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id BIGINT NOT NULL REFERENCES ingredients(id),
    amount NUMERIC(10, 3) NOT NULL CHECK (amount > 0),
    UNIQUE(recipe_id, ingredient_id)
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);

-- Trips table
CREATE TABLE trips (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    default_people INTEGER NOT NULL CHECK (default_people > 0),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_trip_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_trips_user_id ON trips(user_id);
CREATE INDEX idx_trips_start_date ON trips(start_date);
CREATE INDEX idx_trips_end_date ON trips(end_date);

-- Trip days table
CREATE TABLE trip_days (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_date DATE NOT NULL,
    people_override INTEGER CHECK (people_override > 0),
    UNIQUE(trip_id, day_date)
);

CREATE INDEX idx_trip_days_trip_id ON trip_days(trip_id);
CREATE INDEX idx_trip_days_day_date ON trip_days(day_date);

-- Trip meals table
CREATE TABLE trip_meals (
    id BIGSERIAL PRIMARY KEY,
    trip_day_id BIGINT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL CHECK (meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
    recipe_id BIGINT NOT NULL REFERENCES recipes(id),
    people_override INTEGER CHECK (people_override > 0),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_trip_meals_trip_day_id ON trip_meals(trip_day_id);
CREATE INDEX idx_trip_meals_recipe_id ON trip_meals(recipe_id);

-- Staging recipes table (for import workflow)
CREATE TABLE staging_recipes (
    id BIGSERIAL PRIMARY KEY,
    source VARCHAR(20) NOT NULL CHECK (source IN ('MANUAL', 'API', 'AI')),
    raw_payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    suggested_name VARCHAR(255),
    suggested_meal_type VARCHAR(20) CHECK (suggested_meal_type IN ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
    suggested_ingredients JSONB,
    reviewed_at TIMESTAMP,
    reviewed_by BIGINT REFERENCES users(id),
    rejection_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_staging_recipes_status ON staging_recipes(status);
CREATE INDEX idx_staging_recipes_source ON staging_recipes(source);

-- Ingredient mappings table (for external ingredient mapping)
CREATE TABLE ingredient_mappings (
    id BIGSERIAL PRIMARY KEY,
    external_name VARCHAR(255) NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('MANUAL', 'API', 'AI')),
    internal_ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(external_name, source)
);

CREATE INDEX idx_ingredient_mappings_external_name ON ingredient_mappings(external_name);
CREATE INDEX idx_ingredient_mappings_internal_ingredient_id ON ingredient_mappings(internal_ingredient_id);
