# Экран "Журнал синков" - Полная реализация

## 📅 Дата
2026-03-18

## ✅ Статус
**РЕАЛИЗОВАНО И ГОТОВО К ИСПОЛЬЗОВАНИЮ**

---

## 🎯 Что было реализовано

### 1. Миграция V10: Расширение таблицы sync_logs

**Файл:** `backend/src/main/resources/db/migration/V10__sync_trigger.sql`

Добавлены поля для отслеживания происхождения запуска:
- `triggered_by` - MANUAL или SCHEDULED
- `triggered_user` - ссылка на пользователя, запустившего синк

---

### 2. Бэкенд: Entity, Repository, DTO, Service, Controller

#### Entity
✅ **SyncLog** - обновлён:
- Добавлено поле `triggeredBy` (MANUAL/SCHEDULED)
- Добавлено поле `triggeredUser` (ссылка на User)

#### Repository
✅ **SyncLogRepository** - добавлены методы:
- `findRunningByProvider()` - поиск RUNNING синка для провайдера
- `findAllRunning()` - поиск всех RUNNING синков
- `findByFilters()` - фильтрация по provider, type, status, периоду
- `countSuccessfulSince()` - подсчёт успешных синков за период
- `sumUpdatedSince()` - сумма обновлённых строк за период
- `sumErrorsSince()` - сумма ошибок за период

#### DTO
✅ **SyncLogResponse** - DTO для ответа:
- id, provider, type, status
- triggeredBy, triggeredUserEmail
- startedAt, finishedAt, durationSeconds
- createdCount, updatedCount, errorCount
- details (requestCount, items, errors)

✅ **SyncKpiResponse** - DTO для KPI:
- totalRuns, successRate, totalUpdated, totalErrors

✅ **IntegrationSettingsRequest** - DTO для настроек:
- autoSync, autoSyncTime

#### Service
✅ **SyncLogService** - сервис журнала синков:
- `getSyncLogs()` - список с фильтрами
- `getSyncLog()` - детали запуска
- `startSync()` - запуск синка с проверкой на параллельный запуск
- `completeSync()` - завершение синка с деталями
- `failSync()` - отметка синка как FAILED
- `markRunningAsFailedOnStartup()` - очистка RUNNING при старте приложения
- `getKpi()` - расчёт KPI за период

✅ **IntegrationService** - обновлён:
- `syncPrices()` теперь принимает userId и возвращает SyncLog
- Проверка на параллельный запуск (SYNC_ALREADY_RUNNING)
- Проверка статуса подключения (INTEGRATION_DISCONNECTED)
- Запись triggeredBy и triggeredUser

#### Controller
✅ **SyncLogController** - REST API:
- `GET /api/v1/admin/sync-logs` - список с фильтрами
- `GET /api/v1/admin/sync-logs/{id}` - детали запуска
- `GET /api/v1/admin/sync-logs/kpi` - KPI за период

✅ **IntegrationController** - обновлён:
- `POST /api/v1/admin/integrations/{provider}/sync/prices` - запуск синка
- Возвращает 202 Accepted с logId

---

### 3. Фронтенд: SyncLogsPage

**Файл:** `src/pages/SyncLogsPage.tsx`

#### Функциональность

✅ **Карточка провайдера:**
- Статус подключения (точка + текст)
- Время последнего подключения и синка
- Кнопка "Обновить цены" с анимацией спиннера при RUNNING

✅ **KPI-чипы за 7 дней:**
- Запусков N
- Успешность %
- Обновлено строк
- Ошибок

✅ **Тулбар с фильтрами:**
- Тип (PRICES/CATALOG)
- Статус (RUNNING/SUCCESS/FAILED)
- Период (с/по)
- Кнопка "Сбросить"

✅ **Таблица запусков:**
- Колонки: Старт, Длит., Тип, Триггер, Статус, Создано, Обновлено, Ошибки, Действия
- Сортировка по дате (новые сверху)
- Анимация пульсации для RUNNING строк
- Цветовая индикация статусов и ошибок

✅ **Баннер ошибки:**
- Появляется если последний запуск FAILED
- Текст ошибки + кнопка "Повторить"

✅ **Drawer с деталями:**
- Сводка (триггер, длительность, requestCount)
- Таблица items:
  - Продукт (ссылка + код)
  - Дата цены
  - Старая → новая (цветовая индикация: рост - красный, падение - зелёный)
  - Чип действия (UPDATED/CREATED/SKIPPED_MANUAL/SKIPPED_CURRENCY/ERROR)
  - Причина для SKIPPED/ERROR
  - Флаг аномалии ⚑ при |Δ| > 30%
- Блок ошибок (код + сообщение)
- Кнопки "Повторить запуск" и "Открыть цены продуктов"

✅ **Polling для RUNNING:**
- Автоматическое обновление каждые 2 секунды
- Пока есть RUNNING запуск

---

### 4. Интеграция с маршрутизацией

✅ **App.tsx** - добавлен маршрут `/sync-logs`
✅ **Layout.tsx** - добавлена ссылка "Журнал синков" в меню (только для админов)

---

## 📊 Бизнес-правила

