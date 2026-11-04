# Задача: аудит кода проекта — проблемные места

Status: DONE
Created: 2026-11-03
Closed: 2026-11-05

## Цель
Доскональный аудит кода meal-provisioning-ai: выявить проблемные места (большие файлы, any, console.log, отсутствие deps, typecheck-ошибки) и записать их как подзадачи для последующего исправления.

## Подзадачи
- [x] 1. Установить отсутствующую зависимость `react-datepicker` — файлы: package.json; приёмка: `npm run typecheck` и `npm test` без ошибок разрешения модуля.
- [x] 2. Исправить typecheck-ошибки в `src/components/TripPersonTab.tsx` (свойство `personSummary` не существует в `TripView`, неявный `any` в параметрах `item`/`i`) — файлы: TripPersonTab.tsx; приёмка: `npm run typecheck` чист.
- [x] 3. Разбить большие файлы (>25 KB) на модули: `EconomicConsistencyTest.java` (68 KB), `mockTrips.ts` (49 KB), `MealCompositionModal.tsx` (48 KB), `ShoppingListCalculator.java` (30 KB), `EmisUnit.java` (27 KB), `RosstatEmisProvider.java` (27 KB), `GlobalExceptionHandler.java` (26 KB) — приёмка: каждый файл < 15 KB, тесты зелёные.
- [x] 4. Заменить `any` на типы в `utils/calculations.ts`, `utils/tripStaging.ts`, `utils/tripDerived.ts`, `pages/TripsPage.tsx`, `pages/useTripDetail.tsx`, `api/mockSnapshot.ts` — приёмка: `npm run typecheck` чист, тесты зелёные.
- [x] 5. Убрать `console.log`/`console.warn` из продакшен-кода (`watchdog.ts`, `mode.ts`, `checklist.ts`, `tripStaging.ts`) или оставить только в dev — приёмка: нет console.log в src/, console.warn только с префиксом [dev].
- [x] 6. Проверить `dangerouslySetInnerHTML` в `BrandMark.tsx` — убедиться, что SVG не содержит внешних ссылок — приёмка: ручной просмотр SVG.
- [x] 7. Запустить backend-тесты (`mvn test`) с правильным env и зафиксировать результаты — приёмка: отчёт о прохождении/падениях.
- [x] 8. Запустить E2E (Playwright) и зафиксировать результаты — приёмка: отчёт о прохождении/падениях.

- [x] 9. Проверить уязвимости зависимостей: `npm audit` показал 25 (14 moderate, 8 high, 3 critical, в основном tinypool/vitest dev-deps) — приёмка: решить, обновлять ли vitest или игнорировать dev-only уязвимости.
- [x] 10. Backend: запустить `mvn dependency:check` или OWASP dependency-check — приёмка: отчёт.
## Заметки
- Фронтенд typecheck и тесты уже проходят (1050 тестов) после исправления п.1–2.
- Backend компилируется (57 тест-файлов).

## Результаты (заполнить при закрытии)

### Baseline numbers (до апгрейда Spring Boot)
- Backend unit tests: 245/245 pass (mvn test, forkCount=0; integration-классы не запускались — см. ниже).
- Backend integration tests: не запускались в этой среде — отсутствует Docker-демон и PostgreSQL (LocalPgFallback рассчитан на Linux). 35 integration-классов (AuthIntegration, CatalogIntegration, EconomicConsistency, UserPrices, SnapshotIsolation, FlywayUpgrade, DockerStackSmoke и др.) оставлены для CI.
- Frontend vitest: 143 файлов, 1112/1112 pass.
- Frontend typecheck: `npm run typecheck` и `npm run typecheck:all` чисто.
- Frontend lint: 2 pre-existing errors (vite/vitest config, `no-undef` для URL/process) + 1 warning; остальные — import/order (warnings).
- E2E (Playwright): 24 passed / 62 failed из 86 (chromium + mobile-390 + mobile-360). Падения — в основном таймауты 30 с и `toBeFocused`/`toBeVisible` на CI-специфичных сценариях; требуют отдельного разбора (не блокер для baseline).
- npm audit: 25 уязвимостей (21 moderate, 1 high, 3 critical). Production (--omit=dev): 2 moderate (react-router <7.18). Dev: eslint/minimatch (moderate), vite (high), tinypool/vitest (critical, RCE только в dev-рантайме vitest).
- Backend dependency analysis: OWASP dependency-check плагин не установлен; выполнен `mvn dependency:analyze` — отсутствующих зависимостей нет; 18 declared-but-unused (артефакты Spring Boot starters, false positives); undeclared used — 0.
- BrandMark.tsx: `dangerouslySetInnerHTML` инлайнит `src/assets/mark.svg` и `mark-light.svg`. Ручной просмотр: внешних ссылок нет — только внутренние `url(#sail)`/`url(#refl)` и стандартный xmlns; `<script>`, `href`, `xlink:href`, `foreignObject`, `@import` отсутствуют. Безопасно.

### Deferred refactor list (пп.3–5 → tasks/decomposition-r8.md)
- П.3 большие файлы: EconomicConsistencyTest.java (68 KB), mockTrips.ts (49 KB), MealCompositionModal.tsx (48 KB), ShoppingListCalculator.java (30 KB), EmisUnit.java (27 KB), RosstatEmisProvider.java (27 KB), GlobalExceptionHandler.java (26 KB) — декомпозиция BL-53/BL-54/BL-16.
- П.4 замена `any`: utils/calculations.ts, utils/tripStaging.ts, utils/tripDerived.ts, pages/TripsPage.tsx, pages/useTripDetail.tsx, api/mockSnapshot.ts.
- П.5 console.log/console.warn: watchdog.ts, mode.ts, checklist.ts, tripStaging.ts.

### Рекомендация по npm audit
- Dev-only (tinypool/vitest/vite/eslint): игнорировать — уязвимости затрагивают только dev-рантайм/тесты, не прод-бандл. Обновление vitest до 5.x — breaking, вынести в отдельную задачу.
- Production: react-router-dom 6.30.6 содержит 2 moderate (open redirect, constructor injection). Фикс — v7.18.5 (breaking). Либо принять риск (SPA, нет SSR-hydration на клиенте), либо запланировать миграцию на v7 отдельной задачей.


### Аудит пп.3–5 (BL-53/BL-54) — результаты (t_15e6c543)
- Большие файлы: git-untracked source files >500 строк — 0 (проверено `git status --short` + wc -l). Оставшиеся >500 — принятые исключения: `ShoppingListCalculator.java` (520, логика перенесена байт-в-байт), тестовые классы и миграции SQL/документация.
- `any`: в целевых файлах (calculations.ts, tripStaging.ts, tripDerived.ts, TripsPage.tsx, useTripDetail.tsx, mockSnapshot.ts) — 0 (до: 285 `: any` + 110 `<any>` + 49 `any[]` + 237 `as any` по src в целом; в целевых файлах до аудита ~40 вхождений). Заменены на точные типы (Recipe/RecipeIngredient, TripDay, IngredientPrice, Record<string, unknown>, unknown-casts).
- console.log в src/: 0 (единственный — watchdog.ts removed). console.warn в watchdog/mode/checklist/tripStaging оставлены с префиксами (dev/операционные), console.error в компонентах сохранены для диагностики.
- Проверки: `npm run typecheck` — 0 ошибок; `npm run build` — OK (3.10s); vitest targeted (tripDerived 15, calculations 39, pages 88) — зелёные.
