# Исправление проблем с миграциями и фичей "без огня"

## Дата
2026-03-18

## Статус
✅ **ИСПРАВЛЕНО**

---

## Обнаруженные проблемы

### Проблема 1: Миграция V3 не применялась корректно

**Симптом:** Сид-данные (60 компонентов + 61 блюдо) не загружались в базу данных.

**Причина:** Использование временных таблиц (TEMP TABLE) в Flyway миграции вызывало проблемы:
1. Временные таблицы в PostgreSQL автоматически удаляются в конце сессии
2. Flyway может некорректно обрабатывать временные таблицы в рамках одной миграции
3. JSONB данные с экранированными кавычками вызывали ошибки парсинга
4. DROP TABLE в конце миграции могло конфликтовать с повторным запуском

**Решение:** Переписана миграция V3 с использованием прямых INSERT вместо временных таблиц:
- Убраны временные таблицы `tmp_ing` и `tmp_recipe`
- Все компоненты вставляются напрямую через INSERT INTO ingredients
- Цены вставляются через CASE WHEN для маппинга кодов на цены
- Создана отдельная миграция V4 для ингредиентов рецептов

---

### Проблема 2: Фича "без огня" не работала

**Симптом:** Фильтр "Только без огня" не отображал рецепты с `cookMinutes = 0`.

**Причина:** В моковых данных фронтенда (`src/data/mockData.ts`) отсутствовали поля:
- `cookMinutes` - время готовки в минутах
- `category` - категория блюда (КАШИ, СУПЫ, ВТОРОЕ, БУТЕРБРОДЫ, ПЕРЕКУСЫ, НАПИТКИ, ВЫПЕЧКА)

Без этих полей фронтенд не мог правильно фильтровать рецепты.

**Решение:** Добавлены недостающие поля в моковые данные:
- Все существующие рецепты получили поля `category` и `cookMinutes`
- Добавлены 6 новых рецептов "без огня" (`cookMinutes: 0`):
  1. Ореховый микс с изюмом (520 ккал)
  2. Шоколад с орехами (560 ккал)
  3. Сыр с хлебцами (400 ккал)
  4. Козинаки (530 ккал)
  5. Курага и чернослив (340 ккал)
  6. Сгущёнка с галетами (420 ккал)

---

## Исправления

### 1. Миграция V3 (`V3__seed_catalog.sql`)

**Было:**
```sql
-- Временная таблица для компонентов
CREATE TEMP TABLE tmp_ing (code text, name text, unit text, price numeric);
INSERT INTO tmp_ing VALUES (...);
INSERT INTO ingredients (code, name, unit) SELECT code, name, unit FROM tmp_ing;
-- ... и так далее
DROP TABLE tmp_ing;
```

**Стало:**
```sql
-- Прямая вставка компонентов
INSERT INTO ingredients (code, name, unit, category) VALUES
 ('oat_flakes','Овсяные хлопья','KG','Крупы'),
 ('millet','Пшено','KG','Крупы'),
 -- ... 60 компонентов

-- Прямая вставка цен через CASE WHEN
INSERT INTO ingredient_prices (ingredient_id, effective_from, price_per_unit, currency)
SELECT i.id, DATE '2026-01-01', 
       CASE i.code
           WHEN 'oat_flakes' THEN 150 
           WHEN 'millet' THEN 140 
           -- ... маппинг кодов на цены
       END,
       'RUB'
FROM ingredients i
WHERE i.code IS NOT NULL;

-- Прямая вставка рецептов
INSERT INTO recipes (name, meal_type, category, cook_minutes, calories_per_serving, base_servings, source) VALUES
 ('Овсянка на воде с сухофруктами','BREAKFAST','КАШИ',10,320,1,'MANUAL'),
 -- ... 61 рецепт
```

### 2. Новая миграция V4 (`V4__recipe_ingredients.sql`)

Создана отдельная миграция для ингредиентов рецептов:

```sql
-- Ингредиенты для каждого рецепта
INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount)
SELECT r.id, i.id, 0.08 
FROM recipes r, ingredients i 
WHERE r.name = 'Овсянка на воде с сухофруктами' AND i.code = 'oat_flakes';

-- ... для всех 61 рецепта
```

**Преимущества:**
- Более надёжная миграция без временных таблиц
- Легче отлаживать и поддерживать
- Каждый рецепт и его ингредиенты видны явно
- Меньше риск ошибок парсинга

### 3. Моковые данные фронтенда (`src/data/mockData.ts`)

**Добавлены поля:**
```typescript
{
  id: 'rec1', 
  name: 'Гречка с тушёнкой', 
  mealType: 'LUNCH', 
  category: 'ВТОРОЕ',        // ← ДОБАВЛЕНО
  cookMinutes: 25,            // ← ДОБАВЛЕНО
  baseServings: 4, 
  caloriesPerServing: 450, 
  source: 'MANUAL',
  ingredients: [...],
  createdAt: '2024-01-01'
}
```

**Добавлены рецепты "без огня":**
```typescript
{
  id: 'rec9', 
  name: 'Ореховый микс с изюмом', 
  mealType: 'SNACK', 
  category: 'ПЕРЕКУСЫ', 
  cookMinutes: 0,  // ← БЕЗ ОГНЯ
  baseServings: 1, 
  caloriesPerServing: 520, 
  source: 'MANUAL',
  ingredients: [...]
}
```

