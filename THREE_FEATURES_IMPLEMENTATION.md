# Три новые фичи: Привязка каталога, Замены компонентов, Расчёт упаковок

## 📅 Дата
2026-03-18

## ✅ Статус
**РЕАЛИЗОВАНО И ГОТОВО К ИСПОЛЬЗОВАНИЮ**

---

## 🎯 Что было реализовано

### 1. Мастер привязки каталога (BindingWizard)

**Проблема:** Админу нужно привязать внутренние компоненты к внешним продуктам из Open Food Facts.

**Решение:**

#### Функциональность
✅ **Очередь привязки** - отсортирована по денежному весу (гречка, тушёнка, вода первыми)
✅ **Авто-кандидаты** - 1-3 предложения из OFF с распознанной упаковкой
✅ **Горячие клавиши** - 1/2/3 для выбора кандидата, S для пропуска
✅ **Ручной ввод** - возможность ввести штрихкод вручную
✅ **Настройка упаковки** - размер упаковки и флаг округления до упаковок
✅ **Прогресс-бар** - визуализация прогресса привязки

#### Пример использования
```
1. Админ открывает "Интеграции → Привязать каталог"
2. Видит очередь: гречка (95% денег), тушёнка (80%), вода (70%)...
3. Для гречки предложены 3 кандидата из OFF:
   - "Гречка ядрица 900г" (score: 95%)
   - "Гречка пропаренная 800г" (score: 87%)
   - "Гречка в пакетиках 400г" (score: 72%)
4. Админ нажимает "1" или кликает на первого кандидата
5. Система автоматически определяет упаковку: 900г = 0.9 KG
6. Устанавливает flag "округлять до упаковок"
7. Переходит к следующему компоненту
8. Через 20 минут привязано 34 из 60 компонентов (95% денег)
```

#### API Endpoints
```
GET  /api/v1/admin/ingredients?bound=false&sort=moneyWeight
GET  /api/v1/admin/integrations/off/suggest?ingredientId={id}&limit=3
PUT  /api/v1/admin/ingredients/{id}/binding
DELETE /api/v1/admin/ingredients/{id}/binding
```

---

### 2. Замены компонентов в походе (SubstitutionModal)

**Проблема:** В магазине не было гречки, нужно заменить на рис, но только для этого похода.

**Решение:**

#### Функциональность
✅ **Локальные замены** - действуют только на конкретный поход
✅ **Поиск похожих** - подсказки по категории (крупы → крупы)
✅ **Ratio** - коэффициент пересчёта (сушёное → свежее = 0.1)
✅ **Визуализация** - чип "замена: рис вместо гречки" на карточке блюда
✅ **Список замен** - отдельная плашка с активными заменами похода
✅ **Отмена замены** - возможность вернуть оригинал

#### Пример использования
```
1. Пользователь в планировщике на карточке "Гречка с тушенкой"
2. Нажимает иконку замены
3. Открывается модалка:
   - Слева: компоненты рецепта (гречка, тушёнка, соль)
   - Справа: поиск по каталогу с подсказками "похожие"
4. Выбирает "гречка" → система показывает похожие: рис, пшено, кускус
5. Выбирает "рис", ratio 1:1
6. Сохраняет
7. Только этот поход пересчитывается:
   - В меню: рис вместо гречки
   - В закупке: рис 1.8 KG вместо гречки
   - В сводках: новая стоимость
8. Каталог и другие походы не изменены
9. На карточке блюда чип: "замена: рис вместо гречки"
```

#### Пример с ratio
```
Рецепт: "Грибной суп"
- Грибы сушёные: 0.02 KG

Замена: грибы сушёные → грибы свежие
Ratio: 0.1 (сушёные в 10 раз концентрированнее)

Расчёт:
- Нужно: 0.02 KG сушёных
- Заменяем на: 0.02 × 0.1 = 0.002 KG свежих
```

#### API Endpoints
```
GET    /api/v1/trips/{id}/substitutions
POST   /api/v1/trips/{id}/substitutions
DELETE /api/v1/trips/{id}/substitutions/{subId}
GET    /api/v1/ingredients/similar/{id}?limit=5
```

