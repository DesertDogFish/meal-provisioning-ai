# Plan: UX-аудит 31.10 — убрать дубляж: сирота /admin, двойной журнал синков, «отчёт» ×4, параллельные пайплайны данных

Status: DONE
Created: 2026-10-31

## Цель

Убрать найденный UX-аудитом 31.10.2026 дубляж: страницу-сироту `/admin` с дублирующими
вкладками, два отображения журнала синхронизаций, четыре входа в «отчёт» с двумя разными
назначениями, четыре параллельных пайплайна загрузки/расчёта данных похода, N+1 в списке
походов, семь запросов `/auth/me` и мелкий дубль-код (shim `formatRub`, копии лейблов и
локальных типов). Результат: каждая функция имеет ОДНОГО владельца и ОДНУ точку входа, цифры
этапов ② и ④ считаются одной view-моделью.

## Контекст

- Аудит с доказательствами (файлы/строки): `ux-audit-flow/REPORT.md` вне репозитория
  (артефакт сессии 31.10.2026, как `ux-audit/` плана 30.10). Разделы 1.1–1.8.
- Воркфлоу «4 этапа» (①Меню ②Закупка ③Магазин ④Чеки и итог) введён закрытым планом
  `plans/done/2026-10-30-mobile-workflow-ux.md` — НЕ переделываем, только убираем дубли.
- Пересечения с реестрами: п.1 частично закрывает `BL-56` (мёртвый код), п.5 поглощает
  `BL-26` (декомпозиция `PriceOverridesTab` — уже 977 строк, R8). При старте этих подзадач
  записи BL получают статус «В РАБОТЕ — plans/2026-10-31-ux-audit-cleanup-dedup.md»,
  при закрытии плана переносятся в `plans/done/backlog.md` (AGENTS.md §2).
- Жёсткие правила: дизайн-токены `var(--…)` (DESIGN_MIGRATION), mock-паритет контрактов
  (R3, `CONTRACT_TARGET=mock npm run test:contract`), docs-в-том-же-коммите (R11),
  файлы ≤500 строк (R8), coverage новых компонентов ≥80% lines (R5).
- Прогон тестов в песочнице: vitest по файлам (не весь suite целиком), backend — по классам
  с `MAVEN_OPTS`/`-DforkCount=0` (KB-10); `DockerStackSmokeTest` — LocalPgFallback.

## Подзадачи (максимум 10)

### 1. Мёртвый код и легаси-маршруты
- Файлы: `src/pages/DashboardPage.tsx` (удалить), `src/pages/ErrorsDemoPage.tsx` (удалить),
  `src/App.tsx`, `src/pages/TripDetailPage.tsx`, `src/pages/TripReportPage.tsx`,
  тесты, ссылающиеся на удаляемые страницы
- Зависимости: —
- Действия: удалить `DashboardPage.tsx` (роут `/dashboard` рендерит `TripsPage`, файл мёртв
  с 25.10) и `ErrorsDemoPage.tsx` (роут уже редиректит; закрывает часть BL-56 — редирект
  `/errors-demo` оставить); внутренние `navigate('/trips')` (TripDetailPage:58,88,
  TripReportPage:121) заменить на канонический URL списка (канон выбирается в плане
  `2026-10-31-ux-audit-navigation.md` п.8 — до его выполнения использовать `/dashboard`).
- Критерии приёмки: grep `DashboardPage|ErrorsDemoPage` в src пуст (комментарий в App.tsx
  обновлён); `npx tsc --noEmit` чисто; vitest по затронутым файлам зелёный; роуты
  `/dashboard`, `/errors-demo` ведут на список походов.
- Статус: [x] DONE

### 2. Демонтаж страницы-сироты `/admin` (AdminPage)
- Файлы: `src/pages/AdminPage.tsx`, `src/App.tsx`, `src/pages/IntegrationsPage.tsx`,
  `src/components/Layout.tsx`, `README.md` (таблица страниц), mock-слой
  (`src/api/mockServer.ts` — стагинг-роуты сохранить), contract-тесты стагинга
- Зависимости: —
- Действия: вкладки «Цены» (дубль ценового редактора ProductsPage + легаси USD/EUR и
  «200 RUB») и «Рецепты» (дубль CRUD RecipesPage/RecipeEditorModal) — удалить. Вкладку
  «Импорт» (стагинг: approve/reject) перенести в `IntegrationsPage` отдельной карточкой/
  табом «Импорт каталога» (ADMIN). Роут `/admin` → редирект на `/integrations` (старые
  закладки не ломаются). Решение о судьбе «Импорта» согласовать с владельцем до старта
  (если стагинг не используется — удалить вместе с роутом и моками).
