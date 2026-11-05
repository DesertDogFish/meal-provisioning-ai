# Пачка багов: фронтенд-сборка в Docker падает на npm ci

Status: DONE
Created: 2026-11-05
Closed: 2026-11-05

## Цель

Починить `docker compose build frontend`: `npm ci` падает с `ERESOLVE` из-за
несовместимых peer-зависимостей (`eslint@10` vs `eslint-plugin-import@2.32.0`,
который поддерживает только `eslint ^9`).

## Подзадачи

- [x] BUG: `Dockerfile.frontend` → `RUN npm ci` падает `npm error code ERESOLVE`; в логе `peer eslint@"^2 || ... || ^9" from eslint-plugin-import@2.32.0`, а в проекте `eslint@^10.13.0`. Файлы: `package.json`, `package-lock.json`. Приёмка: чистый `npm ci` проходит без `--legacy-peer-deps`; `npm run lint` зелёный; `docker compose build frontend` успешен.
- [x] BUG: Docker-сборка фронтенда идёт на `node:20-alpine`, хотя `engines.node >=22` и CI на Node 22 → `npm warn EBADENGINE` для проекта, `@testing-library/jest-dom@7`, `rollup-plugin-visualizer@7`. Файлы: `Dockerfile.frontend`. Приёмка: `docker compose build frontend` без `EBADENGINE`; контейнер healthy.

## Заметки

- `eslint-plugin-import@2.32.0` — последняя версия, eslint 10 не поддерживает (проверено
  `npm view`). `eslint-plugin-jsx-a11y@6.10.2` — тоже максимум `^9`. Откат ESLint на 9
  отвергнут владельцем: остаёмся на 10.x.
- Замена `eslint-plugin-import` → `eslint-plugin-import-x@4.17.1` (peer `eslint ^8.57 || ^9 || ^10`),
  правила переименованы: `import/order` → `import-x/order`, `import/no-cycle` → `import-x/no-cycle`,
  плагин регистрируется как `import-x`.
- Замена `eslint-plugin-jsx-a11y` → `eslint-plugin-jsx-a11y-x@0.2.0` (peer `eslint ^9 || ^10`),
  пространство имён `jsx-a11y-x/`. Форк `@htmlacademy/eslint-plugin-jsx-a11y@6.11.0` отклонён:
  `engines.node >=24`, а Docker/CI на Node 22.
- В `eslint-plugin-jsx-a11y-x@0.2.0` `configs.recommended` содержит устаревший ключ
  `jsx-a11y-x/label-has-for`, которого нет в `rules` → ESLint падал «Could not find rule».
  В `eslint.config.js` recommended-правила фильтруются по наличию в `jsxA11y.rules`.
- ESLint 10 больше не приносит транзитивно `@eslint/js` и `globals` (lint падал
  `ERR_MODULE_NOT_FOUND`) — добавлены явные devDependencies `@eslint/js@^10.0.1`,
  `globals@^17.14.0`.
- ESLint 10 включает в recommended `no-useless-assignment` → в `src/pages/TripsPage.tsx`
  убраны мёртвые инициализаторы `let done = 0; let total = 0;` (все ветки ниже присваивают).
- `--legacy-peer-deps` в Dockerfile не используем: это маскирует конфликт, а не чинит.
- Зафиксированный range `eslint: ^10.13.0` разрешился в 10.14.0 (как и раньше — caret).

## Результаты (заполнить при закрытии)

- BUG 1 (ERESOLVE): `package.json`/`package-lock.json` переведены на ESLint 10 + совместимые
  форки плагинов; `eslint.config.js` обновлён (namespace, правила, фильтр recommended).
  Чистый `npm ci` — exit 0, `added 443 packages`, без `--legacy-peer-deps`.
  `npm run lint` — 0 errors / 995 warnings; `npm run typecheck:all` — passed; `npm run build` — passed;
  `npm test` — 144 files / 1133 tests, все passed.
- BUG 2 (Node 20): `Dockerfile.frontend` → `node:22-alpine@sha256:fe4f6d74…`, `docker compose build
  frontend` — exit 0, без `EBADENGINE`; `docker compose up -d --force-recreate --wait frontend` —
  `provision-frontend Up (healthy)`.
- Не проверялось: backend-тесты (backend не менялся), CI (не запускался).
- Риск к подтверждению: `eslint-plugin-jsx-a11y-x@0.2.0` — молодой форк (4 релиза, мейнтейнер
  es-tooling); при появлении официальной поддержки ESLint 10 в upstream вернуться на
  `eslint-plugin-jsx-a11y`.
