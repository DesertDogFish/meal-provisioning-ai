# Provision - Система планирования питания для походов

Полнофункциональное веб-приложение для планирования питания в походах и яхтенных путешествиях с расчётом закупок, стоимости, калорийности и интеграцией с внешними источниками цен.

## 🚀 Быстрый старт (одна кнопка)

### PowerShell (Windows)

```powershell
.\dev.ps1 -Action start
```

### Bash (Linux/Mac)

```bash
# 1. Скопировать .env
cp .env.example .env

# 2. Запустить Docker Compose
docker-compose up -d

# 3. Открыть браузер
# Frontend: http://localhost:3000
# Backend API: http://localhost:8080
# Swagger UI: http://localhost:8080/swagger-ui.html
```

## 📋 Возможности

### Основные функции

- ✅ **Планирование походов** - создание походов с датами и количеством людей
- ✅ **Каталог продуктов** - 60+ продуктов с категориями, единицами, калорийностью
- ✅ **Каталог рецептов** - 61 блюдо с расчётом калорийности из продуктов
- ✅ **Расчёт закупок** - автоматический расчёт количества продуктов
- ✅ **Цены и стоимость** - исторические цены, расчёт стоимости похода
- ✅ **Оверрайды цен** - план/факт с дельтой и процентом отклонения
- ✅ **Замены компонентов** - локальные замены в рецептах для похода
- ✅ **Расчёт упаковок** - округление до упаковок, учёт остатков
- ✅ **Интеграция OFF** - синхронизация цен с Open Food Facts
- ✅ **Журнал синков** - логирование всех синхронизаций с деталями

### CR-1..CR-5

- ✅ **CR-1:** Калорийность всегда на 100 г/мл с формулой ядра
- ✅ **CR-2:** Единицы KG/L/PCS/PACK с русскими лейблами (кг/л/шт/уп)
- ✅ **CR-3:** Зависимые дейт-пикеры с авто-подтягиванием
- ✅ **CR-4:** Видимая иконка календаря на тёмном фоне
- ✅ **CR-5:** API клиент с mock-адаптером и бейджем режима

## 🛠 Технологический стек

### Backend
- **Java 21** + **Spring Boot 3.2.5**
- **PostgreSQL 15** + **Flyway** (миграции V1-V11)
- **Spring Security** + **JWT** (access + refresh tokens)
- **Spring Data JPA** + **Hibernate**
- **MapStruct** (маппинг DTO)
- **springdoc-openapi** (Swagger UI)
- **JUnit 5** + **AssertJ** + **Mockito** + **Testcontainers**

### Frontend
- **React 18** + **TypeScript**
- **Vite** (сборка)
- **Tailwind CSS** (стилизация)
- **React Router** (маршрутизация)
- **Lucide React** (иконки)
- **date-fns** (работа с датами)

### Инфраструктура
- **Docker** + **Docker Compose**
- **Nginx** (frontend)
- **Maven** (backend build)

## 📊 Структура проекта

```
provision/
├── backend/                    # Spring Boot приложение
│   ├── src/main/java/         # Java код
│   ├── src/main/resources/    # Конфигурация + миграции
│   ├── src/test/java/         # Тесты (9 файлов)
│   ├── Dockerfile
│   └── pom.xml
├── src/                        # React приложение
│   ├── api/                   # API клиент + mock
│   ├── components/            # UI компоненты
│   ├── pages/                 # Страницы
│   ├── store/                 # State management
│   ├── types/                 # TypeScript типы
│   └── utils/                 # Утилиты + тесты
├── docker-compose.yml          # Оркестрация
├── Dockerfile.frontend         # Frontend build
├── nginx.conf                  # Nginx конфигурация
├── .env.example                # Переменные окружения
├── dev.ps1                     # PowerShell скрипт
├── README.md                   # Этот файл
└── STATUS.md                   # Статус реализации
```

## 🗄 База данных

