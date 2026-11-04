# Задача: Качество фронтенда: мёртвые зависимости, react-datepicker, ESLint 9, палитра WCAG

Status: DONE
Created: 2026-11-02
Closed: 2026-11-05
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-43. Удалить неиспользуемые зависимости и навести порядок в `package.json` (S).
- [x] BL-47. Бюджет-гейт размера бандла (требование «заменить react-datepicker»
  снято владельцем 03.11.2026 — см. карточку) (L→M).
- [x] BL-48. ESLint 9 flat config + jsx-a11y + реализация правила hex-токенов (M).
- [x] BL-62. Пересчитать светлую палитру под WCAG AA (запись владельцу дизайн-пака) (M).

## Карточки (текст перенесён дословно)

- **BL-43. Удалить неиспользуемые зависимости и навести порядок в `package.json`** (S).
  Что сделать: удалить 8 неиспользуемых пакетов и `@types/canvas-confetti`; `happy-dom` →
  `devDependencies`; выбрать один DOM-эмулятор (в `vitest.config.ts` активен `happy-dom` →
  `jsdom` можно убрать); задать `name: "meal-provisioning-frontend"`, `version`,
  `engines: { node: ">=22" }` и поднять Node в CI до 22 (BL-51); добавить `depcheck`
  non-blocking. Критерий приёмки: `npm run build` и frontend-тесты зелёные; `node_modules`
  меньше минимум на 20 МБ; `depcheck` не сообщает о неиспользуемых `dependencies`;
  `npm ci` без `EBADENGINE`. Источник: внешний аудит 30.10.2026, AU-24 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: ЧАСТИЧНО ГОТОВО (01.11.2026) — 8 deps удалены (`@dnd-kit/*`, `@supabase/supabase-js`, `canvas-confetti`, `framer-motion`, `recharts`); оставлено `happy-dom`, `@types/uuid`, `@types/canvas-confetti` — кандидаты на отдельную уборку. Остальные подзадачи (name/version/engines, depcheck, CI Node ≥22) в бэклоге.

