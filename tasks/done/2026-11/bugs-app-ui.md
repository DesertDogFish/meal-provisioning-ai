# Пачка багов: общеприложенческий UI (логин, интеграции, оболочка)

Status: DONE
Created: 2026-11-03
Closed: 2026-11-03
Источник: список багов владельца 03.11.2026 — разделы «страница логина» (п.1),
«интеграции» (п.1), «все приложение» (пп.1–3). Каждый баг подтверждён осмотром кода.

## Цель
Убрать регрессии и косметические дефекты, которые видны на всех страницах:
центр демо-карточек логина, мигание журнала синков, возвращение кастомного
дейт-пикера, разгрузка мобильной шапки, заметные «рыжие» иконки действий.

## Подзадачи

- [x] 1. BUG: страница логина — в демо-карточках «Админ»/«Пользователь» текст не
  центрован (карточки `rounded-lg p-2` без `text-center`, соседний заголовок
  «Демо-доступ» центрован — выглядит поломанным). Коммит `68d7f1d login fix`
  правил другое (подложка знака), баг остаётся.
  Файлы: `src/pages/LoginPage.tsx` (блок «Демо-доступ», ~строки 236–247).
  Приёмка: RED — в `src/pages/LoginPage.test.tsx` тест «демо-карточки центрованы»
  (у контейнеров карточек класс `text-center`) падает; GREEN — после фикса;
  `npx vitest run src/pages/LoginPage.test.tsx`.

- [x] 2. BUG: Интеграции → «Журнал синков» — таблица мигает при обновлении:
  `loadSyncLogs()` каждый раз делает `setLoading(true)`, а рендер `loading ? <PageLoader/> : <table>` —
  при поллинге RUNNING (каждые 2 с) и при смене фильтров таблица заменяется
  лоаджером и перерисовывается заново.
  Файлы: `src/components/SyncLogsTab.tsx` (`loadSyncLogs`, ~строки 88–113; рендер
  ~строка 254; поллинг ~строки 133–140).
  Как чинить: разделить «первая загрузка» (лоадер) и «обновление» (таблица
  остаётся смонтированной, данные подменяются на месте; опционально — неброский
  индикатор обновления). Поллинг не должен трогать флаг первого лоада.
  Приёмка: RED — новый `SyncLogsTab.test.tsx` (или кейс в
  `IntegrationsPage.tabs.test.tsx`): при втором вызове load таблица НЕ исчезает
  из DOM (нет `PageLoader`); GREEN — после фикса; соседние табы не сломаны.

- [x] 3. BUG: пропал кастомный дейт-пикер в стиле приложения — везде снова
  нативный `<input type="date">`. РЕГРЕССИЯ: до коммита `ebb3a1b` (01.11.2026,
  «ux plan fix») `DatePicker.tsx` был на `react-datepicker` с брендовым попапером
  `.dark-calendar` (контракт KB-32: пользователь видит/вводит ДД.ММ.ГГГГ, форма
  хранит ISO). Депу `react-datepicker` удалена по задаче BL-47
  (`tasks/frontend-quality.md`), но результат владельца не устраивает.
  Остатки прежнего дизайна живы и сиротствуют: `src/components/DatePicker.css`
  (201 строка стилей попапера), `src/utils/dateInput.ts` (parse/format ДД.ММ.ГГГГ)
  — сейчас мёртвый код.
  Файлы: `src/components/DatePicker.tsx`, `src/components/DatePicker.css`,
  `src/utils/dateInput.ts`, `src/components/DatePicker.test.tsx` (переписать под
  новый контракт), потребители: `src/components/DateRange.tsx` →
  `src/components/TripForm.tsx`, `src/components/SyncLogsTab.tsx`,
  `src/pages/ProductsPage.tsx` (~строка 611).
  Как чинить (РЕШЕНО владельцем 03.11.2026): выпадающая часть должна выглядеть
  в стиле приложения — красиво и со скруглениями; противоречащая этому часть
  BL-47 («заменить react-datepicker») вырезана (см. `tasks/frontend-quality.md`).
  Вариант реализации — (a) вернуть `react-datepicker@^9.1.0` (+`@types`) и
  прежнюю реализацию `git show 776dab9:src/components/DatePicker.tsx`
  (контракт KB-32: ввод ДД.ММ.ГГГГ, хранение ISO; попапер `.dark-calendar`
  уже стилизован существующим `DatePicker.css`, скругления `var(--r-md)`);
  API компонента (props) сохранить. При возврате зависимости — держать бандл
  в рамках бюджет-гейта BL-47 (отдельный чанк, см. frontend-quality).
  Приёмка: RED — тест «клик по полю открывает брендовый календарь-попапер
  (нет нативного type=date)» падает; GREEN — после реализации;
  `DatePicker.test.tsx` + `TripForm.test.tsx` зелёные; e2e CR-3 (спаренные даты)
  — в CI (в песочнице Playwright не стартует); после фикса обновить статус BL-47
  в `tasks/frontend-quality.md`.

