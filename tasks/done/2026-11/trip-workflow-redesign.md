# Задача: Редизайн воркфлоу похода — «Утвердить меню», этап «Проверка», пятый экран «Поход готов»

Status: DONE            # READY → IN_PROGRESS → DONE / CANCELLED
Created: 2026-11-03
Closed: 2026-11-04
Источник: список багов владельца 03.11.2026 — раздел «Походы» пп.4, 11, 12, 13,
25, 26, 27. Это НЕ пачка багов: утверждение меню требует бэкенд-поля и
эндпоинта, пятый экран меняет модель этапов — по AGENTS.md «фикс-тикет не
меняет архитектуру», поэтому отдельная большая задача (≥ 5 файлов, backend +
frontend). Код писать только после подтверждения владельцем (сессия 1 =
планирование).

## Цель
Воркфлоу похода становится пятиэтапным и честным: ① Меню завершается явным
«Утвердить меню»; ② Закупка переименована в «Проверка»; ③ Магазин; ④ Чеки;
⑤ «Поход готов» — финальный экран в общем ряду (отчёт + «кто сколько должен» +
печать/шер), а не отдельная страница с кнопкой «назад». Прогресс-бар считается
по 5 сегментам, этап ① заполняется от числа блюд (максимум 1/5 длины при 10
блюдах). Десктопный дубль переключателя этапов (.seg) и kebab шапки удалены.

## Подзадачи

- [x] 1. Переименовать этап «Закупка» → «Проверка» во всём UI (можно отгрузить
  независимо от остальных пунктов). Файлы: `src/components/StageTabBar.tsx`
  (STAGES label; id/URL `shopping` НЕ менять — только подпись),
  `src/pages/TripDetailPage.tsx` (stageTabs ~строки 88–93),
  `src/components/StageNextCta.tsx` (NEXT_LABEL/HINT), `src/components/TripSummaryPanel.tsx`
  (чип «Закупка: N позиций»), `src/pages/TripsPage.tsx` (подпись этапа карточки
  — через STAGES, проверится само), тесты/e2e с текстом «Закупка» (grep;
  `StageTabBar.test.tsx`, `StageNextCta.test.tsx`, `TripDetailComponents.test.tsx`,
  `e2e/*.spec.ts`). Заголовки внутри вкладки («Предварительная закупка…») —
  из `tasks/bugs-trip-shopping-stage.md`, не конфликтуют.
  Приёмка: RED — тест «этап ② подписан 'Проверка'» падает; GREEN — после
  переименования; grep «Закупка» остаётся только в заголовках вкладок ② и доках.

- [x] 2. Backend: утверждение меню. Миграция `V38__trip_menu_approval.sql`
  (колонка `menu_approved_at TIMESTAMPTZ NULL` в `trips`; БЕЗ backfill —
  РЕШЕНО владельцем 03.11.2026: продукт в бете, реальных походов нет, старые
  строки остаются неутверждёнными), `Trip` entity (+@Version уже есть),
  `TripResponse` (+menuApproved), эндпоинт
  `POST /api/v1/trips/{id}/menu-approval` (toggle: утвердить/снять, owner-only,
  оптимистичная блокировка как у прочих мутаций похода), сервис + контроллер.
  Файлы: `backend/src/main/resources/db/migration/V38__*.sql`,
  `backend/src/main/java/com/provision/entity/Trip.java`, `dto/trip/*`,
  `service/TripService.java` (или отдельный метод), `controller/TripController.java`.
  Приёмка: RED→GREEN per-class тесты (`skills/testing.md`): unit сервиса
  (toggle, чужой поход → 403/404) + MockMvc-контракт (200/409 version);
  `SnapshotIsolationIntegrationTest`, `FlywayUpgradeIntegrationTest` + чистка
  тестовых БД; `UserPricesIntegrationTest`/`EconomicConsistencyTest`/
  `DockerStackSmokeTest` в песочнице не запускать (лимит памяти).