---

### 3. Расчёт закупок с учётом упаковок

**Проблема:** Нужно 1.8 кг гречки, но в магазине продаётся упаковками по 900г. Сколько покупать?

**Решение:**

#### Функциональность
✅ **Расчёт упаковок** - `packs = ceil(need / pack_size)`
✅ **Остатки** - `leftover = buyAmount - need`
✅ **Стоимость по упаковкам** - `cost = packs × packPrice`
✅ **Штучные товары** - тушёнка: pack_size=1, need 8.2 → buy 9 шт
✅ **Развесные товары** - если pack_size=null, buy=need
✅ **Отображение** - новые колонки в таблице закупок

#### Примеры расчёта

**Пример 1: Гречка (упаковка 900г)**
```
Нужно: 1.8 KG
Упаковка: 0.9 KG
Округлять: true

Расчёт:
- packs = ceil(1.8 / 0.9) = 2
- buyAmount = 2 × 0.9 = 1.8 KG
- leftover = 1.8 - 1.8 = 0 KG
- cost = 2 × 179₽ = 358₽ (а не 1.8 × 199₽/кг = 358₽)
```

**Пример 2: Вода (упаковка 1.5л)**
```
Нужно: 1.0 L
Упаковка: 1.5 L
Округлять: true

Расчёт:
- packs = ceil(1.0 / 1.5) = 1
- buyAmount = 1 × 1.5 = 1.5 L
- leftover = 1.5 - 1.0 = 0.5 L
- cost = 1 × 45₽ = 45₽ (а не 1.0 × 30₽/л = 30₽)
```

**Пример 3: Тушёнка (штучный товар)**
```
Нужно: 8.2 PCS
Упаковка: 1 PCS (по умолчанию для штучных)
Округлять: true

Расчёт:
- packs = ceil(8.2 / 1) = 9
- buyAmount = 9 × 1 = 9 PCS
- leftover = 9 - 8.2 = 0.8 PCS
- cost = 9 × 210₽ = 1890₽
```

**Пример 4: Соль (развесной товар)**
```
Нужно: 0.045 KG
Упаковка: null (развесной)
Округлять: false

Расчёт:
- packs = null
- buyAmount = need = 0.045 KG
- leftover = 0
- cost = 0.045 × 60₽/кг = 2.70₽
```

#### Новая таблица закупок

| Продукт | Надо | Упаковки | Купить | Остаток | План ₽ | Факт ₽/ед | Факт ₽ | Δ |
|---------|------|----------|--------|---------|--------|-----------|--------|---|
| Гречка | 1.8 кг | 2 × 0.9 кг | 1.8 кг | 0 кг | 358 | 250 | 450 | +25% |
| Тушёнка | 8.2 шт | 9 × 1 шт | 9 шт | 0.8 шт | 1722 | 190 | 1710 | −9.5% |
| Вода | 1.0 л | 1 × 1.5 л | 1.5 л | 0.5 л | 45 | 45 | 45 | 0% |
| Соль | 45 г | развес | 45 г | 0 г | 2.70 | 30 | 1.35 | факт |

#### Правила расчёта

```
1. effective(ing) = substitution ?? ing
2. amount *= ratio (если есть замена)
3. need[eff] = Σ по приёмам пищи (amount/baseServings × people × ratio)
4. packs = round_to_packs && pack_size ? ceil(need / pack_size) : null
5. buyAmount = packs ? packs × pack_size : need
6. leftover = buyAmount − need
7. plannedCost = packs ? packs × packPrice : need × unitPrice
8. actualCost = то же по факт-цене (факт-оверрайд применяется к FINAL-компоненту, после замены)
```

---

## 🏗️ Архитектура

### База данных

#### Миграция V7__packs_and_substitutions.sql

```sql
-- Добавляем поля упаковок в ingredients
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS pack_size NUMERIC(14,3);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS round_to_packs BOOLEAN NOT NULL DEFAULT FALSE;

-- Таблица замен компонентов в походах
CREATE TABLE trip_ingredient_substitutions (
    id BIGSERIAL PRIMARY KEY,
    trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    from_ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    to_ingredient_id BIGINT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    ratio NUMERIC(10,4) NOT NULL DEFAULT 1 CHECK (ratio > 0),
    comment VARCHAR(500),
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (trip_id, recipe_id, from_ingredient_id),
    CHECK (from_ingredient_id <> to_ingredient_id)
);
```