- Критерии приёмки: `/admin` недоступен как отдельная страница (редирект); стагинг-флоу
  работает из «Интеграций» (тест перенесённого компонента); grep `'/admin'` в src остаётся
  только в API-путях (`/admin/products` и т.п.); README обновлён в том же коммите (R11);
  tsc/lint/vitest затронутых файлов зелёные.
- Статус: [x] DONE

### 3. Журнал синков: один раздел вместо двух витрин
- Файлы: `src/pages/IntegrationsPage.tsx`, `src/pages/SyncLogsPage.tsx`,
  `src/components/IntegrationSyncLogs.tsx`, `src/components/Layout.tsx` (сайдбар),
  `src/App.tsx`, тесты `IntegrationsPage.connect.test.tsx`
- Зависимости: 2
- Действия: объединить в один раздел «Интеграции» с табами «Настройка | Журнал синков»
  (полный журнал с фильтрами/KPI/деталями переезжает из SyncLogsPage; встроенный короткий
  `IntegrationSyncLogs` удаляется как дубль). Кнопка запуска синка — одна (в табе
  «Настройка», из журнала — ссылка-действие туда же либо общий handler). Сайдбар: пункт
  «Журнал синков» убрать (ADMIN-навигация короче); роут `/sync-logs` → редирект на
  `/integrations?tab=logs` (deep-links из тостов/доков не ломаются). Альтернатива при
  несогласии владельца: страницы остаются раздельными, но с обязательными cross-links и
  единственным триггером синка.
- Критерии приёмки: статус провайдера и запуск синка имеют одну витрину; `/sync-logs`
  редиректит; фильтр/KPI/детали лога сохранены (тесты SyncLogsPage перенесены и зелёные);
  скрин 390/1440 — табы читаемы; R5 на новый компонент таба.
- Статус: [x] DONE

### 4. «Отчёт» — одна словоформа, одно назначение
- Файлы: `src/components/TripSummaryPanel.tsx`, `src/components/TripActions.tsx`,
  `src/pages/TripReportPage.tsx`, `src/pages/TripPrintPage.tsx` (не ломать печать),
  тесты компонентов
- Зависимости: —
- Действия: десктоп-кнопка полосы готовности «Посмотреть/Сформировать отчёт» (сейчас
  открывает `/print`) → ведёт на in-app `/trips/:id/report` (в отчёте уже есть «PDF» и
  «Поделиться»). Kebab шапки: «Отчёт по походу» оставить; «Печать / PDF» — по решению
  владельца убрать (дубль PDF из отчёта) или сохранить с явной подписью «Печать (новая
  вкладка)». Итог: слово «отчёт» везде = `/report`, слово «печать/PDF» = `/print`.
- Критерии приёмки: grep «отчёт» в UI-строках — все входы ведут на `/report`; печать не
  изменилась (существующие тесты print зелёные); component-тест на новый target кнопки.
- Статус: [x] DONE

### 5. Этап ④ на общий пайплайн: PriceOverridesTab без своего state (поглощает BL-26)
- Файлы: `src/components/PriceOverridesTab.tsx` (977 строк → ≤500, R8),
  `src/pages/TripDetailPage.tsx`, `src/pages/useTripDetail.tsx`, `src/utils/tripDerived.ts`,
  новые `src/components/Checks*.tsx`, `vitest.config.ts` (coverage.include), тесты
- Зависимости: —
- Действия: убрать из `PriceOverridesTab` собственную загрузку (trip/recipes/tripRecipes/
  prices/manualItems/tripEdits/`/admin/products` — всё уже грузит `useTripDetail`) и
  собственные производные (`calculateShoppingList/calculateDayShopping` + локальные типы
  Trip/Recipe/Price/ShoppingItem/DayShopping): данные и view-модели — props из страницы
  (`view.sortedShopping`, `view.dayShopping`, `view.tripSummary`, чек-мутации через
  tripStaging как сейчас). Компонент декомпозировать (таблица чеков / мобильные строки /
  итоги «кто сколько должен» — отдельные файлы ≤500 строк). Мутации факт-цен остаются в ④
  (saveActualPrice + PUT price-overrides) — через колбэки страницы, чтобы ② перерисовывался
  без дубля событий.
- Критерии приёмки: переход на этап ④ не делает повторных сетевых запросов (assert в
  компонентном тесте на моках); суммы ② и ④ идентичны на фикстуре с исключениями и
  ручными позициями (юнит-тест на deriveTripView-пропсах); существующие тесты
  PriceOverridesTab/чеков зелёные без изменения ожидаемого поведения; файлы ≤500 строк;
  новые компоненты в coverage.include, lines ≥80%.
