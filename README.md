# Provision - Система планирования питания для походов

Полнофункциональное веб-приложение для планирования питания в походах и яхтенных путешествиях с расчётом закупок, стоимости и сводок.

## 🎯 MVP Сценарии

### ✅ Сценарий 1: Регистрация и вход
1. Перейдите на http://localhost:5173
2. Нажмите "Нет аккаунта? Зарегистрироваться"
3. Заполните форму:
   - Email: test@example.com
   - Пароль: password123
   - Имя: Иван
   - Фамилия: Петров
4. Нажмите "Зарегистрироваться"
5. Вы автоматически войдёте в систему
6. Нажмите на аватар в сайдбаре → "Профиль" для просмотра данных

**Демо-аккаунты:**
- Админ: admin@provision.app / password123
- Пользователь: user@provision.app / password123

### ✅ Сценарий 2: Админ создаёт справочник
1. Войдите как админ (admin@provision.app)
2. Перейдите в "Админка"
3. Вкладка "Компоненты":
   - Нажмите "Добавить"
   - Создайте компоненты:
     - Гречка, кг, Крупы
     - Тушёнка, шт, Консервы
     - Вода, л, Жидкости
4. Вкладка "Цены":
   - Нажмите "Добавить цену"
   - Добавьте цены:
     - Гречка: 120 RUB
     - Тушёнка: 180 RUB
     - Вода: 30 RUB
5. Вкладка "Рецепты":
   - Нажмите "Новый рецепт"
   - Создайте рецепт "Гречка с тушёнкой":
     - Тип: Обед
     - Порций: 4
     - Ккал: 450
     - Ингредиенты:
       - Гречка: 0.4 кг
       - Тушёнка: 1 шт
       - Вода: 0.8 л

### ✅ Сценарий 3: Пользователь создаёт поход
1. Войдите как пользователь (user@provision.app)
2. Перейдите в "Походы"
3. Нажмите "Новый поход"
4. Заполните:
   - Название: Поход на Карельский перешеек
   - Дата начала: 2024-07-15
   - Дата окончания: 2024-07-17 (3 дня)
   - Количество человек: 4
   - Заметки: Озеро, рыбалка, палатки
5. Нажмите "Создать"
6. Система автоматически создаст 3 дня
7. Нажмите на поход для открытия деталей
8. Для каждого дня нажмите "+" для добавления приёма пищи:
   - День 1: Завтрак (Овсяная каша), Обед (Гречка с тушёнкой), Ужин (Рис с рыбой)
   - День 2: Завтрак, Обед, Ужин
   - День 3: Завтрак, Обед
9. Измените количество людей:
   - На уровне дня: нажмите иконку людей → введите 3
   - На уровне приёма пищи: при добавлении укажите "Количество человек"

### ✅ Сценарий 4: Сводки
1. Откройте поход из сценария 3
2. Вкладка "Меню по дням":
   - Видите расписание приёмов пищи
   - Для каждого блюда показано количество продуктов
   - Раскрытые дни показывают ингредиенты с граммовками
3. Вкладка "Закупка на поход":
   - Видите суммарный список продуктов
   - Общее количество каждого ингредиента
   - Стоимость (если цены есть)
   - Предупреждение о недостающих ценах
4. Вкладка "Закупка по дням":
   - Видите продукты на каждый день
   - Стоимость дня
   - Отсутствующие цены
5. Вкладка "На человека":
   - Сводка по походу:
     - Человеко-приёмов пищи
     - Стоимость на 1 человека (общее)
     - Стоимость на 1 чел./приём
     - Калории на приём
   - Таблица продуктов на человека

## 🚀 Запуск проекта

### Бэкенд (Java 21 + Spring Boot)

```bash
cd backend

# Запуск через Docker Compose (рекомендуется)
docker-compose up -d

# Или локально (требуется PostgreSQL 15+)
# 1. Создайте базу данных provision
# 2. Настройте application.yml
# 3. Запустите:
mvn spring-boot:run
```

**Доступ:**
- API: http://localhost:8080
- Swagger UI: http://localhost:8080/swagger-ui.html
- PostgreSQL: localhost:5432 (provision/provision123)

### Фронтенд (React + TypeScript)

```bash
# В корне проекта
npm install
npm run dev
```

**Доступ:**
- Приложение: http://localhost:5173

## 📚 API Endpoints

### Аутентификация
- `POST /api/v1/auth/register` - Регистрация
- `POST /api/v1/auth/login` - Вход (получение JWT)
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
- `GET /api/v1/admin/ingredients/paginated` - Список с пагинацией
- `POST /api/v1/admin/ingredients` - Создать компонент
- `PUT /api/v1/admin/ingredients/{id}` - Обновить компонент
- `DELETE /api/v1/admin/ingredients/{id}` - Удалить компонент
- `GET /api/v1/admin/ingredient-prices/ingredient/{id}` - Цены компонента
- `POST /api/v1/admin/ingredient-prices` - Добавить цену
- `GET /api/v1/admin/staging` - Список черновиков рецептов
- `POST /api/v1/admin/staging` - Создать черновик
- `POST /api/v1/admin/staging/{id}/approve` - Одобрить черновик
- `POST /api/v1/admin/staging/{id}/reject` - Отклонить черновик

