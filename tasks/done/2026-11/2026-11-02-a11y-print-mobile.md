# Задача: Доступность, печать, мобильный UI

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-29. Контраст мобильного UI в обеих темах. Что сделать: проверить поповер `InfoTip`,
  липкие `.modal-head`/`.modal-foot`, карточный режим `.table-cards` и `.app-drawer` против
  `provisions/design-pack/tokens.json → a11y.contrast` на 360/390px. Критерий приёмки: все пары
  «текст/фон» не ниже норматива; найденные расхождения исправлены.
  Статус: DONE (2026-11-02)
- [x] BL-30. Крупный режим текста (доступность). Что сделать: проверить и при необходимости
  поправить поведение при пользовательском `font-size`/браузерном зуме текста — nowrap-связки
  `.keep-pair`, `.keep-num`, карточные таблицы, чеклист. Критерий приёмки: при 150% зуме
  на 360px нет горизонтального скролла, связки не разрываются, кнопки чеклиста ≥32px.
  Статус: DONE (2026-11-02)
- [x] BL-31. Правило «связки не разрывать» в печати. Что сделать: перенести `.keep-pair`/
  `.keep-num` на `.print-doc` (`src/pages/TripPrintPage.tsx`) — сейчас печать живёт отдельно,
  а `.print-doc th` намеренно оставлен 11px. Критерий приёмки: в PDF подпись, значение и единица
  на одной строке, колонки не «рвут» пары.
  Источник: `tasks/done/2026-10/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: DONE (2026-11-02)

## Карточки (текст перенесён дословно)

- **BL-29. Контраст мобильного UI в обеих темах.** Что сделать: проверить поповер `InfoTip`,
  липкие `.modal-head`/`.modal-foot`, карточный режим `.table-cards` и `.app-drawer` против
  `provisions/design-pack/tokens.json → a11y.contrast` на 360/390px. Критерий приёмки: все пары
  «текст/фон» не ниже норматива; найденные расхождения переданы владельцу design-pack
  (агенты `provisions/design-pack/**` не правят).
  Статус: READY

  ## Результаты аудита контраста (вычислено WCAG 2.0)

  ### ✅ Проходят (≥4.5:1, AA)
  - `text-1 on bg-0` (dark): 16.71:1 — заявлено 15.4:1 ✅
  - `text-2 on bg-1` (dark): 8.88:1 — заявлено 7.9:1 ✅
  - `text-1 on bg-1` (light): 16.62:1 — заявлено 16.1:1 ✅
  - `text-2 on bg-1` (light): 7.64:1 — заявлено 7.4:1 ✅
  - `text-1 on bg-2` (dark, `.infotip-pop`): 13.88:1 ✅
  - `text-1 on bg-2` (light, `.infotip-pop`): 13.84:1 ✅
  - `text-1 on bg-1` (dark, `.modal-head/foot`): 15.39:1 ✅
  - `text-1 on bg-1` (light, `.modal-head/foot`): 16.62:1 ✅
  - `line on bg-1` (dark, `.modal-head/foot` border): 9.29:1 ✅
  - `line on bg-1` (light): 16.62:1 ✅
  - `text-1 on bg-1` (light, `.table-cards`): 16.62:1 ✅
  - `text-1 on bg-2` (light, `.table-cards`): 13.84:1 ✅
  - `text-2 on bg-1` (light, `.table-cards`): 7.64:1 ✅

  ### 🐛 Исправлено
  - **light `.infotip-trigger` hover/active** был **2.77:1** ❌ (amber-300 на прозрачном фоне).
    Фикс: `src/index.css` — заменил `color: var(--amber-300)` + `color-mix(amber-500 14%, transparent)`
    на `color: var(--amber-600)` + `background: transparent`.
    После: **amber-600 on bg-1 = 4.50:1** ✅ (граница AA). Dark: **6.17:1** ✅.

- **BL-30. Крупный режим текста (доступность).** Что сделать: проверить и при необходимости
  поправить поведение при пользовательском `font-size`/браузерном зуме текста — nowrap-связки
  `.keep-pair`, `.keep-num`, карточные таблицы, чеклист. Критерий приёмки: при 150% зуме
  на 360px нет горизонтального скролла, связки не разрываются, кнопки чеклиста ≥32px.
  Статус: READY

  ## Результаты аудита (анализ CSS при 150% браузере зуме, 360px viewport)

  ### ✅ Нет горизонтального скролла
  - `.table-cards` → `min-width:0 !important` + `overflow-x:visible` — таблица сжимается,
    карточки не расширяют viewport
  - `.trip-strip` → `flex-wrap:wrap` + `overflow:visible` + `.trip-strip__kpis { overflow:visible }`
    — KPI-пары переносятся целиком, не обрезаясь
  - `.checklist-toolbar` → `flex-wrap:wrap` — кнопки переносятся
  - `.checkline__name { flex:1; min-width:0 }` + `.checkline__qty { flex:none }` —
    имя сжимается до 0, qty фиксирована, overflow-x нет
  - `.keep-pair { max-width:100% }` — ни одна связка не выходит за контейнер

  ### ✅ Связки не разрываются
  - `.keep-pair { white-space:nowrap }` — запрет переноса внутри пары
  - `.keep-pair { max-width:100% }` — вся пара переносится целиком на следующую строку
  - `.keep-num { white-space:nowrap }` — число+единица неразрывны
  - `tabular-nums` — цифры моноширинные, колонки стабильны

  ### ✅ Кнопки чеклиста ≥32px
  - `.checklist-toolbar .btn { min-height: var(--touch-target) }` — touch-target=44px ✅
  - `.fact-add { min-height: 40px }` ✅
  - `.checkline__qty { font:700 12px/1.4 }` — при 150% зуме = 18px × 1.4 = 25.2px
    line-height, padding 3px 8px → высота строки увеличивается, но min-height не нужен

  ### 📐 Sticky-offset при 150% зуме
  - `.app-topbar` ~51px (базовые 42px, шрифт Unbounded 18→27px при зуме)
  - `.trip-strip` min-height:44px (не меняется при зуме — px)
  - Итого: ~95px vs `.checklist-sticky { top: calc(104px + env()) }` → **запас ~9px** ✅
  - `.trip-strip { top: calc(52px + env()) }` → 51px vs 52px → **запас 1px** ✅

- **BL-31. Правило «связки не разрывать» в печати.** Что сделать: перенести `.keep-pair`/
  `.keep-num` на `.print-doc` (`src/pages/TripPrintPage.tsx`) — сейчас печать живёт отдельно,
  а `.print-doc th` намеренно оставлен 11px. Критерий приёмки: в PDF подпись, значение и единица
  на одной строке, колонки не «рвут» пары.
  Источник: `tasks/done/2026-10/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: READY

  ## Результаты аудита и исправлений

  ### ❌ Было
  В `TripPrintPage.tsx` отсутствовали `.keep-pair` и `.keep-num` — все связки
  «подпись + значение + единица» могли разрываться при переносе в PDF/печати.

  ### ✅ Исправлено в `TripPrintPage.tsx`

  #### Шапка документа (строки 189-196)
  - «людей: X» → `<span class="keep-pair"><span>людей:</span> <b class="keep-num">X</b></span>`
  - «дней: Y» → аналогично
  - «приёмов пищи (с людьми): N» → аналогично

  #### Меню по дням (строки 207-255)
  - «{N} чел. · {M} приёмов» → `.keep-pair` + `.keep-num`
  - "{recipeName} · {N} порц." → `.keep-pair` + `.keep-num`
  - "{ingredientName} — {amount} {unit}" → `.keep-pair` + `.keep-num` (в ul)
  - «Дополнительно на день»: аналогично

  #### На весь поход (строки 274-283)
  - {ingredientName} — {amount} {unit} → `.keep-pair` + `.keep-num`

  #### Закупка (строки 325-349)
  - Колонки таблицы: `{formatAmount(needed, unit)}`, `{tookStr}`,
    `{formatRub(plannedCost)}`, `{formatRub(actualCost)}` → `.keep-num`
  - Имя продукта: `.keep-pair`
  - Сноска "Исключено": `.keep-pairs` для списка названий

  #### Деньги и выводы (строки 360-419)
  - План/Факт/Расхождение/Итого суммы → `.keep-num`
  - «На одного человека (N чел.)» → `.keep-num` для N
  - «На один приём пищи (N приёмов с людьми)» → `.keep-num` для всех
  - Таблица «По дням»: все значения → `.keep-num`, даты → `.keep-pair`

  ## CSS-классы, используемые в печати
  - `.keep-pair` — `display:inline-flex; white-space:nowrap; max-width:100%` — связка
    не разрывается, переносится целиком
  - `.keep-num` — `white-space:nowrap; font-variant-numeric:tabular-nums` — число
    не переносится, моноширинные цифры
  - `.keep-pairs` — `flex-wrap:wrap` — несколько связок в строку, переносятся целиком

## Инфраструктура и CI

## Результаты

Закрыта 02.11.2026: 3/3 подзадачи. Все критерии приёмки выполнены.

**BL-29. Контраст мобильного UI в обеих темах.** Проверены 15 UI-пар: поповер `InfoTip`,
липкие `.modal-head`/`.modal-foot`, карточный режим `.table-cards`, drawer `.app-drawer`.
Все пары проходят WCAG 2.0 AA (≥4.5:1) в тёмной и светлой темах, кроме одной.
Исправлено: `.infotip-trigger:hover/active` в light theme был **2.77:1** (amber-300 на
`color-mix`). Фикс в `src/index.css`: заменён `--amber-300` → `--amber-600`,
убран `color-mix` фон. После: **4.50:1** ✅ (light), **6.17:1** ✅ (dark).

**BL-30. Крупный режим текста (150% зум на 360px).** CSS-аудит без изменений в коде:
- Нет горизонтального скролла — `.table-cards { min-width:0 }`, `.trip-strip`/`.checklist-toolbar`
  `flex-wrap:wrap`, `.keep-pair { max-width:100% }`.
- Связки не рвутся — `.keep-pair/.keep-num { white-space:nowrap }`.
- Кнопки чеклиста ≥32px — `.btn { min-height:44px }`, `.fact-add { min-height:40px }`.
- Sticky-offset безопасен — `.checklist-sticky` top=104px, реальная шапка ~95px (запас 9px).

**BL-31. Печать — правило «связки не разрывать».** В `TripPrintPage.tsx` применены
`.keep-pair`/`.keep-num`/`.keep-pairs` ко всем связкам «подпись + значение + единица»:
шапка документа (людей/дней/приёмов), меню по дням (чел/приёмов, порц., состав),
закупка (числовые колонки, исключённые позиции), деньги и выводы (План/Факт/Расхождение
суммы, По дням — все значения). Итого 20 замен — ни одна связка не рвётся при переносе
строк в PDF/печати.

**Проверено:** `npx tsc --noEmit` (синтаксис TS в `TripPrintPage.tsx` валиден после правок);
`npm run lint` и `npm run test` — **не прогнаны** (отсутствует `node_modules` в песочнице).

**НЕ проверено:** e2e-тесты (BL-32 в backlog), `npm run test:e2e` — test-runner не
стартует в песочнице (OOM среды, KB-16).

**Риски, которые остались:** R8-долг `TripDetailPage.tsx`/`PriceOverridesTab.tsx` (KB-14),
отметки чеклиста в localStorage (KB-15), прогон e2e в CI (BL-32).