- [x] 4. BUG: мобильная шапка захламлена — логотип-знак и слово «Провиант»
  занимают место на узком экране (знак 28px + `logo-word` от 400px).
  Файлы: `src/components/Layout.tsx` (topbar `lg:hidden`, ~строки 217–227).
  Как чинить: убрать `BrandMark` и `h1` из мобильного topbar (бургер, бейдж
  режима, тогл темы остаются). Десктопный сайдбар не трогаем.
  Приёмка: RED — в `src/components/Layout.test.tsx` тест «в мобильном topbar нет
  логотипа и слова Провиант» падает; GREEN — после фикса.

- [x] 5. BUG: мелкие иконки действий (добавить/править/удалить в строках и
  заголовках) серые `var(--muted)` — сливаются, не видны как главные элементы
  взаимодействия. Владелец хочет «рыжие» (янтарная ступень палитры,
  `--amber-500`: #FF9E2C dark / #D96A10 light).
  Файлы: `src/index.css` (новый класс `.icon-action` — цвет по умолчанию,
  hover/active/focus-visible, без инлайновых JS-hover'ов) + замена инлайновых
  `color: var(--muted)` и onMouseEnter/Leave: `src/components/ProductTable.tsx`
  (~355–370), `src/components/TripDaysList.tsx` (~85–120, ~205–215 — Users/
  PackagePlus/Plus), `src/components/TripMealCard.tsx` (~68–95 — ListChecks/
  Trash2), `src/pages/RecipesPage.tsx` (~445–465 — карандаш; корзина уже
  `--fire`), `src/components/ManualItemsModal.tsx` (~200),
  `src/components/RecipeIngredientsEditor.tsx` (~155–165),
  `src/components/TripActions.tsx`/`KebabMenu` (триггер).
  Приёмка: RED — компонентный тест (например, `ProductTable.test.tsx`): иконка
  «Правка» имеет класс `.icon-action` (рыжий по умолчанию) — падает; GREEN —
  после фикса; пройтись по списку файлов, единый паттерн без инлайн-hover'ов;
  контраст учесть в связке с BL-62 (`tasks/frontend-quality.md`).

## Заметки

- П.3: решение владельца 03.11.2026 — красивый попапер в стиле приложения со
  скруглениями важнее экономии на зависимости; требование BL-47 «заменить
  react-datepicker» снято (карточка BL-47 в `tasks/frontend-quality.md`
  обновлена в этой же сессии). Проверить визуально обе темы (dark/light) —
  `.dark-calendar` в `DatePicker.css` рассчитан на DOM react-datepicker.
- П.5: точную ступень янтарного (400/500/600) и поведение в светлой теме
  сверить с `provisions/design-pack/tokens.css`; дизайн-пак агентами не
  правится — при нехватке токена фиксировать расхождение владельцу (как BL-62).
- Песочница агента: перед frontend-прогонами нужен `npm ci` (node_modules не
  переживают смену сессии); команды — `skills/testing.md`, раздел Frontend.

## Результаты (заполнить при закрытии)

### п.1 — демо-карточки логина центрованы
`src/pages/LoginPage.tsx`: обе карточки «Админ»/«Пользователь» получили
`text-center` (согласованы с заголовком «Демо-доступ»). Тест «демо-карточки
центрованы» в `LoginPage.test.tsx`: RED (false ≠ true) → GREEN; файл 15/15.

### п.2 — журнал синков не мигает при обновлении
`src/components/SyncLogsTab.tsx`: `loading` — флаг ТОЛЬКО первой загрузки
(стартовый `true`, `setLoading(false)` в `finally`); `loadSyncLogs()` больше
не делает `setLoading(true)` — поллинг RUNNING (2 с) и смена фильтров
подменяют данные на месте, таблица не размонтируется. Новый
`SyncLogsTab.test.tsx` (fake timers, shouldAdvanceTime): первая загрузка —
`page-loader` виден; после первого ответа таблица; перемотка 2100 мс — второй
запрос «висит», `page-loader` НЕ появляется, строка на месте; ответ подменяет
данные (появилась строка 2). RED (PageLoader заменял таблицу) → GREEN.
Нюанс теста: пассивный эффект регистрации поллинга дожидается отдельным
`await act(async () => {})` до перемотки часов. Соседние табы целы:
`IntegrationsPage.tabs.test.tsx` зелёный в полном прогоне.

### п.3 — брендовый DatePicker возвращён (РЕШЕНИЕ ВЛАДЕЛЬЦА 03.11.2026)
- `react-datepicker@^9.1.0` установлен (`npm install`, package.json/package-lock).
- `DatePicker.tsx` восстановлен из коммита `9eeae7d2` — ВАЖНО: не `776dab9`,
  как предлагала карточка. `776dab9` предшествует KB-32 и показывал в поле
  ISO (`dateFormat="yyyy-MM-dd"`); `9eeae7d2` — настоящая KB-32-версия:
  пользователь видит/вводит ДД.ММ.ГГГГ (`utils/dateInput.ts` — мёртвый код
  снова в деле), форма хранит ISO, попапер `.dark-calendar`
  (`dateFormat="dd.MM.yyyy"`, locale ru, `showPopperArrow=false`).
- API сохранён и дополнен `describedBy` (aria-describedby — подсказка
  endDate в DateRange); ISO-ввод (буфер/e2e fill) коммитится сразу;
  min/max — ISO (контракт CR-3); крестик очистки поля на месте.
- `DatePicker.test.tsx` переписан под контракт KB-32 (взят из `9eeae7d2`,
  12 тестов) + новый тест приёмки «клик по полю открывает попапер
  react-datepicker с .dark-calendar; input type=text, нативного type=date
  нет». RED: 9 failed / 4 passed на нативной реализации → GREEN 13/13.
- `TripForm.test.tsx` обновлён под контракт отображения: `type` = 'text',
  `toHaveValue` — ДД.ММ.ГГГГ (ввод в тестах по-прежнему ISO — принимается).
  `TripsPage.create.test.tsx` без изменений, зелёный. DateRange.test.tsx
  без изменений, зелёный (8/8).
- e2e `main-flow.spec.ts` E2E-04b: утверждения `toHaveValue` ISO → ДД.ММ.ГГГГ,
  комментарии про «native input» заменены; fill ISO работает (принимается).
- Бюджет: `vite.config.js` — `manualChunks` выносит `react-datepicker`+`date-fns`
  в чанк `datepicker`; `vite build` зелёный (15,9 с): datepicker ≈ 345 КБ raw
  (≈ 98 КБ gzip) + css 23 КБ, index ≈ 92 КБ raw (≈ 29 КБ gzip).
- Карточка BL-47 в `tasks/frontend-quality.md` обновлена: datepicker-часть
  выполнена, остаток — бюджет-гейт (visualizer, size-limit); критерий
  «чанк ≤ 40 КБ raw» при возвращённой зависимости недостижим — помечен
  к пересчёту владельцем.

### п.4 — мобильный topbar без логотипа
`src/components/Layout.tsx`: из topbar `lg:hidden` убраны `BrandMark` и `h1`
«Провиант»; бургер, `ApiModeBadge inline`, `ThemeToggle` остались; добавлена
распорка `flex-1` (управление прижато к правому краю). Десктопный сайдбар
не тронут (логотип там сохранён — проверяется тестом). Новый тест в
`Layout.test.tsx`: RED (brand-mark в topbar) → GREEN; файл 6/6.

### п.5 — «рыжие» иконки действий (.icon-action)
Класс `.icon-action` (index.css) уже существовал; дозавершено по списку:
- `KebabMenu.tsx` — триггер: `className="ibtn icon-action"` (коробка 42×42
  от .ibtn, рыжий цвет/ховер от .icon-action — ниже по каскаду); затронул
  все три места использования (шапка похода, карточка похода, чеклист).
- `TripDaysList.tsx` — крестики удаления чипов ручных позиций (2 места):
  `icon-action p-0.5 rounded`, инлайновый `var(--muted)` убран.
- `RecipeIngredientsEditor.tsx` — Trash2 «Убрать продукт из блюда»:
  `icon-action p-1 rounded`, инлайновый muted и transition-colors убраны.
- `ProductTable` (Правка/Удалить), `TripMealCard`, `ManualItemsModal`,
  `RecipesPage`, Users/PackagePlus/Plus в `TripDaysList` — были применены
  в предыдущих пачках (opportunistically).
Тесты: `ProductTable.test.tsx` «иконки Правка/Удалить — .icon-action» —
сразу GREEN (фикс сделан раньше, в пачке products-catalog — честно
фиксирую: RED на нём не воспроизводился); `MobileWorkflowComponents.test.tsx`
(триггер kebab) и `TripDetailComponents.test.tsx` (крестик чипа) — RED → GREEN.

### Проверки
- `npx vitest run` (весь проект): 120 файлов, 1050/1050 тестов зелёные (208 с).
- `npm run typecheck:all`: OK (tsc --noEmit + tsconfig.e2e + tsconfig.node).
- `npx eslint` по изменённым файлам: 0 замечаний.
- `vite build`: зелёный, чанки как выше.
- e2e/Playwright в песочнице не стартует — только CI.
- Workflow run: нет, CI не проверено.
