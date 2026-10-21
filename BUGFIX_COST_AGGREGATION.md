# Анализ и исправление бага агрегации стоимости закупок

## Дата
2026-03-18

## Статус
✅ Исправлено и протестировано

---

## Описание проблемы

### Исходный баг

В методе `SummaryService.getShoppingList()` была обнаружена критическая ошибка в логике расчёта стоимости ингредиентов при агрегации по всему походу.

**Симптом:** При расчёте общей стоимости ингредиента, который используется в разные дни похода с разными ценами, система показывала некорректную стоимость.

**Пример из реальных данных:**

```
День 1 (21 окт):
  Гречка: 100 г, стоимость = 12 ₽

День 2 (22 окт):
  Гречка: 200 г, стоимость = 24 ₽

ИТОГО (из приложения):
  Гречка: 300 г, стоимость = 12 ₽ ❌ (НЕПРАВИЛЬНО!)

ПРАВИЛЬНОЕ ИТОГО:
  Гречка: 300 г, стоимость = 36 ₽ ✓ (12 + 24)
```

### Причина бага

**Старая логика (неправильная):**

```java
// Агрегация только количества
Map<Long, ShoppingAggregation> aggregation = new LinkedHashMap<>();

for (TripDay day : trip.getDays()) {
    for (TripMeal meal : day.getMeals()) {
        for (RecipeIngredient ri : recipe.getIngredients()) {
            BigDecimal mealAmount = calculateAmountForMeal(...);
            
            // Сохраняем только количество!
            aggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                    new ShoppingAggregation(ri.getIngredient()))
                    .addAmount(mealAmount);
        }
    }
}

// Расчёт стоимости в конце по ОДНОЙ цене
for (ShoppingAggregation agg : aggregation.values()) {
    // Берём цену на дату окончания похода для ВСЕХ дней!
    Optional<IngredientPrice> price = priceRepository
            .findEffectivePrice(agg.ingredient().getId(), trip.getEndDate());
    
    if (price.isPresent()) {
        // Пересчитываем стоимость по общему количеству
        estimatedCost = agg.totalAmount().multiply(price.get().getPricePerUnit());
    }
}
```

**Проблемы старой логики:**

1. ❌ Агрегируется только количество, стоимость не сохраняется
2. ❌ В конце берётся ОДНА цена (на дату окончания похода)
3. ❌ Стоимость пересчитывается по общему количеству
4. ❌ Если цены менялись во время похода - результат неверный

**Пример ошибки:**

```
День 1: 0.4 KG × 120₽/KG = 48₽
День 2: 0.4 KG × 150₽/KG = 60₽
Правильный итог: 48 + 60 = 108₽

Старая логика:
- Агрегирует количество: 0.4 + 0.4 = 0.8 KG
- Берёт цену на endDate: 150₽/KG
- Пересчитывает: 0.8 × 150 = 120₽ ❌
- Ошибка: 120 - 108 = 12₽ переплаты!
```

---

## Решение

### Новая логика (правильная)

**Ключевое изменение:** Агрегировать не только количество, но и стоимость, рассчитанную для каждого дня отдельно.

```java
// Новый класс для агрегации с учётом стоимости
private record ShoppingAggregationWithCost(Ingredient ingredient) {
    private BigDecimal totalAmount = BigDecimal.ZERO;
    private BigDecimal totalCost = BigDecimal.ZERO;
    private boolean hasAnyPrice = false;

    void addAmountAndCost(BigDecimal amount, BigDecimal cost) {
        totalAmount = totalAmount.add(amount);
        if (cost != null) {
            totalCost = totalCost.add(cost);
            hasAnyPrice = true;
        }
    }

    boolean hasPrice() {
        return hasAnyPrice;
    }
}
```

**Новая логика расчёта:**

```java
// Агрегация количества И стоимости по дням
Map<Long, ShoppingAggregationWithCost> aggregation = new LinkedHashMap<>();

for (TripDay day : trip.getDays()) {
    for (TripMeal meal : day.getMeals()) {
        for (RecipeIngredient ri : recipe.getIngredients()) {
            BigDecimal mealAmount = calculateAmountForMeal(...);
            
            // Получаем цену на дату ЭТОГО дня
            Optional<IngredientPrice> price = priceRepository
                    .findEffectivePrice(ri.getIngredient().getId(), day.getDayDate());
            
            BigDecimal mealCost = null;
            if (price.isPresent()) {
                // Рассчитываем стоимость для этого дня
                mealCost = mealAmount.multiply(price.get().getPricePerUnit())
                        .setScale(2, RoundingMode.HALF_UP);
            }
            
            // Сохраняем И количество, И стоимость
            aggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                    new ShoppingAggregationWithCost(ri.getIngredient()))
                    .addAmountAndCost(mealAmount, mealCost);
        }
    }
}

// Используем агрегированную стоимость
for (ShoppingAggregationWithCost agg : aggregation.values()) {
    if (agg.hasPrice()) {
        estimatedCost = agg.totalCost(); // Берём сумму стоимостей по дням
        hasPrice = true;
        totalCost = totalCost.add(estimatedCost);
    }
}
```

**Преимущества новой логики:**

1. ✅ Стоимость рассчитывается для каждого дня отдельно
2. ✅ Используются актуальные цены на дату каждого дня
3. ✅ Стоимости суммируются, а не пересчитываются
4. ✅ Корректная работа с меняющимися ценами
5. ✅ Точное соответствие бизнес-требованиям

---

## Тестирование

### Добавленные тесты

#### 1. `DetailedShoppingCalculationTest`

Два детальных теста с пошаговой математикой:

**Тест 1: `detailedShoppingCalculation`**
- Сценарий: Поход 12-14 мая с меняющимся количеством людей
- День 1: 4 человека
- День 2: 3 человека (day override)
- День 3: 2 человека (meal override)
- Проверка: количества и стоимости корректно рассчитываются

**Тест 2: `pricesChangeDuringTrip`**
- Сценарий: Цены меняются ВО ВРЕМЯ похода
- Гречка: 180₽ до 15 мая, 250₽ с 15 мая
- Проверка: стоимость рассчитывается правильно для каждого дня

#### 2. `ShoppingListCostAggregationBugTest`

Три теста для проверки агрегации стоимости:

**Тест 1: `costAggregation_shouldSumCostsAcrossDays`**
- Сценарий: Продукт встречается в разные дни
- Проверка: стоимость суммируется правильно

**Тест 2: `costAggregation_bugWithChangingPrices`**
- Сценарий: Цены меняются между днями
- Проверка: демонстрация бага (переплата 12₽)

**Тест 3: `currentImplementation_correctlySumsCosts`**
- Сценарий: Проверка текущей реализации
- Проверка: текущая реализация корректно суммирует стоимости

### Результаты тестов

Все тесты успешно проходят:

```
✅ DetailedShoppingCalculationTest
   ✅ detailedShoppingCalculation
   ✅ pricesChangeDuringTrip

✅ ShoppingListCostAggregationBugTest
   ✅ costAggregation_shouldSumCostsAcrossDays
   ✅ costAggregation_bugWithChangingPrices
   ✅ currentImplementation_correctlySumsCosts
```

---

## Влияние на другие методы

### `getShoppingByDays`

Этот метод уже корректно использовал `day.getDayDate()` для расчёта цены, поэтому изменения не потребовались.

### `getPersonSummary`

Этот метод использует `getShoppingList()`, поэтому автоматически получил исправление.

---

## Примеры использования

### Пример 1: Стабильные цены

```
Поход: 21-22 октября
Гречка: 120₽/KG (стабильная цена)

День 1: 0.4 KG × 120₽ = 48₽
День 2: 0.4 KG × 120₽ = 48₽
Итого: 0.8 KG, 96₽
```

### Пример 2: Меняющиеся цены

```
Поход: 21-22 октября
Гречка: 120₽/KG (21 окт), 150₽/KG (22 окт)

День 1: 0.4 KG × 120₽ = 48₽
День 2: 0.4 KG × 150₽ = 60₽
Итого: 0.8 KG, 108₽ ✓ (правильно!)

Старая логика дала бы: 0.8 KG × 150₽ = 120₽ ❌ (ошибка 12₽)
```

### Пример 3: Отсутствие цены

```
Поход: 21-22 октября
Соль: нет цены

День 1: 0.02 KG (нет цены)
День 2: 0.02 KG (нет цены)
Итого: 0.04 KG, нет цены ✓

Система корректно помечает ингредиент как "нет цены"
```

---

## Рекомендации

### Для пользователей

1. **Проверяйте цены:** Если цены на продукты меняются во время похода, система теперь корректно рассчитывает стоимость для каждого дня отдельно.

2. **Следите за отсутствующими ценами:** Если для ингредиента нет цены на какую-то дату, система покажет предупреждение "нет цены".

3. **Используйте сводку по дням:** Для детального анализа используйте вкладку "Закупка по дням", которая показывает стоимость для каждого дня отдельно.

### Для разработчиков

1. **Всегда используйте дату дня:** При расчёте стоимости всегда используйте `day.getDayDate()`, а не `trip.getEndDate()`.

2. **Агрегируйте стоимость:** При агрегации данных по походу сохраняйте не только количество, но и стоимость, рассчитанную для каждого дня.

3. **Тестируйте с меняющимися ценами:** Добавляйте тесты, которые проверяют работу с меняющимися ценами во время похода.

4. **Используйте BigDecimal:** Для всех финансовых расчётов используйте `BigDecimal` с правильным округлением (`RoundingMode.HALF_UP`).

### Для тестировщиков

1. **Проверяйте агрегацию:** Тестируйте сценарии, где один ингредиент используется в разные дни с разными ценами.

2. **Проверяйте отсутствие цен:** Тестируйте сценарии, где для некоторых дней нет цены.

3. **Используйте детальные тесты:** Используйте тесты из `DetailedShoppingCalculationTest` как пример детального тестирования бизнес-логики.

---

## Файлы, изменённые в рамках исправления

### Backend

1. **`backend/src/main/java/com/provision/service/SummaryService.java`**
   - Изменён метод `getShoppingList()`
   - Добавлен класс `ShoppingAggregationWithCost`
   - Исправлена логика агрегации стоимости

2. **`backend/src/test/java/com/provision/service/DetailedShoppingCalculationTest.java`**
   - Добавлены детальные тесты с пошаговой математикой

3. **`backend/src/test/java/com/provision/service/ShoppingListCostAggregationBugTest.java`**
   - Добавлены тесты для проверки агрегации стоимости

### Frontend

Изменения не потребовались, так как API не изменился.

---

## Заключение

✅ **Баг исправлен:** Метод `getShoppingList()` теперь корректно рассчитывает стоимость ингредиентов с учётом меняющихся цен.

✅ **Тесты добавлены:** Добавлены детальные тесты, которые проверяют правильность расчётов.

✅ **Документация создана:** Создана подробная документация с описанием бага, решения и примеров.

✅ **Качество улучшено:** Улучшена точность финансовых расчётов и надёжность системы.

---

## Дополнительные материалы

- **BUGFIX_SHOPPING_CALCULATION.md** - первоначальное описание бага
- **DetailedShoppingCalculationTest.java** - детальные тесты с пошаговой математикой
- **ShoppingListCostAggregationBugTest.java** - тесты для проверки агрегации стоимости

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0
