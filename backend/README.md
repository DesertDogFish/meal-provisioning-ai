# Provision Backend

Бэкенд для системы планирования питания в походах.

## Технологический стек

- Java 21
- Spring Boot 3.2.5
- Spring Data JPA
- Spring Security (JWT)
- PostgreSQL 15
- Flyway (миграции)
- MapStruct
- springdoc-openapi (Swagger)
- Testcontainers (тесты)

## Структура проекта

```
backend/
├── src/main/java/com/provision/
│   ├── config/          # Конфигурация (Security, etc.)
│   ├── controller/      # REST контроллеры
│   ├── dto/             # DTO (request/response)
│   ├── entity/          # JPA сущности
│   ├── exception/       # Обработка ошибок
│   ├── repository/      # Spring Data JPA репозитории
│   ├── security/        # JWT, фильтры
│   └── service/         # Бизнес-логика
├── src/main/resources/
│   ├── db/migration/    # Flyway миграции
│   └── application.yml
└── src/test/            # Тесты
```

## Запуск

### Через Docker Compose

```bash
cd backend
docker-compose up -d
```

Приложение будет доступно на http://localhost:8080  
Swagger UI: http://localhost:8080/swagger-ui.html

### Локально (без Docker)

1. Установите PostgreSQL 15+
2. Создайте базу данных `provision`
3. Настройте `application.yml`
4. Запустите:

```bash
mvn spring-boot:run
```

## API Endpoints

### Аутентификация
- `POST /api/v1/auth/register` - Регистрация
- `POST /api/v1/auth/login` - Вход
- `POST /api/v1/auth/refresh` - Обновление токена
- `POST /api/v1/auth/logout` - Выход
- `GET /api/v1/auth/me` - Текущий пользователь

### Походы (USER)
- `GET /api/v1/trips` - Список походов
- `GET /api/v1/trips/{id}` - Детали похода
- `POST /api/v1/trips` - Создать поход
- `PUT /api/v1/trips/{id}` - Обновить поход
- `DELETE /api/v1/trips/{id}` - Удалить поход
- `PUT /api/v1/trips/{tripId}/days/{dayId}` - Обновить день
- `POST /api/v1/trips/{tripId}/days/{dayId}/meals` - Добавить приём пищи
- `PUT /api/v1/trips/{tripId}/days/{dayId}/meals/{mealId}` - Обновить приём пищи
- `DELETE /api/v1/trips/{tripId}/days/{dayId}/meals/{mealId}` - Удалить приём пищи

### Сводки (USER)
- `GET /api/v1/trips/{tripId}/summary/menu` - Меню по дням
- `GET /api/v1/trips/{tripId}/summary/shopping` - Закупка на поход
- `GET /api/v1/trips/{tripId}/summary/shopping/by-days` - Закупка по дням
- `GET /api/v1/trips/{tripId}/summary/person` - Сводка на человека

### Рецепты (USER - чтение, ADMIN - CRUD)
- `GET /api/v1/recipes` - Список рецептов
- `GET /api/v1/recipes/{id}` - Детали рецепта
- `POST /api/v1/admin/recipes` - Создать рецепт (ADMIN)
- `PUT /api/v1/admin/recipes/{id}` - Обновить рецепт (ADMIN)
- `DELETE /api/v1/admin/recipes/{id}` - Удалить рецепт (ADMIN)

### Админка (ADMIN)
- `GET /api/v1/admin/ingredients` - Список компонентов
- `POST /api/v1/admin/ingredients` - Создать компонент
- `PUT /api/v1/admin/ingredients/{id}` - Обновить компонент
- `DELETE /api/v1/admin/ingredients/{id}` - Удалить компонент
- `GET /api/v1/admin/ingredient-prices/ingredient/{id}` - Цены компонента
- `POST /api/v1/admin/ingredient-prices` - Добавить цену
- `GET /api/v1/admin/staging` - Список черновиков рецептов
- `POST /api/v1/admin/staging` - Создать черновик
- `POST /api/v1/admin/staging/{id}/approve` - Одобрить черновик
- `POST /api/v1/admin/staging/{id}/reject` - Отклонить черновик
- `GET /api/v1/admin/ingredient-mappings` - Список маппингов
- `POST /api/v1/admin/ingredient-mappings` - Создать маппинг
- `DELETE /api/v1/admin/ingredient-mappings/{id}` - Удалить маппинг

## Тесты

```bash
# Все тесты
mvn test

# Только интеграционные тесты
mvn test -Dtest=*IntegrationTest

# Только юнит-тесты
mvn test -Dtest=*Test
```

## Бизнес-правила

1. **Количество людей**: meal.peopleOverride → day.peopleOverride → trip.defaultPeople
2. **Расчёт ингредиентов**: amount / baseServings * people
3. **Цены**: последняя цена, где effectiveFrom <= дата дня
4. **Конфликты**: нельзя удалить/изменить компонент или рецепт, если они используются
5. **Безопасность**: пользователь видит только свои походы, админ имеет доступ ко всему

## Миграции

Все изменения схемы БД через Flyway в `src/main/resources/db/migration/`

Не изменяйте уже применённые миграции! Создавайте новые.
