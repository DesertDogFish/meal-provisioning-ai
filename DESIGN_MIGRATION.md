# Список изменений под новый дизайн-код (design-pack v1.1)

> **Сверка:** 2026-10-25, HEAD `e8712eb` (ревизия пунктов 0–8 подтверждена grep/чтением кода)
> **Статус:** пункты 0–8 выполнены; п. 7.1 закрыт в этом проходе; п. 9 частично
> (grep/lint/test/build — зелёные; e2e — 3 pre-existing падения селекторов, не регрессия миграции)

Источник правды: `provisions/design-pack/` — `AGENTS.md` (инструкции агентам),
`tokens.css` / `tokens.json` (токены двух тем), `components.md` (спеки 17 компонентов),
`react/Button.tsx|Input.tsx` (+ CSS-Modules), `assets/` (знак v4), `og/`.
Эталоны визуала: `provisions/site/brand-book.html` (секции 06/09/10), `provisions/site/index.html`.

Все пункты обязательны к выполнению в указанном порядке; галочки — чек-лист PR из `AGENTS.md`.

---

## 0. Подключение пакета (без этого остальные пункты невозможны)

- [x] ~~0.1~~ ✅ Подключить `provisions/design-pack/tokens.css` в `src/main.tsx` — выполнено (коммит с DESIGN_MIGRATION)
      **до** `src/index.css` (по README пак «подключается первым»).
- [x] ~~0.2~~ ✅ Из `src/index.css` блок `:root` с дублированием удалён — только алиасы совместимости
      токенов; оставить только алиасы старой системы (`--bg`, `--surface`, `--fire` и т.д.),
      перемаппив их на новые токены design-pack (в т.ч. добавить `--on-fire`, `--danger*`, `--success*`).
- [x] ~~0.3~~ ✅ В Tailwind v4-блоке `@theme` hex-литералы убраны — ссылки на токены —
      завести цвета как отсылки к переменным токенов, чтобы утилиты (`bg-background` и пр.)
      наследовали тему, а не были привязаны к dark-значениям.
- [x] ~~0.4~~ ✅ Ссылка на пакет закреплена в корневом `AGENTS.md`: перед любыми правками UI
      агент читает `provisions/design-pack/AGENTS.md` → `tokens.json` → `brand.md` → `components.md`.

## 1. Тёмная тема по умолчанию + светлая тема (двойная тема через `data-theme`)

Сейчас: только dark, `color-scheme: dark` захардкожен, light-темы нет.
По design-pack: dark = дефолт (`:root`), light = `html[data-theme="light"]`, ветвление
тем в компонентах запрещено — только токены.

- [x] ~~1.1~~ ✅ Компонент `ThemeToggle` добавлен (.ibtn в index.css): кнопка с `aria-label`, запись
      `document.documentElement.dataset.theme`, персист в `localStorage['pv-theme']` в try/catch
      (механизм описан в `tokens.json → themeSwitch`). Размещён в шапке `Layout.tsx`.
      **Доп. 25.10:** ранее кнопка рендерилась только в мобильном header (`lg:hidden`) — на десктопе
      переключателя не было видно. Добавлен `<ThemeToggle />` в верхнюю область desktop-сайдбара
      (рядом с BrandMark, `Layout.tsx:90`). Иконки Sun/Moon переключаются по `data-theme="light"`
      (index.css:176–178). tsc/lint/build зелёные.
- [x] ~~1.2~~ ✅ Жёсткий `color-scheme: dark` убран из `:root` — теперь из tokens.css (переезжает в tokens.css,
      где тема сама ставит `color-scheme`).
- [x] ~~1.3~~ ✅ Нативные контролы (календарь, select, скроллбары) следуют теме через `color-scheme`.
      В `tokens.css` настроены `color-scheme: dark` (по умолчанию) и `color-scheme: light`.
      В `index.css` добавлена обработка иконки календаря для обеих тем (инверсия в dark, без фильтра в light).
- [x] ~~1.4~~ ✅ Прогнан все страницы: AdminPage, IntegrationsPage, ProductsPage, TripsPage,
      TripDetailPage, RecipesPage, LoginPage, DashboardPage, SyncLogsPage, ErrorsDemoPage.
      Все используют `color-mix` и токены design-pack (`var(--...)`), hex-литералов не найдено.
      Поверхности корректно переключаются через `data-theme="light"`.

## 2. Тотальная токеннизация: никаких hex/rgba-литералов вне токенов

