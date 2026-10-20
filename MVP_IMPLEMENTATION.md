# Реализация MVP Provision

Полностью реализован бэкенд и фронтенд системы планирования питания с применением всех требований к качеству кода и дизайн-концепта "Midnight Harbor".

## ✅ Реализованные MVP сценарии

### Сценарий 1: Регистрация и вход
✅ Пользователь регистрируется через `POST /api/v1/auth/register`
✅ Получает JWT access token и refresh token
✅ Может запросить свой профиль через `GET /api/v1/auth/me`
✅ Пароли хешируются BCrypt
✅ Refresh token хранится в БД (SHA-256 hash)

### Сценарий 2: Админ создаёт справочник
✅ Админ создаёт ингредиенты:
  - Гречка (KG)
  - Тушёнка (PCS)
  - Вода (L)
✅ Добавляет цены через `POST /api/v1/admin/ingredient-prices`
✅ Создаёт рецепт "Гречка с тушёнкой":
  - 4 порции (baseServings)
  - Количество ингредиентов в базовых единицах (0.4 KG гречки, 1 PCS тушёнки)

### Сценарий 3: Пользователь создаёт поход
✅ Пользователь создаёт поход на 3 дня через `POST /api/v1/trips`
✅ Система автоматически создаёт 3 дня (trip_days)
✅ Пользователь добавляет приёмы пищи:
  - Завтрак
  - Обед
  - Ужин
✅ Может менять количество людей на уровне дня (peopleOverride)
✅ Может менять количество людей на уровне приёма пищи (peopleOverride)

### Сценарий 4: Сводки
✅ Меню по дням (`GET /api/v1/trips/{id}/summary/menu`):
  - Видит, что и когда едят
  - Видит количество продуктов на каждый приём пищи
✅ Закупка на весь поход (`GET /api/v1/trips/{id}/summary/shopping`):
  - Видит суммарные продукты
✅ Закупка по дням (`GET /api/v1/trips/{id}/summary/shopping/by-days`):
  - Видит, что покупать по дням
  - Видит стоимость, если цены есть
  - Видит пропущенные цены (hasMissingPrices)
✅ Сводка на человека (`GET /api/v1/trips/{id}/summary/person`):
  - Видит примерную стоимость на человека
  - costPerDefaultPerson
  - costPerPersonMeal

## ✅ Применённые требования к качеству кода

### Java 21 Features
✅ Record для всех DTO (RegisterRequest, LoginRequest, IngredientRequest, etc.)
✅ Switch expressions (где уместно)
✅ Var локально (где не ухудшает читаемость)
✅ Текстовые блоки (в тестах)

### Spring Best Practices
✅ Конструкторная инъекция через @RequiredArgsConstructor
✅ Никакого @Autowired на полях
✅ @Transactional на сервисах для изменяющих операций
✅ @Transactional(readOnly = true) для чтения
✅ @RestControllerAdvice для обработки ошибок
✅ @ConfigurationProperties для JWT настроек (JwtProperties)
✅ @PreAuthorize для ролевой модели

### БД
✅ Все изменения схемы через Flyway (V1__initial_schema.sql)
✅ Не меняются уже применённые миграции
✅ NUMERIC для денег и количеств (price_per_unit, amount)
✅ LocalDate для дат (effective_from, day_date, start_date, end_date)
✅ Внешние ключи обязательны
✅ ON DELETE CASCADE где нужно (trips -> trip_days -> trip_meals)
✅ Индексы на часто используемых полях

### API
✅ Версия в URL: /api/v1/...
✅ Пагинация для списков (PageResponse DTO)
✅ Сортировка только по разрешённым полям
✅ Все даты в формате yyyy-MM-dd (ISO-8601)
✅ Все даты-времени в ISO-8601
✅ Не возвращаются чувствительные данные:
  - Пароль не возвращается
  - Hash пароля не возвращается
  - Refresh token не возвращается в списках

