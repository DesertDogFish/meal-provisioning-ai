# Этап 1: Обработка ошибок и общие компоненты

Реализована полная система обработки ошибок по аналогии с Spring Boot бэкендом.

## Реализованные компоненты

### 1. ProblemDetail (RFC 7807)
**Файл:** `src/types/errors.ts`

Единый формат ошибок с полями:
- `type` — URI идентификатор типа проблемы
- `title` — краткое описание
- `status` — HTTP статус код
- `detail` — подробное описание
- `instance` — URI конкретного экземпляра

Дополнительные интерфейсы:
- `ValidationErrorDetail` — для ошибок валидации с массивом `errors`
- `ConflictErrorDetail` — для конфликтов с массивом `usedIn`

### 2. Классы ошибок (ErrorResponse)
**Файл:** `src/utils/errors.ts`

Иерархия классов ошибок:
- `AppError` — базовый класс
- `ValidationError` (400) — ошибки валидации полей
- `UnauthorizedError` (401) — требуется авторизация
- `ForbiddenError` (403) — доступ запрещён
- `NotFoundError` (404) — ресурс не найден
- `ConflictError` (409) — конфликт данных (использование в других ресурсах)
- `InternalError` (500) — внутренняя ошибка сервера
- `InvalidOperationError` (400) — недопустимая операция

Каждый класс имеет метод `toProblemDetail()` для конвертации в RFC 7807 формат.

### 3. Валидация (Jakarta Bean Validation аналог)
**Файл:** `src/utils/validation.ts`

Утилиты валидации:
- `notNull()` — @NotNull
- `notBlank()` — @NotBlank
- `email()` — @Email
- `size()` — @Size
- `positive()` — @Positive
- `min()` / `max()` — @Min / @Max
- `pattern()` — @Pattern
- `futureOrPresent()` — @FutureOrPresent
- `dateAfterOrEqual()` — пользовательская валидация дат
- `oneOf()` — проверка допустимых значений

Функции:
- `validate()` — валидирует и бросает `ValidationError`
- `validateReturnErrors()` — возвращает массив ошибок без исключения

Доменные валидаторы:
- `validateTrip()` — валидация похода
- `validateRegistration()` — валидация регистрации
- `validateIngredient()` — валидация компонента
- `validateRecipe()` — валидация рецепта

### 4. GlobalExceptionHandler
**Файл:** `src/utils/errorHandler.ts`

Централизованный обработчик ошибок (аналог `@ControllerAdvice`):
- `onStatus(status, handler)` — регистрация обработчика для конкретного статуса
- `onAny(handler)` — регистрация глобального обработчика
- `handle(error)` — обработка ошибки и маршрутизация к обработчикам
- `getHistory()` — получение истории ошибок
- Автоматическая конвертация любых ошибок в `ProblemDetail`

Вспомогательные функции:
- `getValidationErrors()` — извлечение ошибок валидации
- `getConflictInfo()` — извлечение информации о конфликте
- `getErrorMessage()` — получение пользовательского сообщения
- `getErrorColor()` — получение цвета для UI

### 5. ErrorBoundary
**Файл:** `src/components/ErrorBoundary.tsx`

React компонент для перехвата ошибок рендеринга:
- Перехватывает ошибки через `componentDidCatch`
- Маршрутизирует через `GlobalExceptionHandler`
- Отображает пользовательский UI с деталями ошибки
- Поддерживает кастомный `fallback`
- Кнопка "Попробовать снова" для сброса состояния

### 6. ProblemDetailAlert
**Файл:** `src/components/ProblemDetailAlert.tsx`

UI компонент для отображения `ProblemDetail`:
- Цветовая индикация по статусу (amber, orange, red, blue, purple)
- Отображение ошибок валидации с полями
- Отображение информации о конфликте (где используется ресурс)
- Раскрывающийся блок с техническими деталями (RFC 7807 JSON)
- Режим `compact` для компактного отображения

### 7. Toast уведомления
**Файл:** `src/components/ToastProvider.tsx`

Система toast-уведомлений:
- `showError(problemDetail | string)` — показать ошибку
- `showSuccess(message)` — показать успех
- `showInfo(message)` — показать информацию
- Автоматическое исчезновение через 5 секунд
- Анимация появления (slide-in)
- Возможность закрытия вручную

## Интеграция

### В App.tsx
```typescript
<ErrorBoundary>
  <AppProvider>
    <ToastProvider>
      <BrowserRouter>
        {/* Routes */}
      </BrowserRouter>
    </ToastProvider>
  </AppProvider>
</ErrorBoundary>
```

### Использование в компонентах
```typescript
import { useToast } from '../components/ToastProvider';
import { ValidationError, ConflictError } from '../utils/errors';
import { validateTrip } from '../utils/validation';

function MyComponent() {
  const { showError, showSuccess } = useToast();
  
  const handleSubmit = (data) => {
    // Валидация
    const errors = validateTrip(data);
    if (errors.length > 0) {
      const error = new ValidationError(errors, 'Не удалось создать поход');
      showError(error.toProblemDetail());
      return;
    }
    
    // Бизнес-логика
    if (isUsedInRecipes(ingredientId)) {
      const error = new ConflictError(
        'Компонент используется в рецептах',
        [{ resourceType: 'recipe', resourceId: 'rec1', resourceName: 'Гречка с тушёнкой' }]
      );
      showError(error.toProblemDetail());
      return;
    }
    
    // Успех
    showSuccess('Поход создан');
  };
}
```

## Демо-страница

**Маршрут:** `/errors-demo`

Демонстрирует:
1. Все типы ошибок с кнопками для вызова
2. Отображение `ProblemDetail` в UI
3. Интерактивную форму с валидацией
4. Документацию по системе

## Примеры ошибок

### Validation Error (400)
```json
{
  "type": "about:blank",
  "title": "Validation Error",
  "status": 400,
  "detail": "One or more fields failed validation",
  "errors": [
    { "field": "email", "message": "must be a valid email address", "rejectedValue": "invalid" },
    { "field": "name", "message": "must not be blank", "rejectedValue": "" }
  ]
}
```

### Conflict Error (409)
```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Ingredient \"Гречка\" is used in recipes and cannot be deleted",
  "usedIn": [
    { "resourceType": "recipe", "resourceId": "rec1", "resourceName": "Гречка с тушёнкой" },
    { "resourceType": "recipe", "resourceId": "rec8", "resourceName": "Гречка с овощами" }
  ]
}
```

### Not Found Error (404)
```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "Trip with id 'trip-123' not found"
}
```

## Соответствие спецификации

✅ GlobalExceptionHandler — централизованный обработчик  
✅ ProblemDetail (RFC 7807) — единый формат ошибок  
✅ DTO ошибок — TypeScript интерфейсы  
✅ Валидация — утилиты аналогичные Jakarta Bean Validation  
✅ ErrorResponse — классы ошибок с кодами  
✅ Обработка 400, 401, 403, 404, 409, 500  
✅ Интеграция с UI через ErrorBoundary и Toast  
✅ Демо-страница для тестирования  

## Следующие этапы

- Этап 2: Реализация бэкенд API (Spring Boot)
- Этап 3: Интеграция фронтенда с реальным API
- Этап 4: JWT аутентификация
- Этап 5: Тесты (Unit + Integration)
