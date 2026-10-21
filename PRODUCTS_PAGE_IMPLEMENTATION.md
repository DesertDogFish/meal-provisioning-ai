# Экран "Управление продуктами" - Полная реализация

## 📅 Дата
2026-03-18

## ✅ Статус
**РЕАЛИЗОВАНО И ГОТОВО К ИСПОЛЬЗОВАНИЮ**

---

## 🎯 Что было реализовано

### 1. Миграция V8: Справочник категорий и нормализация имён

**Файл:** `backend/src/main/resources/db/migration/V8__product_categories_and_identity.sql`

#### Созданные таблицы
✅ **product_categories** - справочник категорий продуктов
- 19 предопределённых категорий (Крупы, Консервы, Напитки, Молочное и т.д.)
- Поля: id, name, slug, sort_order
- Индекс по sort_order для быстрой сортировки

#### Обновления таблицы ingredients
✅ **Добавлено поле category_id** - ссылка на product_categories
✅ **Добавлено поле name_norm** - нормализованное имя для проверки дублей
✅ **Удалено поле category** - заменено на связь с product_categories
✅ **Снят уникальный индекс по name** - теперь уникальность по (name_norm, unit)
✅ **Создан уникальный индекс uniq_product_identity** - (name_norm, unit)

#### Нормализация имён
```sql
name_norm = lower(btrim(regexp_replace(
  replace(replace(name,'Ё','Е'),'ё','е'), 
  '\s+', ' ', 'g'
)))
```

**Примеры:**
- "Гречка " → "гречка"
- "Толчёнка" → "толченка"
- "Соль  морская" → "соль морская"

---

### 2. Бэкенд: Entity и Repository

#### Entity
✅ **ProductCategory** - новая entity для категорий
✅ **Ingredient** - обновлён:
- Добавлено поле `nameNorm`
- Заменено поле `category` (String) на `category` (ProductCategory)
- Убран unique constraint с name

#### Repository
✅ **ProductCategoryRepository** - CRUD для категорий
✅ **IngredientRepository** - обновлён:
- Добавлен `JpaSpecificationExecutor` для сложных запросов
- Методы: `findByNameNormAndUnit`, `existsByNameNormAndUnit`, `findByNameNorm`

---

### 3. Бэкенд: DTO

✅ **ProductCategoryDto** - DTO для категорий
✅ **ProductRequest** - DTO для создания/обновления продукта
  - name, categoryId, unit, packSize, roundToPacks, caloriesPerUnit, description
✅ **ProductResponse** - DTO для ответа
  - id, name, category, unit, packSize, roundToPacks, caloriesPerUnit, description
  - currentPrice, usageRecipes, bindingStatus, updatedAt
✅ **CheckNameResponse** - DTO для проверки дублей
  - duplicate, existingId, existingName, sameUnit

---

### 4. Бэкенд: Service

✅ **ProductService** - сервис управления продуктами

**Методы:**
- `getAllCategories()` - список категорий
- `checkName(name, unit)` - проверка дублей (жёсткий/мягкий)
- `getProducts(...)` - список продуктов с фильтрами и сортировкой
- `createProduct(request)` - создание продукта
- `updateProduct(id, request)` - обновление продукта
- `deleteProduct(id)` - удаление продукта

**Бизнес-логика:**

1. **Проверка дублей:**
   - Жёсткий дубль: name_norm + unit совпадают → 409
   - Мягкий дубль: name_norm совпадает, unit разный → предупреждение

2. **Создание продукта:**
   - Проверка категории (обязательна)
   - Проверка дубля
   - Нормализация имени
   - Сохранение

3. **Обновление продукта:**
   - Если продукт занят в рецептах:
     - Нельзя менять имя и единицу → 409
     - Можно менять категорию, упаковку, калорийность
   - Если продукт свободен:
     - Полная проверка дублей
     - Можно менять всё

4. **Удаление продукта:**
   - Проверка занятости в рецептах → 409 если занят
   - Удаление если свободен

---

### 5. Бэкенд: Controller

✅ **ProductController** - REST API для продуктов

**Endpoints:**
```
GET    /api/v1/product-categories              - список категорий
GET    /api/v1/admin/products                  - список продуктов (фильтры, сортировка, пагинация)
POST   /api/v1/admin/products                  - создание продукта
PUT    /api/v1/admin/products/{id}             - обновление продукта
DELETE /api/v1/admin/products/{id}             - удаление продукта
GET    /api/v1/admin/products/check-name       - проверка дубля
```