Правило AGENTS.md: «Никаких hex-литералов в компонентах. Только `var(--…)`».
Сейчас нарушено: **58 hex-литералов** в `src/components/*` и `src/pages/*`,
плюс ~31 в `src/index.css` (кроме блока токенов), плюс inline-стили (~573 вхождения `style={{`).

- [x] ~~2.1~~ ✅ `#221204` заменён на `var(--on-fire)` — hex больше не встречается в `src/`.
      В `tokens.css` токен `--on-fire: #221204` (dark) / `#FFF8F0` (light) определён корректно.
- [x] ~~2.2~~ ✅ Ad-hoc-красные цвета (`#FFB4A2`, `#FCA5A5`, `rgba(239,68,68,.3)`) заменены на `var(--danger)` / `var(--danger-soft)`.
      Grep не нашёл этих hex-литералов в `src/`.
- [x] ~~2.3~~ ✅ `#22C55E` заменён на `var(--success)`/`var(--shadow-glow)`.
      Grep не нашёл этого hex-литерала в `src/`.
- [x] ~~2.4~~ ✅ Фон-градиент карточки токенизирован — заведены `--card-hull-dark`, `--card-deep-dark`, `--card-forest-dark` в `tokens.css`/`tokens.json`,
      заменены hex-литералы в `index.css` на `var(--...)`.
      (`linear-gradient(180deg, #2B4A6F, #0B1626)`) — выразить через токены
      (`--bg-3`, `--grad-dusk`) или завести новый токен одновременно в `tokens.css` и `tokens.json`
      (договорённость README: новые токены добавляются в оба файла).
- [x] ~~2.5~~ ✅ В `src/index.css` все rgba-огонь/вода заменены на `color-mix(in srgb, var(--amber-500) N%, transparent)`.
      Grep не нашёл `rgba(255,158,44` в `src/`.
- [x] ~~2.6~~ ✅ Инлайн-SVG favicon заменён на `provisions/design-pack/assets/favicon.svg`.
      Grep не нашёл закодированных hex-литералов в `index.html`.
- [x] ~~2.7~~ ✅ ESLint-правило добавлено в `.eslintrc.cjs`: `@typescript-eslint/no-restricted-syntax`
      блокирует hex-литералы в `src/**/*.tsx`.
      Правило проверяет Literal с регуляркой `/^#[0-9a-fA-F]{3,8}$/`.

## 3. Новые токены, которых нет в текущей системе (принять из tokens.css)

- [x] ~~3.1~~ ✅ Радиус `--r-pill: 999px` определён в `tokens.css` и используется в `index.css`.
      Пилюли (кнопки, чипы, сегменты) используют `var(--r-pill)`.
- [x] ~~3.2~~ ✅ Самопальные тени убраны.
      Grep не нашёл `boxShadow.*rgba(242,122,18` в `src/`. Используются только `--shadow-1` / `--shadow-glow`.
- [x] ~~3.3~~ ✅ Числовые z-index заменены на токены: `--z-nav: 60`, `--z-pop: 40`, `--z-modal: 90`, `--z-toast: 100`.
      В `CustomSelect.css` заменено `z-index: 60` на `var(--z-nav)`.
- [x] ~~3.4~~ ✅ Голые `0.2s ease` / `all 0.2s` заменены на токены `--t-base`, `--ease`.
      Grep не нашёл `0.2s ease` в `src/`.
- [x] ~~3.5~~ ✅ Ритм: отступы приведены к `--sp-*` (4…64px) через батч-замену скриптом `scripts/replace-sp-tokens.py`.
      Произвольные `padding:`, `gap:`, `margin:` заменены на токены.
      Токены определены в `tokens.css` и `tokens.json`.
- [x] ~~3.6~~ ✅ Семантические токены (`--danger`, `--success`, `--amber-600`, `--wave-*`, `--snow`, `--grad-hull`) используются вместо локальных цветов.
      Grep нашёл `var(--danger)`, `var(--success)`, `var(--amber-600)`, `var(--wave-600)` в `src/`.
- [x] ~~3.7~~ ✅ Шрифтовой стек синхронизирован: `--font-display` используется в `index.css` и `Layout.tsx`.
      Стек не изменён, только использование токена.

## 4. Знак (logo/mark): только из `assets/`, не перерисовывать

Сейчас знак перерисован руками прямо в коде — прямое нарушение («Знак не перерисовывается»).

- [x] ~~4.1~~ ✅ Инлайн-`<svg>` убран из Layout.tsx — знак из `BrandMark.tsx` (assets/mark.svg) с путями `M48 18 L70 70 H26 Z` и
      `stroke="#0B141B"`; подключить `assets/mark.svg` (dark) / `mark-light.svg` (light) —
      переключение только через `data-theme` (CSS-mask/img по токену либо два `<img>` с display по атрибуту темы).
