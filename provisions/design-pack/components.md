# components.md — спецификации компонентов UI-кита

Эталонные реализации: `site/brand-book.html` (секция 09, интерактивная витрина)
и `site/index.html` (продуктовое применение). Поведение описано фреймворк-
агностично: переносится в React/Vue один в один (состояния → props/state).

Общее:
- Все размеры/цвета — токены (`tokens.css`). Скругления: карточки `--r-lg`,
  контролы `--r-md`/pill, чипы pill/`--r-sm`.
- Фокус: `:focus-visible` кольцо `2px var(--amber-500)`, offset 2px.
- Слои: поповеры `--z-pop`, модалка `--z-modal`, тосты `--z-toast`, nav `--z-nav`.
- Esc закрывает верхний оверлей; клик вне — закрывает поповер/селект;
  клик по оверлею — закрывает модалку; фокус возвращается триггеру.

---

## 1. Кнопки `.btn`
Варианты: `btn-primary` (grad-brand, текст `--on-fire`, `--shadow-glow`),
`btn-ghost` (прозрачная, `--line-strong`), `btn-soft` (`--bg-2`),
`btn-danger` (`--danger-soft` + `--danger`), размер `btn-sm`.
Состояния: hover (brightness/translateY −2px), active (translateY +1px),
disabled (opacity .45, pointer-events none), loading (спиннер `.spin` вместо
иконки, текст-глагол процесса, клики заблокированы).
Icon-button `.ibtn`: 42×42, `--r-md`, только иконка + обязательный `aria-label`
или тултип.

## 2. Поля `.inp`
Высота ≈ 46 px, `--r-md`, фон `--bg-0`, граница `--line-strong`.
Состояния: focus (граница `--amber-500` + кольцо 3 px 16 %), error (`.err`:
`--danger` + hint ошибкой), success (`.ok`: `--success`), disabled (opacity .5).
Hint `.hint` 12 px `--text-3` под полем; варианты `.err/.ok`.
Поиск: иконка-крестик справа внутри, клик очищает и возвращает фокус.

## 3. Селект `.sel`
Триггер — `.inp.sel-btn` с `aria-haspopup="listbox"` и стрелкой (поворот 180°
в открытом состоянии). Поповер `.sel-pop`: `--bg-2`, `--r-md`, тень `--shadow-1`,
опции `.sel-opt` (hover `--bg-3`; выбранная `aria-selected="true"`, цвет
`--amber-300`). Закрытие: выбор, клик вне, Esc. Выбранное значение пишется в
`[data-val]` триггера.

## 4. Date-range picker `.dp`  ← ключевой компонент
Структура: триггер-поле `[data-dp-field]` с `[data-val]`; поповер `.dp-pop`
(304 px): шапка (‹ месяц год ›), строка weekday `пн…вс`, сетка 7×6 `.dp-grid`,
пресеты `.dp-presets`.
Состояния дня `.dp-d`: `out` (соседний месяц, 45 %), `dis` (прошедшие,
pointer-events none), `today` (точка `--wave-400` внизу), `in` (внутри
диапазона, 14-16 % огня), `start`/`end` (grad-brand, `--on-fire`; скругления
половинок пилюли; `start.end` — пилюля целиком).
Алгоритм выбора:
1. клик без `start` или при полном диапазоне → `start = день`, `end = null`;
2. клик раньше `start` → `start = день`;
3. иначе → `end = день`, поповер закрывается через ~260 мс.
Hover при `start && !end` рисует превью (`in` + `end` на hover-дне).
Пресеты: «Выходные» (ближайшая сб–вс), «3 дня», «Неделя» от сегодня.
Листание месяцев: ‹ › ; прошедшие месяцы доступны для просмотра, дни — нет.
Формат поля: `D MMM — D MMM` (год, если отличается от текущего).
A11y: дни — `<button type=button>` с текстом числа; месяц в `aria-live`.

## 5. Свитч / чекбокс / радио
Свитч `.sw2`: 46×26 pill, ползунок 20 px; on → grad-brand + ползунок `--on-fire`;
`role="switch"`, `aria-checked`, клик и Space переключают.
Чекбокс `.ck`: бокс 20 px `--r-sm`, галочка `--on-fire` на grad-brand,
анимация scale .4→1; вход — скрытый `<input type=checkbox>`.
Радио `.ck.rd`: бокс-круг, точка 8 px.