### Миграции (V1-V11)

- **V1:** Initial schema (users, ingredients, recipes, trips)
- **V2:** Catalog extensions (code, category, cook_minutes)
- **V3:** Seed catalog (60 компонентов, 61 рецепт)
- **V4:** Recipe ingredients
- **V5:** Integrations (OFF sync)
- **V6:** Trip price overrides
- **V7:** Packs and substitutions
- **V8:** Product categories and identity
- **V10:** Sync trigger
- **V11:** kcal_per_100g and PACK unit

### Таблицы

- `users` - пользователи (USER/ADMIN)
- `refresh_tokens` - JWT refresh tokens
- `product_categories` - справочник категорий
- `ingredients` - продукты (с kcal_per_100g, piece_weight_g)
- `ingredient_prices` - исторические цены
- `recipes` - рецепты
- `recipe_ingredients` - состав рецептов
- `trips` - походы
- `trip_days` - дни похода
- `trip_meals` - приёмы пищи
- `trip_price_overrides` - оверрайды цен (план/факт)
- `trip_ingredient_substitutions` - замены компонентов
- `integrations` - настройки интеграций
- `external_products` - кэш внешних продуктов
- `sync_logs` - журнал синхронизаций
- `staging_recipes` - черновики рецептов
- `ingredient_mappings` - маппинг внешних ингредиентов

## 🧪 Тесты

### Backend (9 файлов)

```bash
cd backend
mvn test
```

**Unit-тесты:**
- `SummaryServiceTest` - базовые расчёты
- `SummaryServiceFixtureTest` - FIX-1
- `DetailedShoppingCalculationTest` - детальная математика
- `PriceOverrideTest` - ADJ-01..05
- `ShoppingListCostAggregationBugTest` - баг агрегации

**Integration-тесты:**
- `AuthIntegrationTest` - AUTH-01..08
- `SecurityIntegrationTest` - SEC-01..06
- `ConflictIntegrationTest` - ING-05, ING-06, REC-07
- `CatalogIntegrationTest` - CAT-01..07

### Frontend (2 файла)

```bash
npm test
```

**Unit-тесты:**
- `calc.test.ts` - KCAL-01..06, UNIT-01..03, humanize
- `mockServer.test.ts` - MOCK-01..03

## 📖 API Документация

После запуска бэкенда откройте Swagger UI:

```
http://localhost:8080/swagger-ui.html
```

### Основные endpoints

**Аутентификация:**
- `POST /api/v1/auth/register` - регистрация
- `POST /api/v1/auth/login` - вход
- `POST /api/v1/auth/refresh` - обновление токена
- `GET /api/v1/auth/me` - текущий пользователь

**Продукты:**
- `GET /api/v1/product-categories` - список категорий
- `GET /api/v1/admin/products` - список продуктов (фильтры, сортировка, пагинация)
- `POST /api/v1/admin/products` - создание продукта
- `PUT /api/v1/admin/products/{id}` - обновление
- `DELETE /api/v1/admin/products/{id}` - удаление
- `GET /api/v1/admin/products/check-name` - проверка дубля

**Рецепты:**
- `GET /api/v1/recipes` - список рецептов (фильтры)
- `GET /api/v1/recipes/{id}` - детали рецепта
- `POST /api/v1/admin/recipes` - создание (ADMIN)
- `PUT /api/v1/admin/recipes/{id}` - обновление (ADMIN)
- `DELETE /api/v1/admin/recipes/{id}` - удаление (ADMIN)

**Походы:**
- `GET /api/v1/trips` - список походов
- `POST /api/v1/trips` - создание похода
- `GET /api/v1/trips/{id}` - детали похода
- `PUT /api/v1/trips/{id}` - обновление
- `DELETE /api/v1/trips/{id}` - удаление

