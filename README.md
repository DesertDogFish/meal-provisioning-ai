# Provision — система планирования питания для походов

Веб-приложение для планирования питания в походах и яхтенных путешествиях: каталог продуктов и рецептов, планирование походов по дням и приёмам пищи, расчёт закупок, стоимости (план/факт) и калорийности. Каждый поход работает с изолированным снепшотом каталога: правки справочника и цен админом не переписывают спланированные походы (см. `ARCHITECTURE.md`, раздел V20).

## Возможности

- **Каталог продуктов** — 204 позиции: крупы, консервы, сублиматы, молочное, свежие овощи/фрукты (яхта), орехи, напитки, специи и непищевые хозтовары; фасовка (`pack_size`, `round_to_packs`), калорийность на 100 г/мл, цены РФ с историей (24 месяца) и единицами KG/L/PCS/PACK
- **Каталог блюд** — 201 рецепт для костра, горелки и яхты (каши, супы, вторые, бутерброды, перекусы, выпечка, напитки с вариациями «чай с сахаром/без» и т.п.); калорийность считается из продуктов (CR-1)
- **Админ-режим каталога** — создание/редактирование/удаление продуктов и блюд включая состав (редактор блюда с поиском ингредиентов и live-калорийностью); удаление занятого в походах больше не блокируется походами (снепшоты)
- **Походы** — дни и приёмы пищи, people-override на день и приём, меню/закупки/сводки; при добавлении приёма пищи поход получает копию блюда и продуктов (план замораживается)
- **Состав приёма под себя** — добавить/исключить/изменить количество/заменить ингредиент без правки каталога (batch PUT на сервер); факт-цены из чека сохраняются и применяются во всех сводках; правка состава/количества в походе сбрасывает введённый чек и «взято» по затронутым позициям (другое количество — другая цена, надо переввести)
- **Закупки** — агрегация по дням и на поход, округление до упаковок (ceil, излишек), план/факт с дельтой, факт-цены через чеки (ввод чека — по категориям, алфавит), исключения позиций, правки состава приёма (добавить/исключить ингредиент, замены) с отражением в карточках меню, чеклист закупки в упаковках по категориям (поле «беру» предзаполнено расчётным количеством), ручные позиции (продукты к дню/ко всему походу: аптечка, антисептик и т.п.); цена, введённая в чеке, делает позицию «с ценой» во всех сводках
- **Интеграции** — импорт продуктов и цен из Open Food Facts (стагинг + approve/reject, журнал синков, авторизация OFF через ENV)
- **Аккаунты** — регистрация, JWT (access + refresh с ротацией), роль ADMIN; демо-учётки и демо-походы для локальной разработки

### Страницы приложения

| Маршрут | Что там |
|---|---|
| `/login` | Вход и регистрация |
| `/dashboard` | Обзор походов |
| `/trips`, `/trips/:id` | Список и карточка похода: меню по дням (с правками состава), закупка на поход (сортируемая) и по дням, «на человека», чеки (план/факт), чеклист закупки в упаковках, продукты к дню/походу |
| `/products` | Каталог продуктов (ADMIN: CRUD + цена срезу) |
| `/recipes` | Каталог блюд (ADMIN: создание/редактирование/удаление с составом) |
| `/integrations` | Импорт из Open Food Facts (ADMIN) |
| `/admin`, `/sync-logs` | Цены/импорт/стагинг, журнал синхронизаций (ADMIN) |

## Запуск одной кнопкой

Требуется: Docker (Desktop или Engine + Compose v2) и git.

```bash
git clone https://github.com/DesertDogFish/meal-provisioning-ai.git
cd meal-provisioning-ai
cp .env.example .env
# в .env замените JWT_SECRET на собственный (обязательно, иначе стек не поднимется):
#   openssl rand -base64 48
docker compose up --build
# дождаться, пока все сервисы станут healthy (2–3 минуты): docker compose ps
```

- Приложение: http://localhost:3000
- Health API: http://localhost:8080/api/v1/meta (`"db":"ok"`; 503 при недоступной БД)
- Swagger: http://localhost:8080/swagger-ui.html (profile `dev`)

Порт PostgreSQL проброшен только на `127.0.0.1:5432`. Миграции Flyway (V1–V20) применяются при старте бэкенда, каталог сеется автоматически.

### Первый вход и демо-данные

Готовых учётных записей в проде нет: первый пользователь создаётся через «Регистрация».