**Параметры GET /admin/products:**
- query - поиск по имени и штрихкоду
- categoryId - фильтр по категории (повторяемый)
- unit - фильтр по единице (повторяемый)
- priceStatus - HAS_PRICE | NO_PRICE
- bindingStatus - BOUND | UNBOUND
- usageStatus - USED | UNUSED
- sort - name | category | unit | price | usage | updatedAt
- direction - asc | desc
- page, size - пагинация

---

### 6. Фронтенд: ProductsPage

**Файл:** `src/pages/ProductsPage.tsx`

#### Функциональность

✅ **Шапка:**
- Заголовок "Продукты"
- Счётчик "N продуктов · M категорий"
- Кнопка "+ Продукт"

✅ **Тулбар:**
- Поиск по названию/штрихкоду
- Фильтр по категории (мультивыбор)
- Фильтр по единице (KG/L/PCS)
- Фильтр по цене (все/есть/нет)
- Фильтр по интеграции (все/привязаны/не привязаны)
- Фильтр по использованию (все/в рецептах/не используются)
- Кнопка "Сбросить фильтры"

✅ **Таблица:**
- Колонки: Продукт, Категория, Ед., Упаковка, Цена, В рецептах, Действия
- Сортировка по клику на заголовок (asc/desc)
- Иконки действий: правка, цена, привязка, удаление

✅ **Модалка создания/правки:**
- Название (live-проверка дубля с debounce 300мс)
- Категория (обязательный дропдаун из справочника)
- Единица (сегмент-контрол KG/L/PCS)
- Упаковка (NumberField с адаптивным шагом)
- Флаг "округлять закупку до упаковок"
- Калорийность (NumberField)
- Проверка дублей:
  - Жёсткий дубль → красный блок, кнопка сохранения заблокирована
  - Мягкий дубль → янтарный блок с предупреждением

✅ **Состояния:**
- Загрузка (skeleton)
- Пустой результат ("Ничего не найдено" + кнопка сброса)
- Ошибка сети

---

### 7. Интеграция с маршрутизацией

✅ **App.tsx** - добавлен маршрут `/products`
✅ **Layout.tsx** - добавлена ссылка "Продукты" в меню (только для админов)

---

## 📊 Примеры использования

### Создание продукта

1. Админ нажимает "+ Продукт"
2. Вводит название "Гречка ядрица"
3. Система проверяет дубль (debounce 300мс)
4. Если дубль найден:
   - Жёсткий (то же имя + та же единица) → красный блок, нельзя сохранить
   - Мягкий (то же имя, другая единица) → янтарный блок, можно сохранить
5. Выбирает категорию "Крупы" из дропдауна
6. Выбирает единицу "KG"
7. Вводит упаковку "0.9" (900г)
8. Отмечает "округлять закупку до упаковок"
9. Нажимает "Сохранить"

### Обновление продукта

1. Админ нажимает иконку правки на продукте
2. Открывается модалка с предзаполненными данными
3. Если продукт занят в рецептах:
   - Нельзя менять имя и единицу (поля заблокированы)
   - Можно менять категорию, упаковку, калорийность
4. Если продукт свободен:
   - Можно менять всё
5. Нажимает "Сохранить"

### Удаление продукта

1. Админ нажимает иконку удаления
2. Если продукт занят в рецептах → ошибка "Продукт используется в N рецептах"
3. Если продукт свободен → подтверждение → удаление

### Фильтрация и сортировка

1. Админ вводит запрос "гречка" → фильтрация по имени
2. Выбирает категорию "Крупы" → дополнительная фильтрация
3. Выбирает "есть цена" → ещё одна фильтрация
4. Кликает на заголовок "Цена" → сортировка по цене
5. Кликает ещё раз → изменение направления (asc → desc)
6. Состояние фильтров сохраняется в URL (можно поделиться ссылкой)

---

## 🧪 Тестовые сценарии

### PRD-01: Создание с категорией из дропдауна
```
POST /api/v1/admin/products
{
  "name": "Гречка ядрица",
  "categoryId": 1,
  "unit": "KG"
}

Ожидаемый результат:
- 201 Created
- category_id = 1
- name_norm = "гречка ядрица"
```

### PRD-02: Жёсткий дубль
```
Существует: "Гречка" в KG
Попытка создать: "гречка " в KG (с пробелом)

Ожидаемый результат:
- 409 DUPLICATE_PRODUCT
- existingId, existingName в ответе
```

### PRD-03: Дубль через ё/е
```
Существует: "Толчёнка" в KG
Попытка создать: "Толченка" в KG

Ожидаемый результат:
- 409 DUPLICATE_PRODUCT (нормализация ё→е)
```

