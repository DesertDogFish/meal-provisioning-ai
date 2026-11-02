# Задача: Docker/nginx hardening (compose, заголовки, пины образов)

Status: READY
Created: 2026-11-02
Closed:
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [ ] BL-35. Снять `continue-on-error` с security-сканов, починив compose и nginx (M).
- [ ] BL-38. nginx: CSP и security-заголовки, XFF, gzip, кэш ассетов, таймауты (M).
- [ ] BL-50. Docker/compose hardening (M, пересекается с BL-35). Что сделать: запинить все

## Карточки (текст перенесён дословно)

- **BL-35. Снять `continue-on-error` с security-сканов, починив compose и nginx** (M).
  Что сделать: в `docker-compose.yml` для всех сервисов — `security_opt:
  ["no-new-privileges:true"]`, `cap_drop: [ALL]` (+ явный `cap_add` для nginx при необходимости),
  `read_only: true` с `tmpfs` для `/var/cache/nginx`, `/var/run`, `/tmp`, `pids_limit`,
  `logging` с `max-size: 10m, max-file: 3`; проверить, что `-XX:HeapDumpPath` backend указывает
  на writable-том; `Dockerfile.frontend` → non-root (`nginxinc/nginx-unprivileged` или `USER 101`
  + порт 8080); убрать из nginx `Upgrade`/`Connection`-заголовки и `proxy_cache_bypass`
  (WebSocket нет — это и есть «H2C»-находка Semgrep); Trivy на релизный тег + `.trivyignore`
  с обоснованием каждой строки; Semgrep — локальный прогон и baseline-файл; Dependency Review —
  включить dependency graph в настройках репозитория. Критерий приёмки: в job'е `Security Scans`
  есть хотя бы один блокирующий шаг; `docker compose up` поднимается с `read_only: true` и
  зелёными healthcheck; `docker exec provision-frontend id` → не-root. Источник: внешний аудит 30.10.2026, AU-09 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-38. nginx: CSP и security-заголовки, XFF, gzip, кэш ассетов, таймауты** (M).
  Что сделать: заголовки `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (или CSP
  `frame-ancestors 'none'`), `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: geolocation=, camera=, microphone=`, `server_tokens off`; CSP
  начать с `Content-Security-Policy-Report-Only` и только затем enforcing (учесть инлайн-SVG
  в `BrandMark.tsx` и boot-лоадер в `index.html` — понадобится `'unsafe-inline'` либо вынос
  скрипта в файл с nonce; Google Fonts — явный `font-src`/`style-src`);
  `proxy_set_header X-Forwarded-For/X-Forwarded-Proto/X-Real-IP` + в бэкенде
  `server.forward-headers-strategy: framework` (без этого Spring заголовкам не доверяет —
  только тогда возможна блокировка по IP как второй эшелон к rate limiting); gzip для
  css/js/json/svg; `expires 1y` + `Cache-Control: public, immutable` для `/assets/` и
  `no-store` для `index.html`; `proxy_read_timeout/proxy_send_timeout 300s` и
  `proxy_request_buffering off` для `/api`; `limit_req_zone`/`limit_req` на
  `/api/v1/auth/login`; smoke-шаг в `docker-stack.yml`, проверяющий заголовки через `curl -I`.
  Критерий приёмки: `curl -I` на `/` и `/assets/index-*.js` возвращает ожидаемые заголовки;
  CSP не ломает boot-лоадер, шрифты, SVG-брендмарк и печать `/trips/:id/print`; в логе
  бэкенда виден реальный IP клиента; шаг проверки заголовков есть в CI. Источник: внешний аудит 30.10.2026, AU-12 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-50. Docker/compose hardening** (M, пересекается с BL-35). Что сделать: запинить все
  `FROM`/`image` по digest (`@sha256:…`) с комментарием о версии и обновлять пин через
  Dependabot (BL-36); `HEALTHCHECK` в оба Dockerfile; `restart: unless-stopped` и `logging`
  с `max-size: 10m, max-file: 3` для всех сервисов; `mem_limit` для postgres и frontend
  (для backend уже есть — BL-18); non-root в frontend-образе; `-XX:HeapDumpPath` на
  writable-том при `read_only: true`. Критерий приёмки: `docker compose config` и
  `docker-stack.yml` зелёные; `docker exec provision-frontend id` → не-root;
  `up && down && up` воспроизводим на другом хосте; плавающих тегов в образах нет. Источник: внешний аудит 30.10.2026, AU-25 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

(заполняется при закрытии)