Для локальной разработки при `SEED_DEMO_USERS=true` (в `.env.example` включено; в compose по умолчанию `false`; работает только в profile `dev`) создаются:

| Учётная запись | Пароль | Роль | Демо-походы |
|---|---|---|---|
| `admin@provision.app` | `provision123` | ADMIN | «Осенний Кавказ: Архыз» (прошедший, 4 чел., факт-цены и замена в составе), «Яхта Хорватия: Сплит — Хвар — Вис» (7 дней, 6 чел., день с people-override) |
| `user@provision.app` | `provision123` | USER | «ПВД Карелия: Ладожские шхеры» (2 дня, 2 чел.) |

Демо-походы наполнены меню и работают на снепшотах каталога (V20), как и любые пользовательские походы.

> ⚠️ Для публичного сервера: `SEED_DEMO_USERS=false` и `SPRING_PROFILES_ACTIVE=prod` — пароли демо-учёток открыты в репозитории.

## Профили Spring

| Профиль | Назначение |
|---|---|
| `dev` (по умолчанию в compose) | DEBUG-логи, Swagger, сид демо-данных при `SEED_DEMO_USERS=true` |
| `prod` | WARN/INFO-логи, Swagger отключён, ошибки без detail, actuator только health/info |

Активация: `SPRING_PROFILES_ACTIVE` в docker-compose или `--spring.profiles.active=prod`.

## Переменные окружения

Все настройки берутся из `.env` (файл не коммитится; шаблон — `.env.example`):

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `POSTGRES_PASSWORD` | `provision123` | Пароль БД (локально допустимо; для публичного хоста смените) |
| `JWT_SECRET` | **обязательна** | Подпись JWT; без неё compose/бэкенд падают fail-fast. Минимум 32 символа: `openssl rand -base64 48` |
| `SPRING_PROFILES_ACTIVE` | `dev` | Профиль бэкенда |
| `SEED_DEMO_USERS` | `false` (в compose) / `true` (в `.env.example`) | Демо-пользователи и демо-походы (только `dev`) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Origins для прямых запросов к API (вне nginx-прокси) |
| `OFF_USER_ID`, `OFF_PASSWORD` | пусто (анонимный режим) | Учётка world.openfoodfacts.org для обхода лимитов 429/503. **`OFF_USER_ID` — USERNAME аккаунта, не email** (дока OFF: «You must not use your email address») |
| `OFF_CONTACT_EMAIL` | пусто (дефолт `support@provision.app`) | Email-контакт для User-Agent (формат OFF `AppName/Version (ContactEmail)`) |
| `OFF_PROXY_URL` | пусто (напрямую) | Прокси для всех запросов OFF: `http://host:port` или `socks5://host:port`. Спасает, когда провайдер режет TLS до `search.openfoodfacts.org` (curl (35) / «Remote host terminated the handshake»). Прокси на хост-машине из контейнера: `http://host.docker.internal:PORT` |
| `VITE_API_URL`, `VITE_API_MODE` | `/api/v1`, `real` в Docker-сборке | Подставляются **при сборке** фронта; режим: `auto` / `real` / `mock` |
| `VITE_MOCK_LATENCY_MS` | `100` | Базовая имитация задержки mock-режима (мс, +до 80 мс джиттера); `0` — мгновенный mock. Подставляется при сборке фронта |

В Docker-стеке фронт ходит в API через nginx-прокси (`/api/` → backend), CORS не нужен. Приоритет выбора режима фронта: переключатель в UI (localStorage) → `VITE_API_MODE` → авто-пинг `GET /api/v1/meta`.