**Сводки:**
- `GET /api/v1/trips/{id}/summary/menu` - меню по дням
- `GET /api/v1/trips/{id}/summary/shopping` - закупка на поход
- `GET /api/v1/trips/{id}/summary/shopping/by-days` - закупка по дням
- `GET /api/v1/trips/{id}/summary/person` - сводка на человека

**Оверрайды цен:**
- `GET /api/v1/trips/{id}/price-overrides` - список оверрайдов
- `PUT /api/v1/trips/{id}/price-overrides/{ingredientId}` - создание/обновление
- `DELETE /api/v1/trips/{id}/price-overrides/{ingredientId}` - удаление

**Интеграции:**
- `GET /api/v1/admin/integrations` - список интеграций
- `POST /api/v1/admin/integrations/{provider}/connect` - подключение
- `POST /api/v1/admin/integrations/{provider}/sync/prices` - синхронизация цен

**Журнал синков:**
- `GET /api/v1/admin/sync-logs` - список запусков
- `GET /api/v1/admin/sync-logs/{id}` - детали запуска
- `GET /api/v1/admin/sync-logs/kpi` - KPI за период

**Meta:**
- `GET /api/v1/meta` - health check (без авторизации)

## 🔐 Безопасность

- ✅ JWT access token (1 час)
- ✅ Refresh token в БД (SHA-256 hash, 7 дней)
- ✅ BCrypt для паролей
- ✅ ROLE-based access control (USER/ADMIN)
- ✅ Проверка владельца похода
- ✅ Валидация всех входных данных
- ✅ CORS настроен
- ✅ Секреты только через env/.env

## 🎨 Дизайн

Дизайн-концепт **Midnight Harbor**:
- Тёмная тема (#0B0F17 фон)
- Градиентные кнопки (teal → blue)
- Glass-эффекты (backdrop-filter: blur)
- Адаптивный дизайн (mobile-first)
- NumberField с адаптивным шагом
- DateRange с зависимыми пикерами
- Бейдж режима (демо/бэкенд)

## 📝 Режимы работы

### Демо-режим (по умолчанию)

- Работает без бэкенда
- Данные в localStorage
- Мок-сервер эмулирует API
- Задержка 200-400 мс
- Режим ошибок `?fail=<route>`

### Бэкенд-режим

- HTTP запросы к Spring Boot
- Реальная база данных PostgreSQL
- JWT авторизация
- Flyway миграции
- Swagger UI

**Переключение:** клик на бейдж в правом верхнем углу

## 🐛 Troubleshooting

### Docker не запускается

```bash
# Проверить Docker
docker --version

# Перезапустить Docker Desktop
# Windows: правый клик на иконке → Restart
# Mac: меню Docker → Restart

# Очистить и пересобрать
docker-compose down -v
docker-compose up -d --build
```

### Backend не подключается к БД

```bash
# Проверить PostgreSQL
docker-compose ps postgres

# Проверить логи
docker-compose logs postgres

# Пересоздать контейнер
docker-compose rm -f postgres
docker-compose up -d postgres
```

### Frontend не видит backend

```bash
# Проверить .env
cat .env | grep VITE_API_URL

# Должно быть:
# VITE_API_URL=http://localhost:8080/api/v1

# Пересобрать frontend
docker-compose restart frontend
```

### Миграции не применяются

```bash
# Проверить статус миграций
docker-compose exec postgres psql -U provision -d provision -c "SELECT * FROM flyway_schema_history;"

# Очистить и пересоздать БД
docker-compose down -v
docker-compose up -d
```

## 📚 Документация

- `STATUS.md` - статус реализации + бэклог v2
- `CR1_CR5_IMPLEMENTATION.md` - детали CR-1..CR-5
- `FINAL_COMPLETE_SUMMARY.md` - полная сводка
- `backend/README.md` - backend документация

## 🤝 Вклад

Проект создан в образовательных целях. Все предложения и улучшения приветствуются!

## 📄 Лицензия

MIT

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ✅ ГОТОВ К ИСПОЛЬЗОВАНИЮ
