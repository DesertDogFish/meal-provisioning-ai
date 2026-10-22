# Architecture

## Overview

Provision — система планирования питания для походов и яхт. Приложение состоит из frontend (React + TypeScript) и backend (Spring Boot + PostgreSQL).

## Data Flow

### Режимы работы

Приложение поддерживает три режима работы с данными:

1. **AUTO** (по умолчанию)
   - Автоматическое определение доступности backend
   - При недоступности backend — переключение на mock-данные
   - Watchdog проверяет backend каждые 60 секунд
   - Визуальный индикатор режима в шапке (зелёный/янтарный/красный)

2. **FORCE_API**
   - Только backend, без mock-данных
   - При недоступности backend — ошибки на всех экранах
   - Для production-окружения

3. **FORCE_MOCK**
   - Только mock-данные в localStorage
   - Backend не используется
   - Для разработки и демо

### Слои данных

```
┌─────────────────────────────────────┐
│         UI Components               │
│  (ProductsPage, TripsPage, etc.)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      API Client (src/api/client.ts) │
│  - Единая точка входа               │
│  - Режимы AUTO/API/MOCK             │
│  - Watchdog для мониторинга         │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ Mock Server │  │ Real Backend │
│ (in-memory) │  │ (Spring Boot)│
└─────────────┘  └──────────────┘
```

## Core Calculations

### Расчёт калорийности (CR-1)

Формула ядра:
```
grams = amount × (KG|L → 1000; PCS|PACK → piece_weight_g)
kcal = grams / 100 × kcal_per_100g
```

Примеры:
- Овсянка 350 ккал/100г, 0.08 KG → 280 ккал
- Тушёнка 250 ккал/100г, 325г/шт, 1 шт → 812.5 ккал
- Молоко 60 ккал/100мл, 0.25 L → 150 ккал

### Расчёт закупок с упаковками

```
need = Σ(amount × people / baseServings) по всем приёмам пищи
packs = ceil(need / pack_size) если round_to_packs = true
buyAmount = packs × pack_size
leftover = buyAmount - need
cost = packs × packPrice
```

### Расчёт стоимости (план/факт)

**Плановая стоимость:**
- Берётся цена из `ingredient_prices` на дату дня похода
- Если цена менялась во время похода — для каждого дня своя цена

**Фактическая стоимость:**
- Используется `trip_price_overrides` (оверрайды цен для похода)
- Если оверрайд есть — используется он
- Если оверрайда нет — используется плановая цена

**Формула:**
```
plannedCost = amount × plannedUnitPrice(date)
actualCost = amount × (overridePrice ?? plannedUnitPrice(date))
delta = (actualCost - plannedCost) / plannedCost × 100
```

## Contract Frontend ↔ Backend

### DTO контракты

Все DTO используют:
- `unitLabel` — русское название единицы (кг/л/шт/уп)
- `plannedCost` / `actualCost` — плановая и фактическая стоимость
- `packsToBuy` / `leftover` — количество упаковок и остаток
- `substitutedFrom` — информация о замене компонента
- `calculatedCaloriesPerServing` — расчётная калорийность порции

### Формат дат

- Все даты в формате ISO 8601: `yyyy-MM-dd`
- Даты-время: `yyyy-MM-ddTHH:mm:ss`

### Формат денег

- Все деньги хранятся как `BigDecimal` (backend) / `number` (frontend)
- Округление до 2 знаков после запятой
- Без потерь точности при вычислениях

## Key Components

### Backend

- **SummaryService** — расчёт сводок (меню, закупки, на человека)
- **PriceResolutionService** — разрешение цен (план/факт)
- **KcalCalculator** — расчёт калорийности по формуле ядра
- **IntegrationService** — синхронизация с Open Food Facts

### Frontend

- **API Client** (`src/api/client.ts`) — единая точка входа
- **Mock Server** (`src/api/mockServer.ts`) — мок-данные
- **Mode Manager** (`src/api/mode.ts`) — управление режимами
- **Watchdog** (`src/api/watchdog.ts`) — мониторинг backend

## Security

- JWT токены для аутентификации
- Refresh tokens хранятся в БД (SHA-256 hash); фронтенд автоматически обновляет access-токен при 401 (`src/api/client.ts`)
- BCrypt для хеширования паролей
- ROLE-based access control (USER/ADMIN)
- Проверка владельца похода перед любыми действиями
- `JWT_SECRET` обязателен: docker-compose падает без него (`${JWT_SECRET:?...}`), бэкенд дополнительно делает fail-fast при старте (`JwtProperties.validate()`, минимум 32 байта для HS256)
- CORS настраивается через `CORS_ALLOWED_ORIGINS` (по умолчанию localhost:3000/5173 — только для разработки напрямую; в Docker-стеке не используется)

## Database

- PostgreSQL 15+
- Flyway для миграций (V1-V11)
- NUMERIC для денег и количеств
- LocalDate для дат
- JSONB для сырых данных (staging recipes)

## Testing Strategy

- **Unit tests** — бизнес-логика (SummaryService, KcalCalculator)
- **Integration tests** — API endpoints (Auth, Security, Conflict, Catalog)
- **Contract tests** — FIX-1/FIX-2 числа (mock vs real)
- **Smoke tests** — живой стек (`DockerStackSmokeTest`: meta, регистрация → логин → создание продукта)
- **E2E tests** — пользовательские сценарии (планируются)

## Deployment (Docker Compose)

Три сервиса в сети `provision-network`, порядок старта обеспечивается healthcheck'ами:

```
postgres:15-alpine ──(pg_isready)──▶ backend (Spring Boot, Flyway миграции при старте) ──(/api/v1/meta)──▶ frontend (nginx)
   5432                                    8080                                                              3000 → 80
```

- **postgres** — volume `postgres_data` для персистентности; порт проброшен только на `127.0.0.1:5432`; БД и каталог создаются миграциями Flyway (V1–V11, сид каталога — V3). Миграции V9 никогда не существовало (проверено по всей git-истории) — это пропущенный номер, а не потерянный файл; новые миграции начинаются с V12.
- **backend** — ждёт `service_healthy` у postgres; сам healthy по `GET /api/v1/meta` (доступен без авторизации; реально проверяет соединение с БД через `DataSource.isValid`, отдаёт 503 при её недоступности); JPA `ddl-auto=validate`.
- **frontend** — ждёт `service_healthy` у backend; nginx раздаёт статику и проксирует `/api/` на `http://backend:8080/api/`, поэтому браузер работает в same-origin и CORS не требуется.
- Адрес API зашивается в бандл при сборке через build-args `VITE_API_URL`/`VITE_API_MODE` (runtime-переменные окружения для Vite не работают).