### 1. Один RUNNING на провайдера
```java
Optional<SyncLog> runningSync = syncLogRepository.findRunningByProvider(providerCode);
if (runningSync.isPresent()) {
    throw new ConflictException("SYNC_ALREADY_RUNNING");
}
```

### 2. Ошибка одного продукта не убивает запуск
```java
for (IngredientMapping mapping : mappings) {
    try {
        // обработка продукта
    } catch (Exception e) {
        errors++;
        // продолжаем обработку остальных
    }
}
// статус SUCCESS, даже если есть ошибки
```

### 3. Упавший процесс не оставляет вечный RUNNING
```java
@EventListener(ApplicationReadyEvent.class)
public void onStartup() {
    syncLogService.markRunningAsFailedOnStartup();
}
```

### 4. SKIPPED_MANUAL - приоритет ручной цены
```java
if (existingPrice.isPresent()) {
    IngredientPrice price = existingPrice.get();
    if ("MANUAL".equals(price.getSource())) {
        // пропускаем, не перезаписываем
        item.action = "SKIPPED_MANUAL";
        item.reason = "на дату есть ручная цена";
    }
}
```

### 5. Anomaly detection
```java
if (oldPrice != null && newPrice != null) {
    BigDecimal delta = newPrice.subtract(oldPrice).divide(oldPrice, 4, RoundingMode.HALF_UP);
    if (delta.abs().compareTo(new BigDecimal("0.30")) > 0) {
        item.anomaly = true; // |Δ| > 30%
    }
}
```

### 6. Плановый синк только при CONNECTED + autoSync=true
```java
if (!"CONNECTED".equals(integration.getStatus())) {
    throw new ConflictException("INTEGRATION_DISCONNECTED");
}
// Проверка autoSync в settings
```

---

## 🧪 Тестовые сценарии

### SYNC-01: Успешный синк
```
POST /api/v1/admin/integrations/OFF/sync/prices
→ 202 Accepted {logId: 1}
→ GET /api/v1/admin/sync-logs/1
→ status: SUCCESS, createdCount: 3, updatedCount: 12, errorCount: 1
```

### SYNC-02: Параллельный запуск
```
POST /api/v1/admin/integrations/OFF/sync/prices (первый)
→ 202 Accepted

POST /api/v1/admin/integrations/OFF/sync/prices (второй)
→ 409 Conflict SYNC_ALREADY_RUNNING
```

### SYNC-03: Ошибка одного продукта
```
Мок провайдера возвращает 500 на один код
→ run SUCCESS
→ error_count: 1
→ details.errors содержит код + сообщение
→ остальные цены записаны
```

### SYNC-04: MANUAL на ту же дату
```
Существует цена с source=MANUAL на дату 2026-10-20
Синк пытается записать цену на ту же дату
→ item.action: SKIPPED_MANUAL
→ item.reason: "на дату есть ручная цена от 15.10"
→ строка цены не изменена
```

### SYNC-05: Anomaly detection
```
Старая цена: 210.00
Новая цена: 290.00
Δ = (290 - 210) / 210 = 38%
→ item.anomaly: true
→ на экране цен строка попадает в фильтр аномалий
```

### SYNC-06: Рестарт приложения при RUNNING
```
Приложение падает во время RUNNING синка
→ при старте все RUNNING помечаются FAILED
→ reason: "прерван перезапуском приложения"
```

### SYNC-07: Плановый синк
```
autoSync: true, autoSyncTime: "06:00"
→ плановый запуск создаёт строку triggered_by: SCHEDULED
→ в UI отображается "планово" вместо "вручную: admin"
```

### SYNC-08: Комбинация фильтров
```
GET /api/v1/admin/sync-logs?type=PRICES&status=SUCCESS&from=2026-10-14&to=2026-10-21
→ список отфильтрован по всем критериям
```

### SYNC-09: old/new из details
```
GET /api/v1/admin/sync-logs/{id}
→ details.items[0].oldPrice: 210.00
→ details.items[0].newPrice: 179.90
→ соответствует фактическим строкам ingredient_prices до/после
```

### SYNC-10: E2E тесты
```
1. Клик "Обновить цены"
2. Кнопка блокируется, появляется спиннер
3. Таблица обновляется (RUNNING с пульсацией)
4. Через ~2.5 с → SUCCESS
5. KPI-чипы пересчитались
6. Клик "детали" → drawer с old→new и чипами действий
```

---

## 📁 Файлы

### Созданные
✅ `backend/src/main/resources/db/migration/V10__sync_trigger.sql`
✅ `backend/src/main/java/com/provision/dto/sync/SyncLogResponse.java`
✅ `backend/src/main/java/com/provision/dto/sync/SyncKpiResponse.java`
✅ `backend/src/main/java/com/provision/dto/integration/IntegrationSettingsRequest.java`
✅ `backend/src/main/java/com/provision/service/SyncLogService.java`
✅ `backend/src/main/java/com/provision/controller/SyncLogController.java`
✅ `src/pages/SyncLogsPage.tsx`
✅ `SYNC_LOGS_IMPLEMENTATION.md` (этот файл)