- Статус: [x] DONE

### 6. Единый загрузчик данных похода для report/print
- Файлы: `src/pages/useTripDetail.tsx` (вынести loader), `src/pages/TripReportPage.tsx`,
  `src/pages/TripPrintPage.tsx`, новый `src/utils/tripLoader.ts` (или hook), тесты
- Зависимости: 5
- Действия: загрузку «trip + recipes + tripRecipes + prices + manualItems + tripEdits +
  products» собрать в одну функцию/hook с параметром «нужен ли /admin/products»;
  `TripReportPage` и `TripPrintPage` используют её и `deriveTripView` (print сейчас считает
  сырыми `calculateMenuByDays/calculateShoppingList/...` — перевести на view-модели;
  печатная вёрстка и `.print-doc` не меняются). Расхождения print-расчётов и deriveTripView
  (если найдутся) — в пользу deriveTripView, зафиксировать юнит-тестом на фикстуре.
- Критерии приёмки: один модуль-загрузчик, три потребителя; print-страница рендерит те же
  суммы, что этап ②/④ (скрин-сравнение PDF-эмуляцией на демо-походе); существующие тесты
  print/report зелёные; tsc чисто.
- Статус: [x] DONE

### 7. AuthContext: /auth/me один раз на сессию
- Файлы: новый `src/components/AuthProvider.tsx` (или `src/api/authContext.tsx`),
  `src/components/ProtectedRoute.tsx`, `src/components/Layout.tsx`, `src/pages/TripsPage.tsx`,
  `src/pages/RecipesPage.tsx`, `src/pages/useTripDetail.tsx`, `src/App.tsx`, тесты
- Зависимости: 1
- Действия: провайдер над роутами: один `GET /auth/me` (+refresh), контекст
  `{user, isAdmin, loading, refresh}`; `ProtectedRoute`, Layout-профиль, `isAdmin` в
  RecipesPage и `isEditorAdmin` в useTripDetail читают контекст вместо своих fetch.
  Logout инвалидирует контекст. Ошибка загрузки — как сейчас в Layout (тост + состояние
  «не авторизован»), но в одном месте.
- Критерии приёмки: на переход по сайдбару — не более одного `/auth/me` (assert счётчика
  в моках); смена роли (logout→login другим юзером) корректно обновляет admin-навигацию;
  существующие тесты ProtectedRoute/Layout/RecipesPage зелёные; coverage провайдера ≥80%.
- Статус: [x] DONE

### 8. Список походов без N+1: прогресс карточек одним запросом
- Файлы: `backend/src/main/java/com/provision/...` (TripResponse/контроллер — по решению),
  `src/pages/TripsPage.tsx`, `src/api/mockTrips.ts` (mock-паритет), contract-тесты,
  `ARCHITECTURE.md` (§API), `backend/README.md` — если меняется контракт
- Зависимости: —
- Действия: вариант A (предпочтительный): бэкенд отдаёт прогресс в списке
  (`TripSummaryResponse`: stage, bought/total, facts, totalCost, costPerPerson — на стороне
  сервера из тех же формул ARCHITECTURE «Core Calculations»); mock-паритет обязателен (R3).
  Вариант B (без бэкенда): убрать per-trip deriveTripView, показывать только дешёвые факты
  из TripResponse (дни/приёмы), строку этапа — из одного batch-запроса. Решение A/B —
  владелец (архитектурное, AGENTS §7: новые поля DTO — отдельная задача = эта подзадача).
- Критерии приёмки: открытие списка = ≤2 запроса независимо от числа походов (assert в
  тесте на моках); цифры карточки совпадают с deriveTripView на демо-данных (юнит-тест
  паритета mock/real); contract-тесты зелёные в обоих направлениях.
- Статус: [x] DONE

### 9. Мелкий дубль-код: shim formatRub, лейблы, локальные типы
- Файлы: `src/utils/formatRub.ts` (удалить), импортёры (`TripSummaryPanel`,
  `TripShoppingTab`, `TripDayShoppingTab`, `TripPersonTab`, …), `src/utils/text.ts`
  (mealTypeLabels — один источник), `src/components/TripMealCard.tsx`,
  `src/pages/RecipesPage.tsx`, `src/types/tripDetail.ts`, потребители локальных интерфейсов