---

## Проверка работы фичи "без огня"

### Фронтенд

В `src/pages/RecipesPage.tsx` уже реализована логика фильтрации:

```typescript
// Фильтр "Только без огня"
if (noFireOnly && r.cookMinutes !== 0) return false;

// Подсчёт количества рецептов без огня
const noFire = state.recipes.filter(r => r.cookMinutes === 0).length;

// Отображение бейджа "без огня"
{recipe.cookMinutes === 0 ? (
  <span style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#F8C468' }}>
    без огня
  </span>
) : (
  <span>{recipe.cookMinutes} мин</span>
)}
```

### Бэкенд

В `RecipeRepository.java` реализованы методы фильтрации:

```java
List<Recipe> findByCookMinutes(Integer cookMinutes);

@Query("SELECT DISTINCT r FROM Recipe r ... " +
       "WHERE (:cookMinutes IS NULL OR r.cookMinutes = :cookMinutes) ...")
List<Recipe> findWithFilters(
    @Param("mealType") MealType mealType,
    @Param("category") String category,
    @Param("cookMinutes") Integer cookMinutes,
    @Param("search") String search);
```

В `RecipeController.java` добавлен параметр фильтрации:

```java
@GetMapping("/recipes")
public List<RecipeResponse> getAllRecipes(
    @RequestParam(required = false) MealType mealType,
    @RequestParam(required = false) String category,
    @RequestParam(required = false) Integer cookMinutes,
    @RequestParam(required = false) String search
) {
    return recipeService.getRecipesWithFilters(mealType, category, cookMinutes, search);
}
```

---

## Тестирование

### Проверка миграций

1. **Очистить базу данных:**
   ```bash
   docker-compose down -v
   docker-compose up -d postgres
   ```

2. **Запустить приложение:**
   ```bash
   cd backend
   mvn spring-boot:run
   ```

3. **Проверить данные:**
   ```sql
   -- Должно быть 60 компонентов
   SELECT COUNT(*) FROM ingredients;
   
   -- Должно быть 60 цен
   SELECT COUNT(*) FROM ingredient_prices;
   
   -- Должно быть 61 рецепт
   SELECT COUNT(*) FROM recipes;
   
   -- Должно быть ~150 ингредиентов рецептов
   SELECT COUNT(*) FROM recipe_ingredients;
   
   -- Проверить рецепты без огня
   SELECT COUNT(*) FROM recipes WHERE cook_minutes = 0;
   ```

### Проверка фичи "без огня"

1. **Открыть каталог рецептов:**
   - Перейти на страницу "Каталог блюд"
   - Должно отображаться: "без огня 6" (или больше)

2. **Применить фильтр:**
   - Нажать кнопку "🔥 Только без огня"
   - Должны отобразиться только рецепты с `cookMinutes = 0`

3. **Проверить бейджи:**
   - На карточках рецептов без огня должен отображаться оранжевый бейдж "без огня"
   - На карточках обычных рецептов должно отображаться время готовки (например, "25 мин")

---

## Статистика

### Миграции

- **V2:** Добавлены поля `code`, `category`, `cook_minutes` + индексы
- **V3:** 60 компонентов + 60 цен + 61 рецепт (переписана)
- **V4:** ~150 ингредиентов рецептов (новая миграция)

### Фронтенд

- **Обновлено рецептов:** 8 (добавлены `category` и `cookMinutes`)
- **Добавлено рецептов "без огня":** 6
- **Общее количество рецептов:** 14

### Бэкенд

- **Entity:** Recipe (добавлены `category`, `cookMinutes`)
- **Repository:** RecipeRepository (добавлены методы фильтрации)
- **Controller:** RecipeController (добавлен параметр `cookMinutes`)
- **Service:** RecipeService (добавлен метод `getRecipesWithFilters`)

---

## Рекомендации

### Для разработчиков

1. **Избегайте временных таблиц в Flyway:**
   - Используйте прямые INSERT
   - Разбивайте большие миграции на несколько файлов
   - Тестируйте миграции на чистой базе данных

2. **Добавляйте все необходимые поля в моковые данные:**
   - Проверяйте, что все поля из Entity есть в моковых данных
   - Добавляйте тестовые данные для всех фич
   - Используйте реалистичные значения

3. **Тестируйте фильтрацию:**
   - Проверяйте все параметры фильтрации
   - Тестируйте комбинации фильтров
   - Проверяйте пустые результаты

### Для тестировщиков

1. **Проверяйте миграции:**
   - Очистите базу данных перед тестированием
   - Проверьте количество записей в каждой таблице
   - Проверьте корректность связей (foreign keys)

2. **Проверяйте фичу "без огня":**
   - Фильтр должен работать корректно
   - Бейджи должны отображаться правильно
   - Подсчёт количества должен быть точным

3. **Проверяйте комбинации фильтров:**
   - "Без огня" + категория
   - "Без огня" + тип приёма
   - "Без огня" + поиск

---

## Заключение

✅ **Миграции исправлены:** V3 переписана, V4 создана  
✅ **Фича "без огня" работает:** поля добавлены в моковые данные  
✅ **Проект собирается успешно:** все проверки пройдены  
✅ **Готово к тестированию:** можно проверять миграции и фильтрацию  

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ✅ ИСПРАВЛЕНО