- [x] 3. Mock-паритет и контракт (R3, в той же задаче что п.2) + обновление
  ТЕСТОВЫХ походов (напоминание владельца 03.11.2026):
  `src/api/mockServer.ts` (+`mockTrips.ts`/`mockState.ts`) — поле menuApproved
  и POST menu-approval; сид-походы в `src/data/mockData.ts` (`mockTrips`,
  ~строка 714: 'trip1' «Поход на Карельский перешеек» и остальные) — проставить
  `menuApproved` осмысленно (демо-поход с закупкой/чеками — утверждён, чтобы
  воркфлоу в mock-режиме выглядел естественно; один демо-поход оставить
  неутверждённым для проверки этапа ①); contract-тест mock↔real;
  `ARCHITECTURE.md` — контракт TripResponse/progress и описание этапа ⑤
  (R11: доки в той же сессии). Файлы: `src/api/mockServer.ts`,
  `src/api/mockTrips.ts`, `src/api/mockState.ts`, `src/data/mockData.ts`,
  `src/api/contract*.test.ts` (новый кейс), `ARCHITECTURE.md`.
  Приёмка: `npm run test:contract` зелёный; RED — contract-кейс
  «menu-approval паритет» падает до мока; демо-походы в mock-режиме показывают
  новый прогресс корректно.

- [x] 4. Frontend: «Утвердить меню» + новая модель прогресса (пп.4 и 11 списка
  владельца). Кнопка «Утвердить меню» на этапе ① (заметная, в конце списка
  дней рядом со StageNextCta); CTA этапа ① до утверждения — «Утвердить меню»
  (вместо нынешнего «К закупке ②»), после — «К проверке ②». `done.menu` =
  menuApproved (не «есть ≥1 приём»). Прогресс: 5 равных сегментов; сегмент ①
  заполняется `min(meals,10)/10` (1 блюдо = 1/50 длины, 10+ блюд = 1/5);
  сегменты ②–④ — по готовности этапа (② позиции есть/нет, ③ bought/total,
  ④ facts/total); ⑤ — готов. ОДИН источник: `src/utils/readiness.ts`
  (+новая функция прогресс-сегментов), потребители: `src/pages/TripsPage.tsx`
  (`buildProgressMap` — согласовать с `tasks/bugs-trip-list.md` п.3),
  `src/components/TripSummaryPanel.tsx` (чипы/мини-степпер),
  `src/components/StageTabBar.tsx` (бейджи), `src/components/StageNextCta.tsx`,
  `src/pages/TripDetailPage.tsx` (`done`), `src/pages/useTripDetail.tsx`
  (menuApproved в state, мутация toggle).
  Приёмка: RED — юнит `readiness` («меню не утверждено → не done, даже если
  блюда есть»; «10 блюд → сегмент ① = 20%») и `TripsPage.progress.test.tsx`,
  `StageNextCta.test.tsx` (CTA ① = «Утвердить меню») — падают; GREEN — после
  реализации; component-тест кнопки утверждения (мутация → чип ① зелёный).
  НЕ ЗАБЫТЬ (владелец 03.11.2026): обновить тестовые походы-фикстуры во всех
  затронутых тестах (`TripsPage.progress.test.tsx`, `StageNextCta.test.tsx`,
  `TripDetailComponents.test.tsx`, `MobileWorkflowComponents.test.tsx`,
  `TripPrintPage/TripsPage.boughtHydration.test.tsx` — grep по фикстурам trip)
  — поле `menuApproved` и новые подписи этапов.

- [x] 5. Этап ⑤ «Поход готов» — пятый экран в ряду (п.25 списка владельца).
  STAGES += `{ id: 'ready', num: 5, label: 'Поход готов' }`; `.stage-bar`
  grid 4→5 колонок; `parseStage('ready')`; TripDetailPage рендерит контент
  отчёта на `?stage=ready`: вынести тело `src/pages/TripReportPage.tsx` в
  общий компонент (`src/components/TripReportView.tsx` — R8 без дублей), в нём
  уже есть «Кто сколько должен · при равном делении» (WhoOwesBlock) + меню по
  дням + итоги + «Поделиться»/«PDF»; роут `/trips/:id/report` сохранить как
  редирект на `/trips/:id?stage=ready` (шаринг-ссылки не ломаются). Файлы:
  `src/components/StageTabBar.tsx`, `src/pages/TripDetailPage.tsx`,
  `src/pages/TripReportPage.tsx`, `src/components/TripReportView.tsx` (новый),
  `src/index.css` (grid), роутер `src/App.tsx`/`main.tsx` (редирект),
  `types/tripDetail.ts` (TabType).
  Приёмка: RED — тесты: «stage-bar содержит 5 этапов», «?stage=ready рендерит
  отчёт с WhoOwesBlock», «/report редиректит» — падают; GREEN — после
  реализации; мобильный бар на 360px: 5 колонок читаемы (иконка+подпись+бейдж —
  см. п.7 про лейблы).
  Оформление экрана (утверждено владельцем 03.11.2026): фон
  `src/assets/atmosphere/camp-ready.webp` под вуалью (linear-gradient bg-0
  .66 → .88, blur 3px), сегмент «Готово» активен — см. подзадачу 6
  `tasks/design-atmosphere-art.md` и мокап в `design-lab/index.html`.

