# Реализация бэкенда Provision

Полностью реализован бэкенд на Java 21 + Spring Boot 3.x для системы планирования питания.

## Реализованные этапы

### ✅ Этап 1: Каркас приложения
- Maven проект с Spring Boot 3.2.5
- Docker Compose с PostgreSQL 15
- Flyway миграция V1__initial_schema.sql
- Полная схема БД с внешними ключами
- NUMERIC для денег и количеств
- LocalDate для дат

### ✅ Этап 2: Обработка ошибок
- GlobalExceptionHandler с @RestControllerAdvice
- ProblemDetail (RFC 7807) через ErrorResponse DTO
- Кастомные исключения: NotFoundException, ConflictException, UnauthorizedException, ForbiddenException
- Валидация через Jakarta Validation
- Локализация ошибок

### ✅ Этап 3: Пользователи и авторизация
- Entity: User, RefreshToken
- Регистрация с BCrypt хешированием
- JWT access token (1 час)
- Refresh token в БД (SHA-256 hash)
- Spring Security конфигурация
- JwtAuthenticationFilter
- /api/v1/auth/** endpoints

### ✅ Этап 4: Админка - ингредиенты
- Entity: Ingredient
- CRUD операции
- Проверка использования в рецептах
- Ответ 409 со списком рецептов при конфликте
- Валидация уникальности имени

### ✅ Этап 5: Цены ингредиентов
- Entity: IngredientPrice
- Добавление цен с effectiveFrom
- Запрос цены на дату (последняя цена <= дата)
- Запрет дублей на одну дату
- UNIQUE constraint (ingredient_id, effective_from)

### ✅ Этап 6: Рецепты
- Entity: Recipe, RecipeIngredient
- CRUD с валидацией
- Проверка минимум одного ингредиента
- Проверка amount > 0
- Защита удаления при использовании в походах
- Fetch join для оптимизации

### ✅ Этап 7: Походы
- Entity: Trip, TripDay, TripMeal
- Создание с автогенерацией дней
- Проверка владельца (userId)
- Обновление только name, defaultPeople, notes
- Запрет изменения дат
- Каскадное удаление дней и приёмов пищи

### ✅ Этап 8: Приёмы пищи
- Добавление/обновление/удаление
- Проверка существования рецепта
- Проверка владельца похода
- sortOrder для порядка
- peopleOverride на уровне приёма

### ✅ Этап 9: Сводки
- SummaryService с расчётами
- Меню по дням
- Закупка на весь поход
- Закупка по дням
- Сводка на человека
- Расчёт эффективного количества людей
- Расчёт цен на дату
- Обработка missingPrice
- BigDecimal для всех расчётов

### ✅ Этап 10: Импорт рецептов
- Entity: StagingRecipe, IngredientMapping
- Создание черновика
- Просмотр списка черновиков
- Одобрение (создание Recipe из StagingRecipe)
- Отклонение с причиной
- Маппинг внешних ингредиентов
- JSONB для rawPayload

### ✅ Этап 11: Тесты
- Юнит-тесты SummaryService (расчёты)
- Интеграционные тесты через Testcontainers
- Тесты аутентификации
- Тесты безопасности
- Тесты конфликтных ситуаций (409)

## Применённые лучшие практики

### Java 21
✅ Record для всех DTO
✅ Switch expressions (где уместно)
✅ Var локально
✅ Текстовые блоки

### Spring
✅ Конструкторная инъекция (@RequiredArgsConstructor)
✅ @Transactional на сервисах
✅ @Transactional(readOnly = true) для чтения
✅ @RestControllerAdvice для ошибок
✅ @ConfigurationProperties (JWT settings)
✅ @PreAuthorize для ролей

### БД
✅ Все изменения через Flyway
✅ NUMERIC для денег и количеств
✅ LocalDate для дат
✅ Внешние ключи обязательны
✅ ON DELETE CASCADE где нужно
✅ Индексы на часто используемых полях

### API
✅ Версия в URL: /api/v1/...
✅ Все DTO валидируются через @Valid
✅ Даты в ISO-8601
✅ Не возвращаются чувствительные данные
✅ ProblemDetail для всех ошибок

### Безопасность
✅ BCrypt для паролей
✅ JWT из переменной окружения
✅ Refresh token в БД (хэш)
✅ Проверка владельца похода
✅ ROLE-based access control
✅ Stateles session

## Структура проекта

```
backend/
├── src/main/java/com/provision/
│   ├── config/
│   │   └── SecurityConfig.java
│   ├── controller/
│   │   ├── AuthController.java
│   │   ├── IngredientController.java
│   │   ├── IngredientMappingController.java
│   │   ├── IngredientPriceController.java
│   │   ├── RecipeController.java
│   │   ├── StagingController.java
│   │   ├── SummaryController.java
│   │   └── TripController.java
│   ├── dto/
│   │   ├── auth/
│   │   ├── error/
│   │   ├── ingredient/
│   │   ├── recipe/
│   │   ├── staging/
│   │   ├── summary/
│   │   └── trip/
│   ├── entity/
│   │   ├── Ingredient.java
│   │   ├── IngredientMapping.java
│   │   ├── IngredientPrice.java
│   │   ├── MealType.java
│   │   ├── Recipe.java
│   │   ├── RecipeIngredient.java
│   │   ├── RecipeSource.java
│   │   ├── RefreshToken.java
│   │   ├── StagingRecipe.java
│   │   ├── Trip.java
│   │   ├── TripDay.java
│   │   ├── TripMeal.java
│   │   ├── UnitOfMeasure.java
│   │   ├── User.java
│   │   └── UserRole.java
│   ├── exception/
│   │   ├── ConflictException.java
│   │   ├── ForbiddenException.java
│   │   ├── GlobalExceptionHandler.java
│   │   ├── NotFoundException.java
│   │   └── UnauthorizedException.java
│   ├── repository/
│   │   ├── IngredientMappingRepository.java
│   │   ├── IngredientPriceRepository.java
│   │   ├── IngredientRepository.java
│   │   ├── RecipeIngredientRepository.java
│   │   ├── RecipeRepository.java
│   │   ├── RefreshTokenRepository.java
│   │   ├── StagingRecipeRepository.java
│   │   ├── TripDayRepository.java
│   │   ├── TripMealRepository.java
│   │   ├── TripRepository.java
│   │   └── UserRepository.java
│   ├── security/
│   │   ├── JwtAuthenticationFilter.java
│   │   └── JwtService.java
│   └── service/
│       ├── AuthService.java
│       ├── IngredientMappingService.java
│       ├── IngredientPriceService.java
│       ├── IngredientService.java
│       ├── RecipeService.java
│       ├── StagingService.java
│       ├── SummaryService.java
│       └── TripService.java
├── src/main/resources/
│   ├── application.yml
│   └── db/migration/
│       └── V1__initial_schema.sql
├── src/test/java/com/provision/
│   ├── integration/
│   │   ├── AuthIntegrationTest.java
│   │   ├── ConflictIntegrationTest.java
│   │   └── SecurityIntegrationTest.java
│   └── service/
│       └── SummaryServiceTest.java
├── src/test/resources/
│   └── application-test.yml
├── docker-compose.yml
├── Dockerfile
├── pom.xml
└── README.md
```

## Запуск

```bash
cd backend
docker-compose up -d
```

Приложение: http://localhost:8080  
Swagger UI: http://localhost:8080/swagger-ui.html

## Тесты

```bash
mvn test
```

## API документация

Swagger UI доступен после запуска приложения на `/swagger-ui.html`

## Соответствие требованиям

✅ Java 21
✅ Spring Boot 3.x
✅ PostgreSQL 15
✅ Flyway миграции
✅ Spring Data JPA
✅ Spring Security + JWT
✅ Jakarta Validation
✅ MapStruct (настроен в pom.xml)
✅ springdoc-openapi
✅ Testcontainers
✅ JUnit 5 + AssertJ + Mockito
✅ ProblemDetail (RFC 7807)
✅ BigDecimal для денег
✅ LocalDate для дат
✅ Конструкторная инъекция
✅ Транзакции
✅ Ролевая модель (USER/ADMIN)
✅ Проверка владельца похода
✅ Обработка конфликтов (409)
