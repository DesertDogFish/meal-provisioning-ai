# Пачка багов: шапки основных страниц (заголовок «Блюда», hero-блок с фоновой графикой)

Status: DONE
Created: 2026-11-03
Closed: 2026-11-04
Источник: bugs-inbox владельца 03.11.2026 (BUG-001, BUG-002), скриншоты в uploads/.
Каждый баг подтверждён осмотром `RecipesPage.tsx`, `ProductsPage.tsx`, `TripsPage.tsx`.

## Цель
Шапки основных страниц консистентны: крупный заголовок-название страницы, ниже строка
счётчиков/пояснения, справа иконочная кнопка действия; весь блок шапки — скруглённая
hero-карточка с ненавязчивой фоновой графикой (как glass-шапка похода, design-п.5).

## Подзадачи

- [x] 1. BUG-001: страница «Блюда» — пропал заголовок-название: счётчики
  «N блюд · M категорий» отрисованы ВНУТРИ h1 (Regression-надстройка над
  bugs-recipes-catalog п.1). Ожидание как на «Продукты»: h1 «Блюда», ниже строкой
  счётчики. Файлы: `src/pages/RecipesPage.tsx` (основной рендер ~строки 272–286:
  h1 со счётчиками → h1 «Блюда» + `<p>` со счётчиками; ветки loading/error
  ~строки 248–268 — тот же h1 «Блюда» вместо «Каталог блюд», чтобы шапка не
  меняла название при перезагрузке).
  Приёмка: RED — кейс в `src/pages/RecipesPage.test.tsx`: h1 страницы = «Блюда»,
  а счётчики «N блюд · M категорий» — в подписи ПОД h1 (не внутри h1) — падает;
  GREEN — после правки; соседние кейсы каталога зелёные.

- [x] 2. BUG-002: hero-шапка с фоновой графикой на «Походы», «Блюда», «Продукты» —
  заголовок + кнопка справа визуально отделены блоком с ненавязчивым арт-слоем,
  как glass-шапка похода (`TripDetailPage.tsx` + `.trip-header-glass` в index.css,
  утверждено владельцем 03.11.2026 в tasks/design-atmosphere-art.md п.5).
  Как чинить: новый общий компонент `src/components/PageHero.tsx` (R8: один
  компонент на три страницы, без дублей вёрстки): слои `page-hero__art`
  (aria-hidden, pointer-events:none, background-image = существующий арт
  `src/assets/atmosphere/camp-ready.webp` — новых бинарников не заводим) + вуаль
  градиентом bg-0 (как `.login-art-veil`/`.trip-header-glass__art`, opacity ≤ .45)
  + контент `page-hero__in`: h1 + subtitle слева, действия справа. CSS — в секции
  «Атмосфера» `src/index.css`; уважает prefers-reduced-motion (статичный фон —
  анимаций нет), печать без арта (@media print), светлая тема — вуаль плотнее.
  Файлы: `src/components/PageHero.tsx` (новый), `src/index.css`,
  `src/pages/TripsPage.tsx`, `src/pages/RecipesPage.tsx`, `src/pages/ProductsPage.tsx`
  (шапки + ветки loading/error — в тот же PageHero).
  Приёмка: RED — кейсы: `src/components/PageHero.test.tsx` (рендерит арт-слой
  aria-hidden + заголовок/подзаголовок/действия); в `TripsPage.create.test.tsx` /
  `RecipesPage.test.tsx` / `ProductsPage.filters.test.tsx` кейс «шапка страницы —
  hero-блок с арт-слоем» (data-testid page-hero + .page-hero__art в DOM) — падают;
  GREEN — после внедрения; lint+typecheck+build зелёные.

## Заметки
- 03.11.2026 п.1: h1 RecipesPage был со счётчиками внутри (надстройка bugs-recipes-catalog п.1) →
  h1 «Блюда» + подпись со счётчиками (паттерн ProductsPage); ветки loading/error тоже «Блюда».
  Защищено: RecipesPage.test.tsx «п.1 (rev 03.11.2026, BUG-001)».
- 03.11.2026 п.2: новый компонент src/components/PageHero.tsx (R8: один на 3 страницы) +
  CSS .page-hero в секции «Атмосфера» (арт camp-ready.webp, вуаль, печать без арта, light-тема
  плотнее); внедрён в TripsPage/RecipesPage/ProductsPage во всех ветках (loading/error/main).
  Защищено: PageHero.test.tsx (2) + hero-кейсы в RecipesPage/TripsPage.create/ProductsPage.filters.
  Прогоны: vitest 5 файлов 42/42 GREEN (RED был 6 кейсов), соседи 45/45.
