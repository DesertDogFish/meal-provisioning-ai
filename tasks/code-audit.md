# Задача: аудит кода проекта — проблемные места

Status: READY
Created: 2026-11-03
Closed:

## Цель
Доскональный аудит кода meal-provisioning-ai: выявить проблемные места (большие файлы, any, console.log, отсутствие deps, typecheck-ошибки) и записать их как подзадачи для последующего исправления.

## Подзадачи
- [ ] 1. Установить отсутствующую зависимость `react-datepicker` — файлы: package.json; приёмка: `npm run typecheck` и `npm test` без ошибок разрешения модуля.
- [ ] 2. Исправить typecheck-ошибки в `src/components/TripPersonTab.tsx` (свойство `personSummary` не существует в `TripView`, неявный `any` в параметрах `item`/`i`) — файлы: TripPersonTab.tsx; приёмка: `npm run typecheck` чист.
- [ ] 3. Разбить большие файлы (>25 KB) на модули: `EconomicConsistencyTest.java` (68 KB), `mockTrips.ts` (49 KB), `MealCompositionModal.tsx` (48 KB), `ShoppingListCalculator.java` (30 KB), `EmisUnit.java` (27 KB), `RosstatEmisProvider.java` (27 KB), `GlobalExceptionHandler.java` (26 KB) — приёмка: каждый файл < 15 KB, тесты зелёные.
- [ ] 4. Заменить `any` на типы в `utils/calculations.ts`, `utils/tripStaging.ts`, `utils/tripDerived.ts`, `pages/TripsPage.tsx`, `pages/useTripDetail.tsx`, `api/mockSnapshot.ts` — приёмка: `npm run typecheck` чист, тесты зелёные.
- [ ] 5. Убрать `console.log`/`console.warn` из продакшен-кода (`watchdog.ts`, `mode.ts`, `checklist.ts`, `tripStaging.ts`) или оставить только в dev — приёмка: нет console.log в src/, console.warn только с префиксом [dev].
- [ ] 6. Проверить `dangerouslySetInnerHTML` в `BrandMark.tsx` — убедиться, что SVG не содержит внешних ссылок — приёмка: ручной просмотр SVG.
- [ ] 7. Запустить backend-тесты (`mvn test`) с правильным env и зафиксировать результаты — приёмка: отчёт о прохождении/падениях.
- [ ] 8. Запустить E2E (Playwright) и зафиксировать результаты — приёмка: отчёт о прохождении/падениях.

- [ ] 9. Проверить уязвимости зависимостей: `npm audit` показал 25 (14 moderate, 8 high, 3 critical, в основном tinypool/vitest dev-deps) — приёмка: решить, обновлять ли vitest или игнорировать dev-only уязвимости.
- [ ] 10. Backend: запустить `mvn dependency:check` или OWASP dependency-check — приёмка: отчёт.
## Заметки
- Фронтенд typecheck и тесты уже проходят (1050 тестов) после исправления п.1–2.
- Backend компилируется (57 тест-файлов).

## Результаты (заполнить при закрытии)