### Обновлённые
✅ `backend/src/main/java/com/provision/entity/SyncLog.java` - добавлены triggeredBy, triggeredUser
✅ `backend/src/main/java/com/provision/repository/SyncLogRepository.java` - добавлены методы фильтрации
✅ `backend/src/main/java/com/provision/service/IntegrationService.java` - обновлён syncPrices
✅ `backend/src/main/java/com/provision/controller/IntegrationController.java` - обновлён endpoint
✅ `src/App.tsx` - добавлен маршрут /sync-logs
✅ `src/components/Layout.tsx` - добавлена ссылка "Журнал синков"

---

## 🎨 Дизайн-концепт Midnight Harbor

### Цветовая схема
- Фон: `var(--bg)` (#0B0F17)
- Поверхность: `var(--surface)` (#121826)
- Элевация: `var(--elev)` (#1A2233)
- Границы: `var(--border)` (rgba(255,255,255,0.08))
- Текст: `var(--text)` (#E6EDF7)
- Приглушённый: `var(--muted)` (#8B98AC)
- Успех: `#7EE2B8` (зелёный)
- Ошибка: `#FCA5A5` (красный)
- Предупреждение: `#F8C468` (янтарный)
- Информация: `#9BD8F5` (голубой)

### Компоненты
- Карточка провайдера с статусом
- KPI-чипы с цветовой индикацией
- Таблица с hover-эффектами
- Анимация пульсации для RUNNING
- Drawer с glass-эффектом
- Баннер ошибки с янтарным фоном
- Цветовая индикация old→new (рост/падение)

---

## 🚀 Как использовать

### Просмотр журнала синков

1. **Войти как админ** (admin@provision.app / password123)
2. **Перейти в "Журнал синков"** (новый пункт меню)
3. **Видеть список запусков:**
   - Дата и время
   - Длительность
   - Тип (PRICES/CATALOG)
   - Триггер (вручную/планово)
   - Статус (RUNNING/SUCCESS/FAILED)
   - Статистика (создано/обновлено/ошибки)

### Фильтрация

1. **Выбрать тип:** PRICES или CATALOG
2. **Выбрать статус:** RUNNING, SUCCESS, FAILED
3. **Выбрать период:** с/по
4. **Нажать "Сбросить"** для очистки фильтров

### Просмотр деталей

1. **Кликнуть "детали"** на строке запуска
2. **Открывается drawer:**
   - Сводка (триггер, длительность, requestCount)
   - Таблица items с old→new
   - Цветовая индикация роста/падения
   - Чипы действий (UPDATED/CREATED/SKIPPED/ERROR)
   - Причины для SKIPPED/ERROR
   - Флаг аномалии ⚑ при |Δ| > 30%
   - Блок ошибок

### Запуск синка

1. **Нажать "Обновить цены"** в карточке провайдера
2. **Кнопка блокируется**, появляется спиннер
3. **Таблица обновляется** (RUNNING с пульсацией)
4. **Через ~2.5 с** → SUCCESS
5. **KPI-чипы пересчитываются**

### Повтор失败的 запуска

1. **Видеть баннер ошибки** (если последний запуск FAILED)
2. **Нажать "Повторить"** в баннере или в drawer
3. **Синк запускается снова**

---

## 📈 Статистика

- **Миграции:** 1 файл (~10 строк SQL)
- **Backend:**
  - 3 DTO (~80 строк)
  - 1 Service (~200 строк)
  - 1 Controller (~40 строк)
  - Обновления в Entity (~20 строк)
  - Обновления в Repository (~50 строк)
  - Обновления в IntegrationService (~30 строк)
  - **Итого:** ~420 строк Java
- **Frontend:**
  - 1 компонент (~400 строк)
  - Обновления в App.tsx и Layout.tsx (~10 строк)
  - **Итого:** ~410 строк TypeScript
- **Документация:** ~500 строк Markdown

**Всего:** ~1340 строк нового кода

---

## ✅ Готовность

✅ **Миграция V10 создана**
✅ **Entity обновлены**
✅ **Repository обновлён**
✅ **DTO созданы**
✅ **SyncLogService создан**
✅ **SyncLogController создан**
✅ **IntegrationService обновлён**
✅ **IntegrationController обновлён**
✅ **Фронтенд компонент создан**
✅ **Маршрутизация настроена**
✅ **Проект собирается успешно**
✅ **Документация создана**
✅ **Готово к тестированию**

---

## 🔮 Будущие улучшения

1. **SSE/WebSocket** для live-обновлений вместо polling
2. **UI управления ретенцией** (удаление записей старше N дней)
3. **Параллельные провайдеры** в одном журнале (колонка provider)
4. **Экспорт запуска в CSV**
5. **Графики успешности** по времени
6. **Уведомления** о FAILED синках (email, Telegram)
7. **Автоматический retry** для FAILED синков
8. **Детальная аналитика** по продуктам (какие чаще всего обновляются)

---

**Автор:** AI Assistant  
**Дата:** 2026-03-18  
**Версия:** 1.0  
**Статус:** ✅ ГОТОВО К ТЕСТИРОВАНИЮ
