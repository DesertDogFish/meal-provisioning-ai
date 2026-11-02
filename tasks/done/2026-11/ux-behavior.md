# Задача: Поведенческий долг: офлайн-очередь чеклиста, UX конфликтов, 404-маршрут

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-27. Отметки чеклиста на сервер + офлайн-очередь. Что сделать: перенести «взято» и
- [x] BL-41. `@Version` на изменяемых агрегатах + UX конфликта на фронте (L). Что сделать:
- [x] BL-66. Поведение 404 для неизвестных маршрутов (S). Что сделать: catch-all

## Карточки (текст перенесён дословно)

- **BL-27. Отметки чеклиста на сервер + офлайн-очередь.** Что сделать: перенести «взято» и
  фактическое количество из `src/utils/tripStaging.ts` (localStorage) на сервер — миграция и
  эндпоинт в `backend/`, клиент в `src/api/`, `src/utils/checklist.ts`,
  `src/components/ChecklistTab.tsx`; плюс очередь локальных правок и синхронизация при
  появлении сети (сценарий «в магазине нет связи»). Критерий приёмки: отметка, поставленная
  на одном устройстве, видна на другом после синхронизации; офлайн-правки не теряются и
  применяются при появлении сети; mock-паритет форм ответа соблюдён (`AGENTS.md` §14,
  `CONTRACT_TARGET=mock npm run test:contract`).
  Источник: `tasks/done/2026-10/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: DONE

- **BL-41. `@Version` на изменяемых агрегатах + UX конфликта на фронте** (L). Что сделать:
  `@Version` на `Trip`, сущностях правок состава и `trip_price_overrides` (+ миграция
  `ADD COLUMN version bigint NOT NULL DEFAULT 0`, только новый номер — §8); обработчик
  `OptimisticLockingFailureException` → 409 уже есть (AU-14, 30.10.2026); на фронте — диалог
  «данные изменились, обновите» с повторной загрузкой; mock-паритет (R3); тест по R1 на
  конкурентный batch-PUT. Критерий приёмки: вторая конкурентная запись получает 409, а не молча
  перезаписывает; UI показывает внятный диалог; миграция применена на существующей БД
  (гейт — job `migration-upgrade`). Источник: внешний аудит 30.10.2026, AU-13 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: DONE

- **BL-66. Поведение 404 для неизвестных маршрутов** (S). Что сделать: catch-all
  `path="*"` в `src/App.tsx` (строка ~98) ведёт всех на `/login`; аутентифицированный
  пользователь с опечаткой в URL молча перебрасывается через LoginPage на `/trips` — никакой
  обратной связи. Реализовать: для неаутентифицированных — прежний редирект на `/login`
  (с сохранением `navigate` после входа), для аутентифицированных — `NotFoundPage`
  («Страница не найдена» + CTA «К списку походов») либо редирект на `/trips` + тост;
  вариант и копи — решение владельца (дизайн-пак: EmptyState-паттерн). Файлы: `src/App.tsx`,
  новый `src/pages/NotFoundPage.tsx` + тест (и `coverage.include` по R5), e2e
  `navigation.spec.ts` (сценарий «опечатка в URL»). Критерий приёмки: `/ololo` в сессии
  показывает явный 404-фидбек; вне сессии — логин с возвратом; vitest/tsc/e2e(mock) зелёные.
  Источник: аудит 02.11.2026 (usability).
  Статус: DONE

## Заметки

- **Стартовое состояние (важно для оценки объёма):** часть карточек была закрыта раньше этой
  сессии. «Взято» уже жило на сервере (`trip_checklist_bought`, миграции V32/V33, KB-15) вместе
  с dirty-флагом, очередью PUT и mock-роутом; `@Version` уже стоял на 8 сущностях похода
  (V34/V35), а обработчик `OptimisticLockingFailureException` → 409 существовал (AU-14). Поэтому
  фактическая работа свелась к остаткам: (BL-27) фактическое количество на сервер + досылка
  очереди по событию `online`; (BL-41) оптимистичная блокировка агрегата при batch-PUT состава +
  фронтовый диалог + mock-инъекция 409 + R1-тест; (BL-66) с нуля.
- **BL-27, факт количества:** сервер хранит пару `{ingredientId → amount, unit}` без штампа
  потребности (факт переживает пересчёт людей/состава — Fix-8 п.6). Набор — идемпотентная полная
  замена (`PUT .../checklist-actual-qty`), уникальность `(trip_id, ingredient_id)`.
- **BL-27, семантика синхронизации факта отличается от «взято»:** у факта нет «надгробий»
  удалений (снятый факт неотличим от «никогда не введённого»), поэтому union, как в KB-15, здесь
  воскрешал бы стёртые значения. Принято: dirty → локальная карта авторитетна и досылается
  целиком; чистый кэш → серверная карта заменяет локальную. Зафиксировано в `ARCHITECTURE.md`
  (§Эндпоинты похода, «Фактическое количество чеклиста»).
- **BL-41, почему понадобился `OPTIMISTIC_FORCE_INCREMENT`:** правки состава живут в
  `trip_ingredient_substitutions`, а диф-коммит удаляет/вставляет строки — то есть не меняет ни
  одной версионированной строки. Без форс-инкремента два параллельных batch-PUT молча
  перезаписывали друг друга (`@Version` был, а конфликт не возникал). Лок на строке приёма
  делает агрегат изменяемым — вторая запись получает `OptimisticLockingFailureException` → 409.
- **BL-41, mock-паритет:** настоящую гонку in-memory мок воспроизвести не может (клиент не
  передаёт версию агрегата). Для контракт-/e2e-сценариев конфликт ВНЕДРЯЕТСЯ явно —
  `armConcurrentConflict(tripId)` из тестов или `localStorage['mock-concurrent-conflict'] = tripId`
  вручную; следующая не-GET мутация этого похода отдаёт 409 в форме бэкенда, инъекция снимается.
- **BL-66:** выбран вариант «явная страница 404», а не «редирект + тост» (в карточке решение
  оставлено владельцу — подтвердить). Реализация без новой логики авторизации: catch-all =
  `ProtectedRoute → Layout → NotFoundPage`, поэтому вне сессии поведение прежнее (логин),
  а в сессии пользователь видит адрес, по которому промахнулся.

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

**Сделано**

1. **BL-27 (остаток).** Миграция `V37__trip_checklist_actual_qty.sql` (таблица факта количества
   с `version`, каскадами и уникальностью пары); сущность `TripChecklistActualQty`, репозиторий,
   DTO `ChecklistActualQtyDtos`, сервис `TripChecklistActualQtyService`, контроллер
   `ChecklistActualQtyController` (`GET|PUT /api/v1/trips/{id}/checklist-actual-qty`); mock-роут
   в `mockTrips.ts` + хранилище в `mockState.ts`; клиент `src/api/checklistActual.ts`
   (GET = null при недоступности; неотправляемые пары отсеиваются; PUT не делается, если
   отправлять нечего — иначе полная замена стёрла бы серверные факты); `tripStaging`: dirty-флаг
   `trip-checklist-actualqty-dirty-*`, последовательная очередь PUT, `refreshActualQtyFromServer`,
   `flushPendingStageWrites` + слушатель события `online`; `useTripDetail` гидратирует факт при
   открытии похода и в повторной загрузке после конфликта. «Взято» уже было серверным (V32/V33) —
   добавлена только досылка по `online`.
2. **BL-41 (остаток).** `OPTIMISTIC_FORCE_INCREMENT` на строке приёма в `MealCompositionService`
   (дефект «batch-PUT не меняет версионированную строку»); фронтовый сигнал
   `src/api/conflictSignal.ts` (409 `CONCURRENT_MODIFICATION` из real- и mock-режима), диалог
   `src/components/ConflictDialog.tsx` («Данные изменились» → «Обновить» перечитывает поход,
   чеклист и факт количества), инъекция конфликта в моке для контракт-/e2e-сценариев.
3. **BL-66.** `src/pages/NotFoundPage.tsx` («Страница не найдена» + CTA «К списку походов»),
   catch-all в `src/App.tsx` через `ProtectedRoute → Layout → NotFoundPage`; `coverage.include`;
   e2e-сценарий N-7 в `e2e/navigation.spec.ts` (написан, но не прогнан — см. «не проверено»).
4. **Тесты, написанные в этой сессии:** `OptimisticLockIntegrationTest` (2),
   `ChecklistActualQtyIntegrationTest` (11), `src/api/conflictSignal.test.ts` (8),
   `src/components/ConflictDialog.test.tsx` (4), `src/api/checklistActual.test.ts` (11),
   `src/api/checklistActual.mockParity.test.ts` (12),
   `src/utils/tripStaging.actualQty.server.test.ts` (12), `src/pages/NotFoundPage.test.tsx` (3).
5. **Документация (R11, те же правки):** `ARCHITECTURE.md` (§Эндпоинты похода — новый эндпоинт,
   §Database — таблица и обновлённый список `@Version` + форс-инкремент, §Правки состава —
   конкурентность, §Клиентские контракты — источник факта), `backend/README.md` (§API, §Миграции —
   V37), `README.md` (офлайн-синхронизация, диалог одновременных правок, маршрут 404).

**Проверено (реальные прогоны)**

- backend: `OptimisticLockIntegrationTest` 2/2; `ChecklistActualQtyIntegrationTest` 11/11;
  `SnapshotIsolationIntegrationTest` 3/3 + `FlywayUpgradeIntegrationTest` 4/4 (после новой
  миграции) — везде «Tests run: N, Failures: 0, Errors: 0», `BUILD SUCCESS`.
- frontend: `vitest run` — 112 файлов, **985/985**; `CONTRACT_TARGET=mock vitest run contract` —
  7 файлов, **69/69**; `npm run lint` — 0 ошибок (1 warning, существовавший до правок:
  `EmisLinkPicker.tsx:103 react-hooks/exhaustive-deps`); `npm run typecheck:all` — чисто;
  `npm run build` — успешно.
- покрытие (R5, `vitest run --coverage`): `src/api/checklistActual.ts` 100 % lines,
  `src/api/conflictSignal.ts` 100 %, `src/components/ConflictDialog.tsx` 100 %,
  `src/pages/NotFoundPage.tsx` 100 % — гейт lines ≥ 80 % per-file пройден.

**НЕ проверено**

- **e2e (`npx playwright test e2e/navigation.spec.ts -g "N-7"`) — не запускался:** браузеры
  Playwright не установлены (нет `chromium_headless_shell` в `%LOCALAPPDATA%\ms-playwright`),
  а `npx playwright install chromium` не скачался (сеть). Сценарий N-7 добавлен в спеку и
  требует прогона в CI (`e2e-nightly.yml`).
- **CI не проверен:** запуска GitHub Actions из этой сессии не было, ссылки на run нет.
- Полный `mvn test` не гонялся: по правилам песочницы запускались только затронутые классы и
  соседи по миграциям; тяжёлые сьюты (`UserPricesIntegrationTest`, `EconomicConsistencyTest`,
  `DockerStackSmokeTest`) не запускались.

**Решения, требующие подтверждения владельца**

- BL-66: выбран явный 404 (`NotFoundPage`), а не редирект на `/trips` с тостом; копи страницы
  («Страница не найдена», «Такого адреса нет — возможно, в ссылке опечатка или страница
  переехала») — на утверждение.
- BL-27: семантика «dirty → локальная карта авторитетна целиком» (вместо union, как у «взято»)
  и удаление неотправляемых пар из кэша. Если нужна честная сходимость с другого устройства
  во время офлайн-правок — потребуются «надгробия» удалений (отдельная задача).
- BL-41: `OPTIMISTIC_FORCE_INCREMENT` поднимает `version` приёма на КАЖДОМ сохранении состава —
  это ожидаемое поведение агрегата, но оно видно в БД и должно устраивать будущие интеграции.