### Бэкенд

#### Entity
- ✅ `Ingredient` - добавлены поля `packSize`, `roundToPacks`
- ✅ `TripIngredientSubstitution` - новая entity для замен

#### Repository
- ✅ `TripIngredientSubstitutionRepository` - CRUD для замен

#### Service
- ✅ `SubstitutionService` - управление заменами
- ✅ `SummaryService` - обновлён для поддержки замен и упаковок

#### Controller
- ✅ `SubstitutionController` - API для замен

#### DTO
- ✅ `SubstitutionRequest` - запрос на создание замены
- ✅ `SubstitutionResponse` - ответ с заменой
- ✅ `IngredientBindingRequest` - запрос на привязку упаковки
- ✅ `ShoppingItemResponse` - обновлён с полями упаковок и замен

### Фронтенд

#### Компоненты
- ✅ `BindingWizard.tsx` - мастер привязки каталога
- ✅ `SubstitutionModal.tsx` - модалка замены компонента
- ✅ Обновлён `PriceOverridesTab.tsx` - новые колонки для упаковок

---

## 🧪 Тесты

### Тестовые сценарии

#### PACK-01: Расчёт упаковок (гречка)
```
need: 1.8 KG
pack: 1 KG
round_to_packs: true

Ожидаемый результат:
- packs: 2
- buyAmount: 2.0 KG
- leftover: 0.2 KG
- cost: 2 × packPrice
```

#### PACK-02: Штучные товары (тушёнка)
```
need: 8.2 PCS
pack: 1 PCS (по умолчанию)
round_to_packs: true

Ожидаемый результат:
- packs: 9
- buyAmount: 9 PCS
- leftover: 0.8 PCS
```

#### PACK-03: Без округления
```
need: 1.5 KG
pack: 1 KG
round_to_packs: false

Ожидаемый результат:
- packs: null
- buyAmount: 1.5 KG (need)
- leftover: 0
- cost: 1.5 × unitPrice
```

#### PACK-04: Развесной товар
```
need: 0.045 KG
pack: null
round_to_packs: false

Ожидаемый результат:
- packs: null
- buyAmount: 0.045 KG
- leftover: 0
- cost: 0.045 × unitPrice
```

#### SUB-01: Замена гречка→рис
```
Поход: 12-14 мая
Рецепт: "Гречка с тушенкой"
Замена: гречка → рис, ratio 1:1

Ожидаемый результат:
- Закупка показывает рис 1.8 KG
- Рецепт в каталоге не изменён
- Другой поход с тем же рецептом использует гречку
```

#### SUB-02: Ratio 0.1
```
Рецепт: "Грибной суп"
Замена: грибы сушёные → грибы свежие, ratio 0.1

Ожидаемый результат:
- need: 0.02 KG сушёных
- buyAmount: 0.02 × 0.1 = 0.002 KG свежих
```

#### SUB-03: Удаление замены
```
Создана замена: гречка → рис
DELETE /trips/{id}/substitutions/{subId}

Ожидаемый результат:
- Возврат к оригиналу во всех сводках
- Закупка снова показывает гречку
```

#### SUB-04: Факт-оверрайд применяется к заменителю
```
Замена: гречка → рис
Факт-оверрайд: рис 250₽ (план 200₽)

Ожидаемый результат:
- actualCost считается по цене риса (250₽)
- Оверрайд оригинала (гречки) игнорируется
```

#### BIND-01: Привязка упаковки
```
PUT /admin/ingredients/{id}/binding
{
  "externalCode": "4001234567890",
  "packSize": 0.9,
  "packUnit": "KG",
  "roundToPacks": true
}

Ожидаемый результат:
- ingredient.pack_size = 0.9
- ingredient.round_to_packs = true
- Создан IngredientMapping
- Синк OFF считает unitPrice = packPrice / pack_size
```

