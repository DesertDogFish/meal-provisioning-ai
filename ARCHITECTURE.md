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
- Refresh tokens хранятся в БД (SHA-256 hash)
- BCrypt для хеширования паролей
- ROLE-based access control (USER/ADMIN)
- Проверка владельца похода перед любыми действиями

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
- **E2E tests** — пользовательские сценарии (планируются)