> OFF (Fix-11): поиск продуктов идёт через Search-a-licious (`search.openfoodfacts.org`),
> full-text в `/api/v2/search` официально отсутствует. Лимиты доки: 10 req/min/IP на поиск,
> 15 req/min/IP на карточки — провайдер тротлит сам (6.5 c между запросами). Рекомендуется
> заполнить [API usage form](https://docs.google.com/forms/d/e/1FAIpQLSdIE3D8qvjC_zRJw1W8OmuHhsWJ_NSckiiniAHlfaVwUZCziQ/viewform)
> (из доки OFF) — это снижает риск IP-банов.

## Деплой фронтенда на Vercel (демо без бэкенда)

Fix-10 (п.4): демо-деплой `https://meal-provisioning-ai.vercel.app/` работает в mock-режиме
(бэкенда на Vercel нет; `VITE_API_MODE=auto` сам falls back на mock). Что важно:

- **`vercel.json` (обязателен)** — SPA-rewrites всех маршрутов на `/index.html`: без него
  прямые заходы/refresh и PDF-отчёт (`/trips/:id/print`, открывается новой вкладкой)
  отдают 404 «нет такой страницы».
- **`tokens.css`/ассеты design-pack в сборке** — плагин `copy-design-pack-assets` (vite.config.js)
  копирует `provisions/design-pack/tokens.css`, `assets/preloader.svg` и `og-cover.png` в `dist/`:
  `<link>` на tokens.css и boot-лоадер в index.html ссылаются на них абсолютными путями
  (без копии — 404; сама тема дублируется JS-импортом tokens.css в main.tsx, поэтому
  визуально прод не ломался — 404 был косметическим, но boot-лоадеру SVG нужен файлом).
- **Скорость** — страницы грузятся ленивыми чанками (React.lazy + Suspense с брендовым
  `PageLoader`), mock-задержка уменьшена (100–180 мс вместо 200–400; `VITE_MOCK_LATENCY_MS=0`
  для мгновенного демо), Google Fonts грузится асинхронно (render-blocking запрос шрифтов
  на нестабильных сетях давал до ~30 c белого экрана), в `#root` встроен мгновенный
  boot-лоадер (SVG-парус design-pack — виден до загрузки JS).
- **Режим API** — `vercel.json` исключает `/api/` из SPA-rewrite, а `resolveMode` требует
  `content-type: json` для 'real': иначе SPA-фолбэк (200 + index.html) переключал бы
  приложение в 'real' и все запросы получали HTML.

## Технологический стек

- **Backend:** Java 17, Spring Boot 3.2.5 (Web, Security, Data JPA, Validation), PostgreSQL 15 + Flyway (V1–V20), JJWT, springdoc-openapi, MapStruct-free (ручные DTO), JUnit 5 + AssertJ + Mockito + Testcontainers/LocalPgFallback
- **Frontend:** React 18 + TypeScript + Vite, Tailwind 4, React Router, lucide-react, react-datepicker; раздаётся nginx
- **Инфраструктура:** Docker Compose (postgres + backend + frontend), GitHub Actions (CI, Docker Stack Smoke, contract parity nightly, e2e nightly)

## Разработка

```bash
# Бэкенд (Java 17; интеграционным тестам нужен Docker ИЛИ локальный PostgreSQL 15 —
# сьюты сами падают на LocalPgFallback; обязательно задайте JWT_SECRET)
cd backend
JWT_SECRET=$(openssl rand -base64 48) mvn test

# Фронтенд (корень репозитория — Vite-проект)
npm ci
npm run dev          # http://localhost:5173 (mock-режим фолбэком, если бэк недоступен)
npm run typecheck    # tsc --noEmit (гейт CI)
npm run lint         # eslint (гейт CI)
npm run test         # vitest (гейт CI)
npm run test:coverage# coverage-гейт R5: lines ≥80% per-file на зоне изменения
npm run test:e2e     # Playwright, mock-режим (real-режим: E2E_BASE_URL против compose-стека)
```

Гейты перед пушем: `mvn test` (baseline: `EconomicConsistencyTest` красный на master — см. PLAN.md, не чинится мимоходом), `typecheck`, `lint`, `test`, contract-паритет mock↔real для затронутых эндпоинтов.

### Частые проблемы

| Симптом | Что делать |
|---|---|
| backend долго не становится `healthy` | `docker compose logs backend` — ошибки БД/миграций |
| фронт отдаёт страницу, но данные не грузятся | `curl localhost:8080/api/v1/meta`, затем `docker compose logs frontend` |
| порт 3000/5432/8080 занят | поменяйте хостовую часть в `ports:` docker-compose.yml |
| нужна чистая БД после сбоя миграций | `docker compose down -v && docker compose up --build` (данные удаляются!) |
| после апгрейда со старых версий в БД остались демо-юзеры V14/V15 | удалите вручную: `DELETE FROM users WHERE email IN ('admin@provision.app','user@provision.app')` — либо используйте демо-сид (`SEED_DEMO_USERS=true`) |

## Остановка и очистка

```bash
docker compose down      # остановить (данные сохраняются)
docker compose down -v   # полностью, включая БД
```

## Лицензия

MIT (файл LICENSE в процессе добавления — см. PLAN.md, P1).