#### BIND-02: Очередь привязки
```
GET /admin/ingredients?bound=false&sort=moneyWeight

Ожидаемый результат:
- Гречка (95% денег) первая
- Соль (5% денег) последняя
- suggest кэширует external_products
```

#### BIND-03: Парсинг упаковки
```
quantity: "6 x 100 g"

Ожидаемый результат:
- amount: 0.6 KG
- unit: "KG"
```

---

## 📊 Пример использования

### Сценарий: Подготовка к походу

**Шаг 1: Привязка каталога (админ, один раз)**
```
1. Админ открывает "Интеграции → Привязать каталог"
2. Видит очередь из 60 компонентов
3. Привязывает 34 компонента (95% денег) за 20 минут
4. Остальные 26 пропускает (соль, специи, лавровый лист)
5. Они останутся с ручными ценами
```

**Шаг 2: Создание похода (пользователь)**
```
1. Пользователь создаёт поход на 3 дня
2. Добавляет рецепты: гречка с тушенкой, грибной суп, овсянка
3. Система рассчитывает закупку:
   - Гречка: 1.8 KG (2 упаковки × 0.9 KG)
   - Тушёнка: 9 шт (8.2 нужно, округление до 9)
   - Грибы сушёные: 0.06 KG (развесные)
```

**Шаг 3: Замена компонента (в магазине)**
```
1. В магазине не оказалось гречки
2. Пользователь открывает карточку "Гречка с тушенкой"
3. Нажимает иконку замены
4. Выбирает "рис" (похожий компонент из категории "крупы")
5. Ratio: 1:1
6. Сохраняет
7. Система пересчитывает:
   - Закупка: рис 1.8 KG вместо гречки
   - Меню: рис вместо гречки
   - Сводки: новая стоимость
8. На карточке блюда чип: "замена: рис вместо гречки"
```

**Шаг 4: Ввод чека (после покупки)**
```
1. Пользователь открывает "Закупка и чеки"
2. Видит таблицу с колонками:
   - Надо: 1.8 KG
   - Упаковки: 2 × 0.9 KG
   - Купить: 1.8 KG
   - Остаток: 0 KG
3. Вводит фактические цены:
   - Рис: 250₽ (вместо плана 200₽)
   - Тушёнка: 190₽ (вместо плана 210₽)
4. Система пересчитывает:
   - План: 2343₽
   - Факт: 2254₽
   - Дельта: -3.78%
```

---

## 📁 Файлы

### Созданные
- ✅ `backend/src/main/resources/db/migration/V7__packs_and_substitutions.sql`
- ✅ `backend/src/main/java/com/provision/entity/TripIngredientSubstitution.java`
- ✅ `backend/src/main/java/com/provision/repository/TripIngredientSubstitutionRepository.java`
- ✅ `backend/src/main/java/com/provision/service/SubstitutionService.java`
- ✅ `backend/src/main/java/com/provision/controller/SubstitutionController.java`
- ✅ `backend/src/main/java/com/provision/dto/trip/SubstitutionRequest.java`
- ✅ `backend/src/main/java/com/provision/dto/trip/SubstitutionResponse.java`
- ✅ `backend/src/main/java/com/provision/dto/ingredient/IngredientBindingRequest.java`
- ✅ `src/components/BindingWizard.tsx`
- ✅ `src/components/SubstitutionModal.tsx`

### Обновлённые
- ✅ `backend/src/main/java/com/provision/entity/Ingredient.java` - добавлены поля packSize, roundToPacks
- ✅ `backend/src/main/java/com/provision/service/SummaryService.java` - поддержка замен и упаковок
- ✅ `backend/src/main/java/com/provision/dto/summary/ShoppingItemResponse.java` - новые поля

---

## ✅ Готовность

✅ **Миграция БД создана**
✅ **Entity созданы**
✅ **Repository создан**
✅ **Service создан**
✅ **Controller создан**
✅ **DTO созданы**
✅ **React компоненты созданы**
✅ **SummaryService обновлён**
✅ **Проект собирается успешно**
✅ **Готово к тестированию**

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ✅ ГОТОВО К ТЕСТИРОВАНИЮ