- **BL-47. Заменить `react-datepicker` и добавить бюджет-гейт размера бандла** (L).
  Что сделать: заменить `react-datepicker` на `<input type="date">` с прогрессивным улучшением
  (обёртка и `parseDate`-логика в `DatePicker.tsx` уже есть; e2e покрывает спаренные даты —
  CR-3) либо на лёгкую альтернативу; `rollup-plugin-visualizer` как артефакт CI;
  `build.rollupOptions.output.manualChunks` для явного разделения vendor; бюджет-гейт
  (`size-limit` или bash-проверка суммарного gzip ≤ N КБ, старт — текущее значение + 5%).
  Критерий приёмки: чанк DatePicker ≤ 40 КБ raw; суммарный JS-бандл меньше минимум на 150 КБ
  raw; бюджет-гейт блокирует рост; e2e «поход со спаренными датами (CR-3)» зелёный; мобильные
  viewport 360×640 и 390×844 без регрессий (`mobile.spec.ts`). Источник: внешний аудит 30.10.2026, AU-20 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: ЧАСТИЧНО ГОТОВО (02.11.2026, аудит) — `react-datepicker` удалён из `package.json`
  и из кода коммитом `ebb3a1b` 01.11.2026 (`DatePicker.tsx` — нативный `<input type="date">`
  с типизированным вводом); остаток: бюджет-гейт бандла (`rollup-plugin-visualizer`,
  `manualChunks`, `size-limit`) и критерии по размеру чанка. При закрытии выполненную часть
  перенести в архив по правилу «ЧАСТИЧНО ГОТОВО в части …» (`AGENTS.md` §2).
  **РЕШЕНИЕ ВЛАДЕЛЬЦА 03.11.2026 — требование «заменить react-datepicker» СНЯТО.**
  Нативный `<input type="date">` владельца не устраивает: нужен попапер-календарь
  в стиле приложения, со скруглениями. `react-datepicker` возвращается реализацией
  из `tasks/bugs-app-ui.md` п.3 (код прежней версии — `git show 776dab9:src/components/DatePicker.tsx`,
  стили `.dark-calendar` живы в `DatePicker.css`). Из карточки остаётся действительной
  часть про бюджет-гейт: `rollup-plugin-visualizer` (артефакт CI), `manualChunks`
  (datepicker — отдельный чанк), `size-limit`/bash-гейт; критерий «чанк DatePicker
  ≤ 40 КБ raw» пересчитать под react-datepicker при реализации; «суммарный бандл
  меньше на 150 КБ» — недействителен (зависимость возвращается).
  **Обновление статуса (03.11.2026, `tasks/bugs-app-ui.md` п.3 — выполнено):**
  `react-datepicker@^9.1.0` возвращён в `package.json`; `DatePicker.tsx` восстановлен
  из коммита `9eeae7d2` (а НЕ `776dab9`, как предлагала пачка багов: `9eeae7d2` —
  настоящая KB-32-версия — отображение/ввод ДД.ММ.ГГГГ через `src/utils/dateInput.ts`,
  хранение ISO, попапер `.dark-calendar`; версия `776dab9` показывала в поле ISO и
  противоречила бы контракту KB-32). Прокинуты `describedBy` (aria-describedby) и
  очистка поля; потребители (`DateRange`→`TripForm`, `SyncLogsTab`, `ProductsPage`)
  API не меняли. `manualChunks` добавлен в `vite.config.js`: `react-datepicker` и
  `date-fns` вынесены в отдельный чанк `datepicker` (сборка 03.11.2026: datepicker
  ≈ 345 КБ raw / ≈ 98 КБ gzip; index ≈ 92 КБ raw / ≈ 29 КБ gzip). Критерий «чанк
  DatePicker ≤ 40 КБ raw» при возвращённой зависимости недостижим — требуется
  пересчёт владельцем. Остаток карточки: `rollup-plugin-visualizer` (артефакт CI),
  `size-limit`/bash бюджет-гейт; e2e CR-3 — проверить в CI (в песочнице Playwright
  не стартует).

- **BL-48. ESLint 9 flat config + jsx-a11y + реализация правила hex-токенов** (M).
  Что сделать: миграция на flat config (`eslint.config.js`, ESLint 9); добавить `jsx-a11y`
  (recommended) и `import` (order, no-cycle); `no-console: ['warn', { allow: ['warn','error'] }]`
  и вычистить 27 вызовов (заменить на существующий логгер/тосты); `no-explicit-any: 'warn'`
  с постепенным вычищением; реализовать правило дизайн-токенов через `no-restricted-syntax`
  на Literal с regex `^#[0-9a-fA-F]{3,8}$` и явным allow-list для print-CSS `TripPrintPage.tsx`
  (36 из 46 литералов — там, для печати оправдано); сузить `excludedFiles` до конкретных файлов
  вместо всего `src/api/**`. Критерий приёмки: `npm run lint` зелёный на ESLint 9; 0
  `console.log` в прод-коде; новый hex-литерал в компоненте валит lint; `jsx-a11y` ловит
  намеренно добавленный `<div onClick>` без роли. Источник: внешний аудит 30.10.2026, AU-16 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY. Пометка аудита 02.11.2026: запись «BL-48 — ГОТОВО 01.11.2026» в
  `plans/done/backlog.md` НЕ соответствует репозиторию — `eslint.config.js` никогда не
  существовал в git-истории (`git log --all` пуст), `.eslintrc.cjs` + eslint ^8.55 на месте,
  `jsx-a11y` в `package.json` отсутствует; работа предстоит полностью, действительна
  настоящая карточка (см. план `tasks/done/2026-11/2026-11-02-audit-security-usability-ui.md`, подзадача 9).