## 6. Чипы `.chip2`
Множественный выбор: класс `on` (14 % огня + граница 45 % + текст `--amber-300`).
Удаление: внутренний `.x[data-rm]` убирает чип. «+ добавить» — тост-заглушка.

## 7. Сегменты `.seg` / табы `.tabs`
Сегменты: pill-контейнер `--bg-0`, активная кнопка grad-brand + `--on-fire`
(продуктовый случай) — переключает набор данных под собой.
Табы: активная `.on` (`--bg-3` + inset-граница), панели `.tabpane.on`
(display), связь `data-tab` ↔ `data-pane`.

## 8. Степпер `.step` и слайдер `.rng`
Степпер: pill, кнопки − / + (34 px круги), значение `<b>` (display-шрифт),
границы 1…12. Слайдер: `input[type=range]`, трек 6 px с заливкой до значения
(gradient через `--val`), thumb 20 px grad-brand + halo 4 px 18 %.
Оба пересчитывают зависимый прогресс (см. п. 9) — демонстрируем связность.

## 9. Прогресс / скелетон / спиннер
Бар: трек `--bg-3` 7 px pill, заливка grad-brand (или вода), transition width
`--t-slow`. Кольцо: svg circle, dasharray = доля × 2πr, rotate −90°.
Скелетон `.skl`: shimmer-градиент 200 %, 1.4 s infinite. Спиннер `.spin`:
14 px, кольцо 2.5 px, 0.8 s linear (вариант `.lt` для тёмных фонов).

## 10. Аккордеон `.acc`
Шапка `.acc-h` (flex, шеврон справа, поворот 180° в `.open`), тело `.acc-b`
с max-height-анимацией `--t-slow`. Один открытый не обязателен (независимые).

## 11. Тултип `[data-tip]`
CSS-only: `::after` с `content: attr(data-tip)` над элементом, `--bg-3`,
`--r-sm`, тень; показ по hover и `:focus-visible`; `white-space: nowrap`.

## 12. Тосты `.toast`
Контейнер `.toasts` fixed right/bottom 18 px, колонка, gap 10.
Тост: `.ok`/`.err` (иконка-кружок 22 px в soft-цвете), заголовок b + small,
прогресс-линия `.tbar` 4 s linear (цвет по типу), авто-дисмисс 4 s с fade+slide.
Новые — вниз стека; максимум 4, старые вытесняются.

## 13. Модалка `.modal`
Оверлей rgba + blur 6 px, `place-items:center`; карточка `--bg-1`, `--r-lg`(24),
тень глубже `--shadow-1`, анимация входа. Закрытие: Esc, оверлей,
`[data-modal-close]`. Фокус: первый контрол при открытии, возврат триггеру.

## 14. Навигационное крошево и пагинация
`.crumb`: ссылки `--text-2`, текущая `<b>` `--text-1`, разделитель `/` 50 %.
`.pg`: кнопки 36 px `--r-sm`, активная grad-brand + `--on-fire`; «…» не кнопка
действия; стрелки с `aria-label`.

## 15. Аватары и бейджи
`.ava`: 38 px круг, grad-заливы из палитры, текст `--on-fire`/ink, стек с
margin-left −10 px, «+N» на `--bg-3`. Бейдж `.badge`: pill, soft-вода;
`badge-fire` — soft-огонь.

## 16. Карточки и поверхности
`.card`/`.glass`: фон `--bg-1` (light) или градиент/стекло (dark), граница
`--line`, `--r-lg`, `--shadow-1`; hover-вариант: translateY −4 px +
`--line-strong`. Секции-подложки: `--grad-dusk` на body, зерно feTurbulence
5 % (3.5 % в light).

## 17. Волна-разделитель
Две svg-линии `--wave-600` (70 %/40 %), дрейф translateX −1200 px, 16 s/23 s
(reverse), linear infinite; reduced-motion — статична.

---

## Перенос в React (памятка)
`<DatePicker value={{start,end}} onChange min={today} presets=[…]>` —
состояния: `viewMonth`, `start`, `end`, `hover`; рендер сетки 42 ячейки;
внеший клик/Esc — через useEffect-listeners. Тосты — context + reducer
(add/remove, ttl 4000). Модалка — portal + focus-trap. Остальное —
контролируемые компоненты 1:1 к состояниям выше.
