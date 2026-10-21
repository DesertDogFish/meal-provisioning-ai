# Исправление бага в расчёте стоимости закупок

## Описание проблемы

В методе `SummaryService.getShoppingList()` была обнаружена ошибка в логике расчёта стоимости ингредиентов.

### Исходная проблема

Метод использовал **цену на дату окончания похода** (`trip.getEndDate()`) для расчёта стоимости **всех** ингредиентов, независимо от того, в какие дни они использовались.

```java
// СТАРАЯ ЛОГИКА (НЕПРАВИЛЬНАЯ)
Optional<IngredientPrice> price = priceRepository
        .findEffectivePrice(agg.ingredient().getId(), trip.getEndDate());
```

### Почему это проблема

Если цены на ингредиенты меняются во время похода, расчёт стоимости будет некорректным.

**Пример:**
- Поход: 10-20 мая 2026
- Гречка: 180₽ до 15 мая, 250₽ с 15 мая
- День 10 мая: нужно 0.8 KG гречки
- День 20 мая: нужно 0.8 KG гречки

**Правильный расчёт:**
- День 10 мая: 0.8 × 180₽ = 144₽
- День 20 мая: 0.8 × 250₽ = 200₽
- **Итого: 344₽**

**Неправильный расчёт (старая логика):**
- Используется цена на 20 мая (250₽) для обоих дней
- (0.8 + 0.8) × 250₽ = 400₽
- **Ошибка: 56₽ переплаты**

## Решение

### Новая логика

Теперь метод `getShoppingList()` рассчитывает стоимость для каждого дня отдельно, используя цену на дату этого дня:

```java
// НОВАЯ ЛОГИКА (ПРАВИЛЬНАЯ)
for (TripDay day : trip.getDays()) {
    for (TripMeal meal : day.getMeals()) {
        // ...
        for (RecipeIngredient ri : recipe.getIngredients()) {
            BigDecimal mealAmount = calculateAmountForMeal(...);
            
            // Получаем цену на дату ЭТОГО дня
            Optional<IngredientPrice> price = priceRepository
                    .findEffectivePrice(ri.getIngredient().getId(), day.getDayDate());
            
            BigDecimal mealCost = null;
            if (price.isPresent()) {
                mealCost = mealAmount.multiply(price.get().getPricePerUnit())
                        .setScale(2, RoundingMode.HALF_UP);
            }
            
            aggregation.computeIfAbsent(ri.getIngredient().getId(), k -> 
                    new ShoppingAggregationWithCost(ri.getIngredient()))
                    .addAmountAndCost(mealAmount, mealCost);
        }
    }
}
```

### Новый класс `ShoppingAggregationWithCost`

Добавлен новый вспомогательный класс для агрегации количества и стоимости по дням:

```java
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

## Тесты

### DetailedShoppingCalculationTest

Добавлен новый набор детальных тестов, которые проверяют математику пошагово:

#### Тест 1: `detailedShoppingCalculation`

**Сценарий:** Поход 12-14 мая с меняющимся количеством людей
- День 1 (12 мая): 4 человека
- День 2 (13 мая): 3 человека (day override)
- День 3 (14 мая): 2 человека (meal override)

**Рецепт:** Гречка с тушенкой (baseServings = 4)
- Гречка: 0.8 KG на 4 порции
- Тушенка: 4 PCS на 4 порции
- Соль: 0.02 KG на 4 порции

**Цены:**
- Гречка: 200₽ (с 1 мая)
- Тушенка: 210₽ (стабильно)
- Соль: нет цены

**Ожидаемые результаты:**
- День 1: 0.8 KG гречки × 200₽ + 4 PCS тушенки × 210₽ = 160 + 840 = 1000₽
- День 2: 0.6 KG гречки × 200₽ + 3 PCS тушенки × 210₽ = 120 + 630 = 750₽
- День 3: 0.4 KG гречки × 200₽ + 2 PCS тушенки × 210₽ = 80 + 420 = 500₽
- **Итого: 2250₽**

**Проверки:**
- ✅ Общее количество гречки: 1.8 KG
- ✅ Общее количество тушенки: 9 PCS
- ✅ Общее количество соли: 0.045 KG
- ✅ Общая стоимость: 2250₽
- ✅ Всего человеко-приёмов: 9

#### Тест 2: `pricesChangeDuringTrip`

**Сценарий:** Цены меняются ВО ВРЕМЯ похода
- Поход: 10-20 мая
- Гречка: 180₽ до 15 мая, 250₽ с 15 мая (скачок цены!)

**Ожидаемые результаты:**
- День 10 мая: 0.8 KG × 180₽ = 144₽
- День 20 мая: 0.8 KG × 250₽ = 200₽
- **Правильный итог: 344₽**

**Проверки:**
- ✅ Стоимость дня 10: 144₽
- ✅ Стоимость дня 20: 200₽
- ✅ Общий итог: 344₽

## Влияние на другие методы

### `getShoppingByDays`

Этот метод уже корректно использовал `day.getDayDate()` для расчёта цены, поэтому изменения не потребовались.

### `getPersonSummary`

Этот метод использует `getShoppingList()`, поэтому автоматически получил исправление.

## Запуск тестов

```bash
cd backend
mvn test -Dtest=DetailedShoppingCalculationTest
```

Тесты выводят подробную информацию о расчётах в консоль, что позволяет визуально проверить математику.

## Итоги

✅ Исправлен баг в расчёте стоимости закупок
✅ Добавлены детальные тесты с пошаговой математикой
✅ Проверен сценарий с меняющимися ценами
✅ Улучшена точность финансовых расчётов
✅ Сохранена обратная совместимость API

## Рекомендации

1. **Для пользователей:** Если цены на продукты меняются во время похода, система теперь корректно рассчитывает стоимость для каждого дня отдельно.

2. **Для разработчиков:** При добавлении новых расчётов стоимости всегда используйте дату конкретного дня, а не дату окончания похода.

3. **Для тестировщиков:** Используйте тест `DetailedShoppingCalculationTest` как пример детального тестирования бизнес-логики с выводом промежуточных результатов.