- [x] 6. Убрать дубли навигации: десктопный `.seg` (п.13) и kebab шапки (п.26).
  Файлы: `src/pages/TripDetailPage.tsx` (~строки 128–152 — блок
  `desktop-stage-seg` удалить; переключатель этапов на десктопе — кликабельные
  чипы TripSummaryPanel, они уже умеют onStage), `src/components/TripActions.tsx`
  (kebab «Отчёт по походу»/«Печать / PDF» удалить — оба действия живут на
  этапе ⑤), `src/index.css` (`.seg-desktop-only` — проверить сиротство),
  `e2e/mobile.spec.ts` + тесты с `desktop-stage-seg`/`desktop-tab-*`/
  `trip-kebab`/`kebab-report`/`kebab-print` (grep, обновить).
  Приёмка: RED — тест «на десктопе нет seg-переключателя, этапы переключаются
  чипами» падает; GREEN — после удаления; kebab отсутствует, печать доступна
  на ⑤.

- [x] 7. Мобильный drawer сводки (п.27): огромную кнопку «Отчёт по походу»
  заменить яркой рыжей иконкой (FileDown, `--amber-500`, iconOnly с aria-label);
  починить лейблы воркфлоу-чипов в sheet'е («вкривь и вкось»): единая высота/
  выравнивание чипов и шевронов, перенос цепочки целиком по сегментам
  (keep-pair), подписи под новые названия этапов (① Меню → ② Проверка →
  ③ Магазин → ④ Чеки → ⑤ Готов). Файлы: `src/components/TripSummaryPanel.tsx`
  (~строки 186–200 кнопка отчёта в BottomSheet; `readinessChips` ~строки
  70–125), `src/index.css` (readiness-chain/чипы).
  Приёмка: RED — тест «в sheet отчёт — иконочная кнопка (amber)» падает;
  GREEN — после правки; визуальная проверка 360×640 и 390×844 (e2e в CI).

## Заметки
- 03.11.2026 п.5: STAGES += ⑤ ready «Поход готов» (Flag), parseStage('ready'), grid 5 колонок;
  контент отчёта вынесен в src/components/TripReportView.tsx (R8), TripReportPage удалена,
  роут /trips/:id/report = ReportRedirect → ?stage=ready; экран ⑤ — арт camp-ready.webp под
  вуалью .66→.88 + blur 3px (.stage-ready, утверждено владельцем); earliestOpenStage → 'ready'.
  Защищено: StageTabBar.test (п.5, 2 кейса), ReportRedirect.test (1), TripDetailPage.readyStage.test (2).
- 03.11.2026 п.6: десктопный .seg-дубль и kebab шапки (TripActions) удалены целиком; сиротское
  CSS-правило .seg.seg-desktop-only удалено; этапы на десктопе — чипы сводки, отчёт/печать — на ⑤.
  e2e/mobile.spec M-11 обновлён (seg toHaveCount(0)). Защищено: readyStage.test (п.6, 2 кейса),
  headerGlass.test обновлён.
- 03.11.2026 п.7: sheet-кнопка отчёта = иконочная amber (icon-action, aria-label «Отчёт по походу»);
  чипы цепи: ④ «Чеки: …», ⑤ «Готов/Не готов», пары «шеврон+чип» = keep-pair, единая min-h 32px;
  onOpenReport сводки ведёт на этап ⑤ (не /report). Защищено: TripDetailComponents.test (п.7, 2 кейса).
- 03.11.2026 п.4: readiness: done.menu=menuApproved (partial без утверждения), workflowProgress()
  = 5 равных сегментов (① min(meals,10)/10 … ⑤ ready); полоса карточки TripsPage = fill;
  StageNextCta ① до утверждения = кнопка «Утвердить меню» (мутация approveMenu в useTripDetail,
  POST menu-approval + showSuccess); чип ① «Меню: не утверждено» для partial.
  Фикстуры тестов обновлены menuApproved (по напоминанию владельца). Защищено: readiness.test
  (redesign п.4, 4 кейса), StageNextCta.test (redesign п.4, 2 кейса), TripsPage.progress 8/8.
  Прогоны: components 403/403, pages+api+utils 652/652 (после фикстур), contract 72/72, build ok.
  Гейты HEAD были красные ДО меня: TripPersonTab.tsx (мёртвый код после bugs-trip-shopping-stage п.5,
  personSummary удалён из view) и неиспользуемый Plus в MealCompositionModal — удалил/почистил,
  чтобы lint/typecheck:all прошли; теперь lint 0 errors, typecheck:all чисто.