### PRD-04: То же имя, другая единица
```
Существует: "Соль" в KG
Попытка создать: "Соль" в PCS

Ожидаемый результат:
- 201 Created (продукты различаются единицей)
- UI показывает мягкое предупреждение
```

### PRD-05: Live-проверка дубля
```
GET /api/v1/admin/products/check-name?name=Гречка&unit=KG

Ожидаемый результат:
- duplicate: true
- existingId: 1
- existingName: "Гречка ядрица"
- sameUnit: true
```

### PRD-06: Сортировка
```
GET /api/v1/admin/products?sort=price&direction=desc

Ожидаемый результат:
- Список отсортирован по цене (убывание)
```

### PRD-07: Комбинация фильтров
```
GET /api/v1/admin/products?categoryId=1&unit=KG&priceStatus=HAS_PRICE

Ожидаемый результат:
- Только продукты из категории "Крупы"
- Только в единице KG
- Только с ценой
```

### PRD-08: Правка занятого продукта
```
Продукт используется в рецептах.

Попытка 1: Сменить имя → 409 PRODUCT_IN_USE
Попытка 2: Сменить категорию → 200 OK
```

### PRD-09: Удаление
```
Свободный продукт → DELETE → 204 No Content
Занятый продукт → DELETE → 409 PRODUCT_IN_USE
```

### PRD-10: Сортировка категорий
```
GET /api/v1/product-categories

Ожидаемый результат:
- Список отсортирован по sort_order
```

### PRD-11: Миграция данных
```
После применения V8:
- Все продукты имеют category_id
- Все продукты имеют name_norm
- Старый unique по name снят
- Новый unique по (name_norm, unit) создан
```

---

## 📁 Файлы

### Созданные
✅ `backend/src/main/resources/db/migration/V8__product_categories_and_identity.sql`
✅ `backend/src/main/java/com/provision/entity/ProductCategory.java`
✅ `backend/src/main/java/com/provision/repository/ProductCategoryRepository.java`
✅ `backend/src/main/java/com/provision/dto/product/ProductCategoryDto.java`
✅ `backend/src/main/java/com/provision/dto/product/ProductRequest.java`
✅ `backend/src/main/java/com/provision/dto/product/ProductResponse.java`
✅ `backend/src/main/java/com/provision/dto/product/CheckNameResponse.java`
✅ `backend/src/main/java/com/provision/service/ProductService.java`
✅ `backend/src/main/java/com/provision/controller/ProductController.java`
✅ `src/pages/ProductsPage.tsx`

### Обновлённые
✅ `backend/src/main/java/com/provision/entity/Ingredient.java`
  - Добавлено nameNorm
  - Заменено category (String) на category (ProductCategory)
  - Убран unique constraint с name
✅ `backend/src/main/java/com/provision/repository/IngredientRepository.java`
  - Добавлен JpaSpecificationExecutor
  - Новые методы для работы с nameNorm
✅ `backend/src/main/java/com/provision/service/IngredientService.java`
  - Обновлён для работы с новой структурой
✅ `src/App.tsx` - добавлен маршрут /products
✅ `src/components/Layout.tsx` - добавлена ссылка "Продукты"

---

## 🎨 Дизайн-концепт Midnight Harbor

### Цветовая схема
- Фон: `var(--bg)` (#0B0F17)
- Поверхность: `var(--surface)` (#121826)
- Элевация: `var(--elev)` (#1A2233)
- Границы: `var(--border)` (rgba(255,255,255,0.08))
- Текст: `var(--text)` (#E6EDF7)
- Приглушённый: `var(--muted)` (#8B98AC)
- Вода: `var(--w1)` (#2DD4BF), `var(--w2)` (#38BDF8)
- Огонь: `var(--fire)` (#F59E0B)

### Компоненты
- Таблица с hover-эффектами
- Сегмент-контрол для единиц измерения
- Чипы для категорий и статусов
- Модальные окна с glass-эффектом
- NumberField для числовых полей
- Градиентные кнопки

---

## ✅ Готовность

✅ **Миграция V8 создана**
✅ **Entity созданы/обновлены**
✅ **Repository создан/обновлён**
✅ **DTO созданы**
✅ **Service создан**
✅ **Controller создан**
✅ **Фронтенд компонент создан**
✅ **Маршрутизация настроена**
✅ **Проект собирается успешно**
✅ **Готово к тестированию**

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ✅ ГОТОВО К ТЕСТИРОВАНИЮ