## 🎨 Дизайн-концепт "Midnight Harbor"

### Цветовая палитра
- **bg**: #0B0F17 - тёмный фон
- **surface**: #121826 - карточки
- **elev**: #1A2233 - элементы
- **w1**: #2DD4BF - вода (teal)
- **w2**: #38BDF8 - вода (blue)
- **fire**: #F59E0B - огонь (amber)
- **ok**: #34D399 - успех (green)

### Шрифты
- **Unbounded** - заголовки (500, 700)
- **Manrope** - основной текст (400, 600, 800)

### Особенности
- Glass эффект (backdrop-filter: blur)
- Gradient кнопки
- Spark charts для статистики
- Ring progress indicators
- Pill badges
- Hover эффекты с scale и shadow

## 🛠 Технологический стек

### Бэкенд
- Java 21
- Spring Boot 3.2.5
- Spring Data JPA
- Spring Security (JWT)
- PostgreSQL 15
- Flyway (миграции)
- MapStruct
- springdoc-openapi (Swagger)
- Testcontainers (тесты)
- JUnit 5 + AssertJ + Mockito

### Фронтенд
- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Lucide React (иконки)
- date-fns

## ✅ Требования к качеству кода

### Java 21 Features
✅ Record для всех DTO
✅ Switch expressions
✅ Var локально
✅ Текстовые блоки

### Spring Best Practices
✅ Конструкторная инъекция (@RequiredArgsConstructor)
✅ @Transactional на сервисах
✅ @Transactional(readOnly = true) для чтения
✅ @RestControllerAdvice для ошибок
✅ @ConfigurationProperties (JwtProperties)
✅ @PreAuthorize для ролей

### БД
✅ Все изменения через Flyway
✅ NUMERIC для денег и количеств
✅ LocalDate для дат
✅ Внешние ключи
✅ Индексы

### API
✅ Версия в URL: /api/v1/...
✅ Пагинация (PageResponse)
✅ Сортировка по разрешённым полям
✅ ISO-8601 даты
✅ ProblemDetail (RFC 7807)

### Безопасность
✅ BCrypt для паролей
✅ JWT из переменной окружения
✅ Refresh token в БД (SHA-256)
✅ Проверка владельца похода
✅ ROLE-based access control

## 🧪 Тесты

```bash
cd backend

# Все тесты
mvn test

# Только интеграционные тесты
mvn test -Dtest=*IntegrationTest

# Только юнит-тесты
mvn test -Dtest=*Test
```

### Покрытие тестами
✅ Юнит-тесты SummaryService (расчёты)
✅ Интеграционные тесты аутентификации
✅ Интеграционные тесты безопасности
✅ Интеграционные тесты конфликтов (409)

## 📖 Документация

- [MVP_IMPLEMENTATION.md](./MVP_IMPLEMENTATION.md) - Описание реализованных MVP сценариев
- [BACKEND_IMPLEMENTATION.md](./BACKEND_IMPLEMENTATION.md) - Детали реализации бэкенда
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Система обработки ошибок
- [backend/README.md](./backend/README.md) - Документация API

## 🔐 Безопасность

- Все пароли хешируются BCrypt
- JWT access token (1 час)
- Refresh token в БД (SHA-256 hash, 7 дней)
- Проверка владельца похода перед любыми действиями
- ROLE-based access control (USER, ADMIN)
- Stateless session
- Валидация всех входных данных

## 📊 Бизнес-логика

### Расчёты
```
mealPeople = meal.peopleOverride ?? day.peopleOverride ?? trip.defaultPeople
perPersonAmount = ingredient.amount / recipe.baseServings
mealAmount = perPersonAmount * mealPeople
cost = amount * price (последняя цена, где effectiveFrom <= дата)
```

### Конфликты
- Компонент нельзя удалить/изменить, если используется в рецептах (409)
- Рецепт нельзя удалить, если используется в походах (409)
- Возвращается список ресурсов, где используется (usedIn)

## 🎯 Готовность к продакшену

✅ Все MVP сценарии работают
✅ Все требования к качеству кода выполнены
✅ Дизайн-концепт применён
✅ Тесты написаны и проходят
✅ Документация создана
✅ Docker Compose настроен
✅ Swagger UI доступен
✅ Миграции применяются
✅ Безопасность обеспечена

## 📝 Лицензия

MIT

## 👥 Авторы

Разработано с использованием лучших практик Java 21, Spring Boot 3.x и современного React.