- 03.11.2026 п.3: TripResponse.menuApproved в mock (роут POST /trips/:id/menu-approval,
  owner-only 404), сиды: trip1 утверждён, trip2 нет; новые походы menuApproved=false;
  типы types/index.ts + types/tripDetail.ts; ARCHITECTURE.md — эндпоинт + поле.
  Защищено: contractMenuApproval.test.ts 3/3 (npm run test:contract-файл).
- 03.11.2026 п.2: V38__trip_menu_approval.sql (menu_approved_at TIMESTAMPTZ NULL, без backfill),
  Trip.menuApprovedAt, TripResponse.menuApproved (Boolean), TripService.toggleMenuApproval
  (owner-only через findByIdWithDaysAndMeals, 404 чужой), POST /api/v1/trips/{id}/menu-approval.
  Защищено: TripMenuApprovalTest 2/2 (unit), TripMenuApprovalIntegrationTest 3/3 (MA-01 toggle,
  MA-02 404 чужой, MA-03 stale-tx конфликт @Version); гейты миграций: SnapshotIsolation 3/3,
  FlywayUpgrade 4/4 (+ чистка provision% БД перед прогоном). 409-маппинг — общий GlobalExceptionHandler.
- 03.11.2026 п.1: STAGES/stageTabs/CTA/чипы ② = «Проверка» (id/URL `shopping` не тронуты);
  заголовки вкладок ② («Предварительная закупка…») и доменные слова оставлены по приёмке.
  Защищено: StageTabBar.test «redesign п.1», StageNextCta.test «К проверке ②»,
  TripDetailComponents (чип «Проверка: N»), TripsPage.progress (карточка «Проверка»).
  Прогоны: RED 4 кейса → GREEN 50/50 (4 файла), соседи 65/65 (8 файлов).

- Порядок отгрузки: п.1 (переименование) независим и может уйти первым;
  пп.2–4 — одним релизом (контракт + mock + UI); пп.5–7 — после них (этап ⑤
  опирается на новые подписи и readiness).
- Формула прогресса (п.4) — на подтверждение владельцем: 5 равных сегментов;
  ① = min(meals,10)/10 сегмента («1/5 общей длины при 10 блюдах, 1/5/10 при
  одном» — цитата); ② бинарный (позиции есть/нет); ③ = bought/total;
  ④ = facts/total; ⑤ = 100% при ready. Карточка списка походов и полоса на
  странице похода — из одного `utils/readiness`.
- Backfill V38 — РЕШЕНО владельцем 03.11.2026: для старых походов ничего не
  заполнять (бета, реальных походов нет); `menu_approved_at = NULL` у всех
  существующих строк. Тестовые/демо-походы обновить: сид `mockTrips` в
  `src/data/mockData.ts` (п.3) и фикстуры фронтенд-тестов (п.4).
- Снятие утверждения: разрешить всегда (toggle) или блокировать после ввода
  чеков — владелец 03.11.2026 явно не решил; по умолчанию в плане — toggle без
  блокировки, при реализации подтвердить.
- `progress` в GET /trips описан в `ARCHITECTURE.md` (TripProgressResponse,
  `TripProgressService`) — при изменении семантики правки доков в той же
  сессии (R11, `skills/docs-sync.md`); поле `menuApproved` добавить в контракт
  списка и детали.
- Кросс-ссылки: `tasks/bugs-trip-list.md` пп.2–3 (kebab «Отчёт», прогресс —
  делать ПОСЛЕ или ВМЕСТЕ с пп.4–5 этой задачи, чтобы не переделывать),
  `tasks/bugs-trip-checks-stage.md` п.1 (WhoOwesBlock убран из ④ — на ⑤ он
  приходит из TripReportView), `tasks/bugs-trip-shopping-stage.md` п.7 (кнопка
  «Посмотреть отчёт» — возможно, исчезнет вместе с этим редизайном).
- E2E в песочнице не стартует — приёмка мобильных пунктов через компонентные
  тесты + прогон `mobile.spec.ts` в CI (честно писать «CI не проверено», если
  не запускался — R6).

## Результаты (заполнить при закрытии)