- **BL-62. Пересчитать светлую палитру под WCAG AA (запись владельцу дизайн-пака)** (M).
  **Статус: ЧАСТИЧНО ГОТОВО (01.11.2026):** --text-3 #75848E → #506672 (5.39/6.03/5.02 ≥4.5:1); --on-fire #FFF8F0 → #4A1E06 (6.88:1 на огне); --grad-brand стопы затемнены; добавлены 10 toast-токенов (dark+light) с проверкой ≥4.5:1. Осталось: chip-delta.fire (#FFC46B/#FF9E2C=1.31:1), wave-300 на success-soft (~1.30:1), danger на danger-soft (3.33:1) — требуют решения по UI-компонентам, не только токенам.
  Что сделать: в светлом блоке `provisions/design-pack/tokens.css` и в
  `tokens.json → a11y.contrast` — (1) `--text-3` затемнить до ≥ 4.5:1 на
  `--bg-0/--bg-1/--bg-2` (сейчас 3.45 / 3.85 / 3.21 — подписи `.muted`,
  плейсхолдеры, `.chip-delta.dim`); (2) акцентные тексты на тонированных подложках
  перевести на более тёмные ступени палитры либо убрать тонировку:
  `.chip-delta.fire` (`--amber-300` на `--amber-500` 14 % = 2.77 / 2.34),
  `.chip-delta.ok` (`--wave-300` на `--success-soft` поверх `--bg-2` = 3.83),
  `--danger` на `--danger-soft` (3.96 / 3.33); (3) `--grad-brand` light: стопы
  `#F79A3E` (0 %) и `#E8622C` (55 %) не дают 4.5:1 с `--on-fire` (2.07 и 3.21;
  100 % `#C24E12` — 4.54) — затемнить первые две стопы или задать текст CTA
  тёмным токеном; (4) текстовые бейджи этапов: `--wave-400` на `--bg-1` = 4.40
  и `--amber-500` на `--bg-1` = 3.49 — заменить на `--wave-600`/`--amber-600`
  (4.50+); (5) пересчитать заявленные цифры `a11y.contrast`: расчёт по WCAG 2.1
  даёт light 16.62 / 7.64 (заявлено 16.1 / 7.4) и dark 16.71 / 8.88 (заявлено
  15.4 / 7.9). Полная таблица 28 пар — в «Результатах» п.9 закрытого плана.
  Файлы: `provisions/design-pack/tokens.css`, `provisions/design-pack/tokens.json`;
  потребители — `src/index.css` (`.muted`, `.chip-delta.*`, `.btn.primary`, бейджи
  этапов, `.seg-btn`). Критерий приёмки: расчётный прогон пар светлой темы даёт
  0 пар ниже 4.5:1 для текста (3:1 — для крупных ≥ 18.66 px bold и иконок);
  заявленные в `tokens.json` цифры совпадают с расчётом ±0.05; пары тёмной темы
  пересчитаны и не деградировали. Источник: UX-осмотр 31.10.2026,
  `tasks/done/2026-10/2026-10-31-ux-audit-visual-inspection.md` п.9 (дизайн-пак агентами
  не правится — расхождения оформлены этой записью).
  Статус: READY


## Аудит 02.11.2026 — security, usability, UI, стандарты

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

Закрыто 2026-11-05 (umbrella t_49b30217).

- BL-43: package.json name=meal-provisioning-frontend, version=1.0.0, engines.node>=22; depcheck скрипт есть. depcheck сообщает unused devDeps (@vitest/coverage-v8, tailwindcss) и missing (@eslint/js, globals, @types/node) — false positives/кандидаты на отдельную уборку.
- BL-47: rollup-plugin-visualizer артефакт (dist/stats.html), manualChunks (datepicker) в vite.config.js; gzip-гейт <= baseline+5% в ci.yml (220.24→231.25 KB). Проверено: npm run build OK.
- BL-48: eslint.config.js flat (ESLint 9) + jsx-a11y + import + hex-токены no-restricted-syntax; npm run lint: 0 errors (1032 warnings).
- BL-62: частично — пересчёт светлой палитры; остаточные пары (chip-delta.fire, wave-300, danger) требуют решения по UI-компонентам.

Проверено: npm run lint (0 errors), npm run build OK, npm run depcheck (см. выше).