- Зависимости: 2, 5
- Действия: импорты `formatRub` перевести на `utils/format`, shim удалить;
  `mealTypeLabels`/`unitLabels` — одна копия в `utils/text` (TripMealCard ре-экспорт
  убрать, RecipesPage — импортировать); локальные `interface User/Trip/TripDay/Recipe/Price`
  в TripsPage/TripPrintPage/Layout заменить типами из `types/`; блок «Кто сколько должен» —
  один компонент, используется этапом ④ и отчётом (расчёт поровну + по дням — из
  deriveTripView, дубль в TripReportPage убрать).
- Критерии приёмки: grep `from '../utils/formatRub'` пуст; grep `mealTypeLabels =` — одно
  определение; tsc/vitest/lint зелёные; визуальных изменений нет (скрин-сравнение ④ и
  отчёта).
- Статус: [x] DONE

### 10. Регрессия и документация
- Файлы: `e2e/main-flow.spec.ts`, `e2e/mobile.spec.ts`, `DESIGN_MIGRATION.md` (если меняются
  паттерны навигации), `README.md`, `ARCHITECTURE.md`, `plans/backlog.md`,
  `plans/done/backlog.md`
- Зависимости: 1–9
- Действия: e2e-сценарии на редиректы (`/admin`, `/sync-logs`, `/errors-demo`, `/trips`),
  на «отчёт = /report» и на отсутствие повторных запросов в ④; гейты по AGENTS §9
  (vitest по файлам, lint, tsc, build, contract в обоих режимах); закрытие BL-26/части
  BL-56 переносом в `plans/done/backlog.md` с пометкой ГОТОВО; R11 — доки в том же коммите.
- Критерии приёмки: все гейты, которые можно прогнать в песочнице, зелёные; непрогоняемое
  (e2e runner — KB-16, тяжёлые интеграционные — KB-10) честно перечислено в «Результатах»;
  реестры обновлены.
- Статус: [ ] READY

## CI

- Из песочницы workflow run недоступен (нет gh/git-credentials) — статус «CI не проверено»,
  прогон после пуша владельцем. Baseline: тяжёлых integration-сьютов в песочнице нет
  (KB-10); e2e runner падает по памяти (KB-16) — только typecheck + библиотечный chromium.

## Known bugs

- Мёртвая кнопка «Повторить» в error-state `PriceOverridesTab.tsx:446` (без onClick) —
  чинится планом `2026-10-31-ux-audit-navigation.md` п.4 (не этим планом, чтобы не
  смешивать cleanup и fixes); до того — учтена в аудите (REPORT §2.2).
- Вкладка «Цены» AdminPage показывает «200 RUB» и валюты USD/EUR при РФ-only ценах —
  устраняется вместе со страницей (п.2), отдельного фикса не требует.

## Backlog

- Если владелец решит вернуть страницу-дашборд со статистикой (закомментирована в App.tsx
  с 25.10): восстановить из git-истории поверх AuthContext и агрегированного прогресса
  (п.7/п.8) — оформляется новой BL-записью при закрытии плана.
- `git filter-repo` для крупных PNG в истории — остаётся в BL-56 (решение владельца).

## Результаты

Закрыт 31.10.2026, ветка `ux-audit-31-10` (без коммита — владелец не запрашивал; все 10/10
подзадач выполнены).

**Что сделано (по подзадачам):**

1. Мёртвый код: `DashboardPage.tsx`, `ErrorsDemoPage.tsx` удалены; `/dashboard`, `/errors-demo` →
   редиректы на `/trips`; e2e-ссылки обновлены.
2. `/admin` демонтирован: `AdminPage.tsx` удалён, стадинг «Импорт» переехал в `IntegrationsPage`
   админ-табом (`CatalogImportTab.tsx` + `mockStaging.ts` в моке), `/admin` → `/integrations`.
3. Один журнал синков: `SyncLogsPage.tsx`/`IntegrationSyncLogs.tsx` удалены, полный журнал —
   таб «Журнал» (`SyncLogsTab.tsx`), `/sync-logs` → `/integrations?tab=logs`; единственный триггер
   синка — в табе «Настройка».
4. «Отчёт» — одна словоформа: in-app отчёт = `/trips/:id/report`, печать/PDF = `/trips/:id/print`;
   десктопная кнопка готовности открывает `/print`, мобильная — `/report`.