### Безопасность
✅ Все эндпоинты требуют авторизации (кроме /api/v1/auth/**, /swagger-ui/**)
✅ Пароли хешируются BCrypt
✅ JWT secret берётся из переменной окружения
✅ JWT secret не хранится в application.yaml как реальный секрет
✅ Проверка владельца похода перед любым действием (userId в TripService)
✅ ROLE-based access control (USER, ADMIN)
✅ Stateless session (JWT)

### Обработка ошибок
✅ GlobalExceptionHandler с @RestControllerAdvice
✅ ProblemDetail (RFC 7807) через ErrorResponse DTO
✅ Кастомные исключения: NotFoundException, ConflictException, UnauthorizedException, ForbiddenException
✅ Валидация через Jakarta Validation (@Valid, @NotNull, @NotBlank, @Email, @Size, @Positive, @Min)
✅ Локализация ошибок
✅ Логирование через SLF4J (не System.out.println)

## ✅ Дизайн-концепт "Midnight Harbor"

### Цветовая схема
✅ bg: #0B0F17 (тёмный фон)
✅ surface: #121826 (карточки)
✅ elev: #1A2233 (элементы)
✅ border: rgba(255, 255, 255, 0.08)
✅ text: #E6EDF7 (основной текст)
✅ muted: #8B98AC (приглушённый текст)
✅ w1: #2DD4BF (вода 1 - teal)
✅ w2: #38BDF8 (вода 2 - blue)
✅ fire: #F59E0B (огонь - amber)
✅ ok: #34D399 (успех - green)

### Шрифты
✅ Unbounded для заголовков (500, 700)
✅ Manrope для основного текста (400, 600, 800)

### Компоненты
✅ Glass эффект (backdrop-filter: blur)
✅ Gradient кнопки (linear-gradient)
✅ Pill badges (rounded-full)
✅ Spark charts (clip-path)
✅ Ring progress indicators (conic-gradient)
✅ Card hover эффекты (scale, shadow)

### Применено к страницам
✅ LoginPage - тёмная тема с gradient фоном
✅ Layout - glass sidebar с blur эффектом
✅ DashboardPage - карточки с spark charts и ring indicators
✅ TripDetailPage - chips для дней, stepper для людей
✅ AdminPage - тёмные таблицы и формы

## ✅ Бизнес-правила

### Расчёты
✅ mealPeople = meal.peopleOverride ?? day.peopleOverride ?? trip.defaultPeople
✅ perPersonAmount = ingredient.amount / recipe.baseServings
✅ mealAmount = perPersonAmount * mealPeople
✅ Стоимость = amount * price (последняя цена, где effectiveFrom <= дата)
✅ Если цена не найдена - missingPrice (не падает)

### Конфликты
✅ Компонент нельзя удалить/изменить, если используется в рецептах (409)
✅ Рецепт нельзя удалить, если используется в походах (409)
✅ Возвращается список ресурсов, где используется (usedIn)

### Валидация
✅ Все DTO валидируются через @Valid
✅ Проверка уникальности email при регистрации
✅ Проверка уникальности имени ингредиента
✅ Проверка amount > 0 для recipe_ingredients
✅ Проверка baseServings > 0
✅ Проверка дат (endDate >= startDate)
✅ Проверка defaultPeople > 0

## ✅ Тесты

### Юнит-тесты
✅ SummaryServiceTest - расчёты количества людей
✅ SummaryServiceTest - расчёты количества ингредиентов
✅ SummaryServiceTest - расчёты стоимости

### Интеграционные тесты (Testcontainers)
✅ AuthIntegrationTest - регистрация, логин, refresh
✅ SecurityIntegrationTest - проверка авторизации
✅ ConflictIntegrationTest - проверка конфликтов (409)

## ✅ Структура проекта

```
backend/
├── src/main/java/com/provision/
│   ├── config/
│   │   ├── JwtProperties.java          # @ConfigurationProperties
│   │   └── SecurityConfig.java
│   ├── controller/
│   │   ├── AuthController.java
│   │   ├── IngredientController.java   # с пагинацией
│   │   ├── IngredientMappingController.java
│   │   ├── IngredientPriceController.java
│   │   ├── RecipeController.java
│   │   ├── StagingController.java
│   │   ├── SummaryController.java
│   │   └── TripController.java
│   ├── dto/
│   │   ├── PageResponse.java           # пагинация
│   │   ├── auth/
│   │   ├── error/
│   │   ├── ingredient/
│   │   ├── recipe/
│   │   ├── staging/
│   │   ├── summary/
│   │   └── trip/
│   ├── entity/
│   ├── exception/
│   │   ├── GlobalExceptionHandler.java
│   │   └── ... (кастомные исключения)
│   ├── repository/
│   ├── security/
│   │   ├── JwtAuthenticationFilter.java
│   │   └── JwtService.java             # с @ConfigurationProperties
│   └── service/
│       ├── AuthService.java
│       ├── IngredientService.java      # с пагинацией
│       ├── SummaryService.java
│       └── TripService.java
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/
│       └── V1__initial_schema.sql
└── src/test/

frontend/
├── src/
│   ├── components/
│   │   └── Layout.tsx                  # Midnight Harbor дизайн
│   ├── pages/
│   │   ├── LoginPage.tsx               # тёмная тема
│   │   ├── DashboardPage.tsx           # spark charts, rings
│   │   └── ...
│   └── index.css                       # CSS переменные Midnight Harbor
```

## ✅ Запуск

### Бэкенд
```bash
cd backend
docker-compose up -d
```
Приложение: http://localhost:8080
Swagger UI: http://localhost:8080/swagger-ui.html

### Фронтенд
```bash
npm install
npm run dev
```
Приложение: http://localhost:5173

## ✅ Соответствие требованиям

✅ Java 21
✅ Spring Boot 3.2.5
✅ PostgreSQL 15
✅ Flyway миграции
✅ Spring Data JPA
✅ Spring Security + JWT
✅ Jakarta Validation
✅ @ConfigurationProperties
✅ BigDecimal для денег
✅ LocalDate для дат
✅ Конструкторная инъекция
✅ Транзакции
✅ Ролевая модель (USER/ADMIN)
✅ Проверка владельца похода
✅ Обработка конфликтов (409)
✅ ProblemDetail (RFC 7807)
✅ Пагинация
✅ Дизайн "Midnight Harbor"
✅ Все MVP сценарии

## ✅ Готовность к продакшену

✅ Все MVP сценарии работают
✅ Все требования к качеству кода выполнены
✅ Дизайн-концепт применён
✅ Тесты написаны
✅ Документация создана
✅ Docker Compose настроен
✅ Swagger UI доступен
✅ Миграции применяются
✅ Безопасность обеспечена

Проект готов к деплою!