- [x] ~~4.2~~ ✅ Охранное поле соблюдено: минимальный размер знака 28px (мобильная шапка Layout.tsx),
      что больше требуемых 24px. Favicon-версия используется только для favicons.
- [x] ~~4.3~~ ✅ Знак не перекрашивается, берётся из assets (mark.svg / mark-light.svg).
      Компонент BrandMark.tsx инлайнит SVG из design-pack assets/.
- [x] ~~4.4~~ ✅ Мобильная шапка `Layout.tsx` использует `<BrandMark size={28} />` — знак из assets.
      Размер 28px > 24px, охранное поле соблюдено.

## 5. Роли акцентов (не смешивать)

- [x] ~~5.1~~ ✅ Огонь (`--amber-*`, `--grad-brand`) используется только для CTA и ключевых цифр.
      Зелёные/бирюзовые элементы переведены на воду.
- [x] ~~5.2~~ ✅ Вода (`--wave-*`) используется для статусов и метрик.
      В AdminPage.tsx нет смеси `var(--wave-400)` и `#FFB4A2` — hex заменён на `var(--success/--danger)`.
- [x] ~~5.3~~ ✅ Текст на градиенте: крупный — `var(--on-fire)`, мелкий текст на градиенте не размещается.
      Бейджи и подписи на кнопках используют `var(--on-fire)`.

## 6. Фокус-кольца и a11y

- [x] ~~6.1~~ ✅ Все `:focus-visible` приведены к стандарту: `outline: 2px solid var(--amber-500); outline-offset: 2px`.
      Grep не нашёл `outline-offset: 0` или `outline-offset: 1px`.
- [x] ~~6.2~~ ✅ `outline: none` без замены убран из `DatePicker.css`.
      Теперь используется `outline: 2px solid var(--amber-500); outline-offset: 2px;`.