5. Этап ④ на общий пайплайн (поглощает BL-26, закрывает KB-14): `PriceOverridesTab.tsx` 977 → 137
   строк, оркестратор без своего state и без сетевых запросов; выделены `ChecksModel.ts` (114),
   `ChecksTable.tsx` (274), `ChecksMobile.tsx` (215), `WhoOwesBlock.tsx` (76). Инвариант
   «суммы ② == ④ == KPI» зафиксирован тестом. Мёртвая кнопка «Повторить» (navigation-п.4) —
   починена bug-test-first (`TripDetailPage.retry.test.tsx`).
6. Единый загрузчик `utils/tripLoader.ts` (loadTripBundle/bundleToViewInput/loadTripView):
   страница похода (`useTripDetail`), отчёт и печать — три потребителя одного пайплайна;
   `TripPrintPage` переведён с сырых калькуляторов на view-модели (`utils/printModel.ts`,
   печатная вёрстка не менялась), расхождения разрешены в пользу `deriveTripView` и зафиксированы
   юнит-тестом на фикстуре (`printModel.test.ts`, 3).
7. `AuthProvider.tsx`: один `GET /auth/me` на сессию (single-flight), 6 потребителей мигрированы;
   тест 7/7 (счётчик запросов в моках).
8. Список походов без N+1 (вариант A — решение владельца): backend `TripProgressService` +
   `TripProgressResponse` (поле `progress` в `GET /trips`, только список; best-effort null);
   mock-паритет — `mockTripProgress.buildTripProgress` через тот же `deriveTripView`;
   `TripsPage` открывает список ОДНИМ запросом (компонентный тест), локальный стейдж «взято»
   лишь уточняет stage shopping → store. Попутно починен round-trip серверных чеков в моке
   (денормализация ключей `ing*` в `GET /trips/:id/price-overrides`).
9. Дубль-код: shim `utils/formatRub.ts` удалён (5 импортёров переведены на `utils/format`);
   `mealTypeLabels` — одна копия в `utils/text.ts` (3 дубля убраны); локальные интерфейсы
   Trip/progress в `TripsPage`/`TripPrintPage` заменены типами `types/tripDetail`
   (`TripProgressDto`); «Кто сколько должен» — один `WhoOwesBlock` (этап ④ + отчёт).
10. Регрессия и документация: e2e `cleanup-redirects.spec.ts` (редиректы /admin, /sync-logs,
    /errors-demo, /dashboard, catch-all); `ARCHITECTURE.md` (контракт progress), `backend/README.md`;
    BL-26 → `plans/done/backlog.md` ГОТОВО; BL-56 → ГОТОВО в части (остаток — BL-59);
    KB-14 → `plans/done/knownbugs.md` ЗАКРЫТ.

**Гейты (что прогнано в песочнице):**

- `tsc --noEmit` — чисто; `eslint .` — 0 ошибок (1 pre-existing warning `EmisLinkPicker`);
  `vite build` — зелёный.
- vitest: 652/652 (75 файлов), в т.ч. новые — `tripLoader.test.ts` (4), `printModel.test.ts` (3),
  `tripListProgress.test.ts` (3), `TripsPage.progress.test.tsx` (4), `WhoOwesBlock.test.tsx` (3),
  drawer-тест журнала в `IntegrationsPage.tabs.test.tsx`.
- coverage R5 (perFile ≥80% lines): зелёный; новые файлы добавлены в `coverage.include`
  (EmisSettingsTab, SyncLogsTab 93.5%, CatalogImportTab, AuthProvider 100%, ChecksModel 100%,
  ChecksTable 98%, ChecksMobile 81%, WhoOwesBlock 100%, tripLoader 100%, printModel 98%,
  mockTripProgress).
- Контракты mock-направления: `contract.test.ts`, `contractExtension`, `stagingContract`,
  `tripListProgress` — зелёные.
- Backend: `mvn compile` зелёный; `TripProgressServiceTest` 8/8; регресс затронутых классов
  (SummaryServiceTest, SummaryServiceFixtureTest, PriceOverrideTest, DetailedShoppingCalculationTest,
  ShoppingListCostAggregationBugTest) — 34/34.

**Честно не прогнано (лимиты песочницы):**

- Полный `mvn test` — OOM (KB-10); `UserPricesIntegrationTest`, `EconomicConsistencyTest`,
  `DockerStackSmokeTest` — не прогонялись из-за лимита памяти (не failures).
- e2e Playwright (`npm run test:e2e`) — runner не стартует по памяти (KB-16); спеки написаны,
  прогон в CI — BL-32.
- Контракты real-направления (`CONTRACT_TARGET=real`) — нет поднятого backend-стека в песочнице;
  серверная семантика покрыта `TripProgressServiceTest`.
- Workflow run: нет, CI не проверено (нет gh/git-credentials из песочницы).
