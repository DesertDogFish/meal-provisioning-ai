# Задача: Декомпозиция больших файлов (R8) и ErrorResponseFactory

Status: READY
Created: 2026-11-02
Closed:
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [ ] BL-16. Вынос модалки продукта из `src/pages/ProductsPage.tsx` (615 строк) в отдельный
- [ ] BL-49. Профиль-зависимая санитизация `detail` в ответах об ошибках (M). Что сделать:
- [ ] BL-53. Закрыть неотслеживаемые нарушения R8 (> 500 строк) (L).
- [ ] BL-54. Декомпозировать `GlobalExceptionHandler` и добавить traceId в тело ошибки (M).
- [x] BL-64. Декомпозировать монолит `src/index.css` (2292 строки, R8/R9) (L). Выполнено: src/index.css разрезан на 23 модуля в src/styles/*.css (каждый <15KB, <500 строк), index.css — точка сборки @import (порядок каскада сохранён). Build/vitest/tsc зелёные; визуальная проверка dark/light × desktop/mobile — без регрессий.

## Карточки (текст перенесён дословно)

- **BL-16. Вынос модалки продукта из `src/pages/ProductsPage.tsx`** (615 строк) в отдельный
  компонент (`ProductFormModal.tsx`) по R8; новый компонент — в `coverage.include`.
  Статус: READY

## Мобильный UI и данные похода

- **BL-49. Профиль-зависимая санитизация `detail` в ответах об ошибках** (M). Что сделать:
  инжектить `Environment`/`@Profile`-флаг в `GlobalExceptionHandler` (или вынести в
  `ErrorResponseFactory` — BL-54) и в prod отдавать стабильный код ошибки вместо сообщения для
  «внутренних» исключений (`IllegalArgumentException`, `IllegalStateException`); доменные
  (`ValidationException`, `NotFoundException`, `ConflictException`) оставить как есть — они
  пишутся для пользователя; добавить `traceId` в `extensions` (BL-54); тесты по R1:
  `@SpringBootTest` с профилем `prod` — `detail` без внутренних сообщений, с `dev` — прежнее
  поведение. Критерий приёмки: в prod 500/400 от `IllegalArgumentException` возвращают
  стабильный код без внутреннего текста; README соответствует реализации; тесты на оба профиля. Источник: внешний аудит 30.10.2026, AU-27 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  **Поправка 02.11.2026 (аудит, план `tasks/done/2026-11/2026-11-02-audit-security-usability-ui.md`,
  подзадача 9):** ядро карточки (профиль-зависимая санитизация `detail`, KB-27) уже
  реализовано в `GlobalExceptionHandler` и покрыто `GlobalExceptionHandlerProfileDetailTest`;
  KB-27 закрыт (запись восстановлена в архиве). Остаток карточки — `traceId` в `extensions`
  и вынос в `ErrorResponseFactory` (BL-54). Статус: READY (остаток)

- **BL-53. Закрыть неотслеживаемые нарушения R8 (> 500 строк)** (L).
  Что сделать: повторить приём декомпозиции `TripDetailPage.tsx` (1300 → 240 строк +
  `useTripDetail.tsx` + презентационные компоненты + чистые `utils/tripDerived.ts`) для
  `MealCompositionModal.tsx` (876 строк на 02.11.2026: состояние/логика → хук, разметка →
  подкомпоненты) и `RecipesPage.tsx` (616 строк) + `RecipeEditorModal.tsx` (512 строк) —
  добавлены аудитом 02.11.2026 (ранее не учитывались); `mockTrips.ts` (941) / `mockData.ts`
  (832) — остаток закрытой BL-52 (моки остаются, декомпозиция по доменам); из
  `TripPrintPage.tsx` вынести print-CSS и 36 hex-литералов (BL-48) в отдельный модуль;
  `ShoppingListCalculator.java` (520 строк) внести в реестры как accepted-исключение
  с обоснованием (логика перенесена байт-в-байт ради инвариантов сумм); добавить CI-проверку
  R8: warn при > 500 строк, error при > 800 (с allow-list). Правка текста 02.11.2026 (аудит):
  прежнее «пять нарушений» неточно — `SyncLogsPage.tsx` удалён 01.11.2026 (вычеркнут из скоупа),
  в прежнем тексте дважды повторялся `MealCompositionModal.tsx`; фактический список > 500 строк
  на 02.11.2026: `mockTrips.ts` 941, `MealCompositionModal.tsx` 876, `mockData.ts` 832,
  `ProductsPage.tsx` 636 (BL-16), `RecipesPage.tsx` 616, `ShoppingListCalculator.java` 520
  (accepted-исключение), `GlobalExceptionHandler.java` 542 (BL-54; было 516 на момент аудита,
  +26 строк — 404-обработчик подзадачи 10 плана `tasks/done/2026-11/2026-11-02-audit-security-usability-ui.md`,
  декомпозиция — по-прежнему BL-54), `RecipeEditorModal.tsx` 512.
  Критерий приёмки: файлов > 500 строк
  не больше четырёх (с задокументированными исключениями); новый файл > 500 строк валит CI;
  поведение не изменилось (frontend-тесты и e2e зелёные). Источник: внешний аудит 30.10.2026, AU-19 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-54. Декомпозировать `GlobalExceptionHandler` и добавить traceId в тело ошибки** (M).
  **Частично ГОТОВО (01.11.2026):** методы handleNotFound, handleConflict, handleValidation, handleGeneric уже выделены; build() хелпер существует. Осталось: ErrorResponseFactory/builder, разделение по доменам (Auth/Catalog/Integration/Web), MDC traceId в extensions, traceId в UI. Критерий R8 (<200 строк на класс) не проверялся.
  Что сделать: ввести `ErrorResponseFactory`/builder
  (`ErrorResponse.of(HttpStatus, code).detail(...).fieldErrors(...).usedIn(...).build`) —
  один ответственный модуль вместо 17 копий тела ответа (14 прежних обработчиков + 3 добавленных
  AU-14, которые уже пользуют хелпер `build(...)`); разнести обработчики по доменам
  (`AuthExceptionsHandler`, `CatalogExceptionsHandler`, `IntegrationExceptionsHandler`,
  `WebExceptionsHandler`) по 3–5 на класс; автоматически добавлять `MDC.get("traceId")`
  в `extensions.traceId` во все ответы; отобразить traceId в UI (`problemDetailParser.ts` →
  тост/диалог). Критерий приёмки: ни один класс не превышает 200 строк (R8); `extensions.traceId`
  присутствует во всех ошибочных ответах (проверено contract-тестами mock↔real — R3);
  UI показывает id; `SecurityIntegrationTest`/`ConflictIntegrationTest`/
  `GlobalExceptionHandlerErrorCodeTest` зелёные без правок ожиданий. Источник: внешний аудит 30.10.2026, AU-15 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-64. Декомпозировать монолит `src/index.css` (2292 строки, R8/R9)** (L). Что сделать:
  разрезать по ответственностям: базовый слой (`@layer base`, html/body/типографика) —
  `src/styles/base.css`; компонентные блоки (`.toast*`, `.alert--*` после BL-63,
  `.checklist-*`, `.nf-*`, `.seg`, `.table-cards`, `.chip-delta`, модалки/оверлеи, печать) —
  отдельные css-файлы рядом с компонентами или CSS Modules (прецеденты — `Button.module.css`,
  `DatePicker.css`, `CustomSelect.css`); `index.css` становится точкой сборки импортов.
  Порядок каскада и токены не меняются; визуальных изменений нет. Файлы: `src/index.css`,
  новые `src/styles/*.css` / `*.module.css`, импорты компонентов, `vitest.config.ts`
  (если css-модули затронут тесты). Критерий приёмки: ни одного css-файла > 500 строк;
  скрин-регресс ключевых страниц (список походов, этап ①–④, логин) в тёмной и светлой теме —
  без диффов; vitest/build/tsc зелёные. Источник: аудит 02.11.2026 (замер R8: 2292 строки).
  Статус: READY

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

(заполняется при закрытии)