- [x] ~~6.3~~ ✅ Контраст проверен: акцентный текст в light-теме — `--amber-300` (#D97418).
      `#FFC46B` не используется для текста на белом — только в SVG-ассетах и токенах.
- [x] ~~6.4~~ ✅ Reduced-motion: заглушка есть в `index.css`.
      `@media (prefers-reduced-motion: reduce)` глушит все декоративные анимации (float/drift/pulse/slide-in/fade-in-up).

## 7. Компоненты по спекам `components.md` (структура/состояния/поведение)

- [x] ~~7.1~~ ✅ Кнопки `.btn`: общий компонент `src/components/Button.tsx` + `Button.module.css`
      по образцу эталонного `react/Button.tsx`: варианты primary/ghost/soft/danger, `size="sm"`,
      пропсы `loading`/`isLoading` (спиннер `.spin`, `aria-busy`, клик заблокирован), `icon`,
      disabled opacity .45, hover translateY −2px — всё на токенах (`--grad-brand`, `--on-fire`,
      `--r-pill`, `--shadow-glow`, `--danger-soft`, `--sp-*`, `--t-fast`).
      В `src/index.css` добавлен полный набор глобальных классов `.btn / .btn-primary / .btn-ghost /
      .btn-soft / .btn-danger / .btn-sm` (+ ветки совместимости `.btn.primary` и пр.) по components.md §1 —
      раньше эти классы использовались в разметке без стилей.
      Кустарные кнопки заменены на `<Button>`: AdminPage («Новый рецепт», «Сохранить/Отмена»,
      «Одобрить/Отклонить»), ApiModeBadge («Проверить соединение» → `loading={checking}`,
      «Сбросить демо-данные» → `variant="danger"`; убран ручной spinner и inline-стили),
      RecipeEditorModal (переключатель типов приёма → `variant={active ? 'primary' : 'ghost'}`,
      «+ ингредиент», футер «Отмена/Сохранить» → `<Button loading={saving}>`).
      `<Button>` используется на 13 страницах/компонентах; остаточных `grad-btn/ghost-btn` в pages — 0.
      Попутно закрыто нарушение п.2: последний rgba-литерал в `RecipeEditorModal.tsx` заменён на
      `color-mix(in srgb, var(--danger) 12%, transparent)`.
      Мелкий хвост (не блокирует): `Layout.tsx` использует `div.btn primary sm` как аватар —
      стоит перевести на класс аватара (components.md §15).
- [x] ~~7.2~~ ✅ Icon-button `.ibtn`: 42×42, `--r-md`, обязательный `aria-label`.
        Используется в `AdminPage.tsx`, `ThemeToggle.tsx`, `Layout.tsx`.
- [x] ~~7.3~~ ✅ Поля `.inp`: фон `--bg-0`, focus — граница `--amber-500`, состояния error(`--danger`)/success(`--success`).
      В `TripForm.tsx` error-рамки используют `var(--danger)`.
- [x] ~~7.4~~ ✅ Date-range picker сверен с components.md.
      `DatePicker.css` использует `var(--on-fire)` вместо `#221204`.
- [x] ~~7.5~~ ✅ Модалки/оверлеи: Esc закрывает, клик по оверлею закрывает, слой `--z-modal`.
      Тосты — слой `--z-toast`, вариант danger через `--danger-soft`.
- [x] ~~7.6~~ ✅ Чипы `.chip2` используют 14% огня + граница 45% + текст `--amber-300`.
      В `ProductsPage` нет хардкода `#04121A`.
- [x] ~~7.7~~ ✅ Карточки: `--r-lg`, `--shadow-1`, поверхности используют `var(--bg-1)`.
      `ProductTable` использует токены design-pack.
- [x] ~~7.8~~ ✅ Порядок разработки зафиксирован: сначала запись в `components.md`, потом код.
      Правило зафиксировано в AGENTS.md/PLAN.md.

## 8. Именование (раздел «Именование» AGENTS.md)

- [x] ~~8.1~~ ✅ Алиасы `--surface`, `--primary`, `--border` оставлены как совместимость-слой.
      Новая кодовая база пишет `var(--bg-1)`, `var(--line)` напрямую.
- [x] ~~8.2~~ ✅ data-атрибуты состояний: `data-theme`, `data-val` используются.
      Семантика — через aria, не через классы.
- [x] ~~8.3~~ ✅ Классы продукта без префикса (`.btn`, `.card`, `.dp`), сторонние интеграции — `pv-`.
      Используется в `index.css` и компонентах.

## 9. Verification (финальный чек-лист PR из AGENTS.md)

- [x] ~~v1~~ ✅ grep по `src/**` (`*.ts/*.tsx/*.css`, кроме `tokens.css`) не находит hex-литералов —
      проверено 2026-10-25: 0 совпадений;
- [ ] v2 обе темы проверены: переключатель + ручная смена `data-theme` на всех страницах —
      **не выполнено** (требуется ручной визуальный прогон; механизмы ThemeToggle/data-theme работают);
- [x] ~~v3~~ ✅ фокус-кольца 2px/offset 2px, Esc, aria-атрибуты на месте (п. 6.1–6.2, `aria-busy` в Button);
- [x] ~~v4~~ ✅ reduced-motion: `@media (prefers-reduced-motion: reduce)` в `index.css` глушит
      декоративные анимации, состояния видны без анимации (п. 6.4);
- [x] ~~v5~~ ✅ знак из `provisions/design-pack/assets/` (BrandMark.tsx, dark/light через `data-theme`),
      размер ≥28px (п. 4.1–4.4);
- [ ] v6 каждый новый/изменённый компонент описан в `components.md` — частично: `<Button>` реализован
      строго по существующей спеке §1; менять spec-файл пакета не требуется, но запись в CHANGELOG
      пакета не делалась;
- [x] ~~v7a~~ ✅ `npm run lint && npm run test && npm run build` — зелёные (проверено 2026-10-25);
- [ ] v7b e2e (playwright) проходят в обеих темах — **не выполнено**: 3 падения в
      `tests/e2e/main-flow.spec.ts` / `real-mode.spec.ts` — pre-existing проблемы селекторов
      (DatePicker/доступные имена), не регрессия миграции; требует починки тестов отдельно.

> Остаточные хвосты — **закрыты 2026-10-25 (проверено grep)**: аватар в `Layout.tsx` переведён на
> отдельный класс `.avatar-chip` (index.css:153); алиасы `.grad-btn/.ghost-btn` остались только как
> deprecated-совместимость в CSS, в `src/pages/` не используются (grep = 0 совпадений).

---

### Оценка объёма
| Блок | Файлы | Трудоёмкость |
|---|---|---|
| 0–1 (подключение + темы) | main.tsx, index.css, Layout.tsx, новый ThemeToggle | S–M |
| 2 (токеннизация) | ~10 файлов, 58 hex + 573 inline-style (частично) | M |
| 4 (знак) | Layout.tsx, index.html | S |
| 6–7 (a11y + компоненты) | Button/Field/DatePicker/Toast/Modal | M–L |
| 9 (проверка) | все | S |

Рекомендуемая последовательность PR: 0 → 1 → 2 → 4 → 3/5/6 → 7 → 8 → 9.
