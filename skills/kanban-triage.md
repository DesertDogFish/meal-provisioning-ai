# Skill: Kanban — разбор заблокированных задач (triage)

Автоматический разбор задач в статусе `blocked` на доске Hermes Kanban.
Реализация: `scripts/kanban_blocked_triage.py`, тесты: `scripts/test_kanban_blocked_triage.py`.

## Когда запускать

- периодически (каждые 5 минут) — `--trigger cron`;
- разово после починки инфраструктуры — `--trigger manual`;
- сначала всегда `--dry-run`: он классифицирует блокеры, но ничего не меняет.

## Команды

```bash
npm run kanban:triage:dry          # только классификация, без unblock/комментариев
npm run kanban:triage              # боевой прогон: unblock + комментарий + JSON-отчёт
python scripts/kanban_blocked_triage.py --board default --trigger cron
```

Коды выхода: `0` ок, `1` среда/конфиг или упал `kanban list`, `2` частичный сбой, `3` уже выполняется (lock).

## Что разблокируется автоматически

| `block_kind` | Условие автounblock |
|---|---|
| `transient` (timeout, 503, connection refused, deadlock, spawn failed) | health-check `kanban_db` (+`docker`/`postgres`, если они в причине) проходит |
| `capability` (permission denied, not found, unauthorized, credential) | проверка `env` + `kanban_db` (+`docker`/`postgres`) проходит |
| `dependency` | все прямые родители `done`/`archived` |
| `needs_input` | только явный маркер человека в комментарии после блокировки: `triage-resolution: unblock`, `resolution: approved`, `unblock approved` |
| `unknown` | никогда — только эскалация |

Дополнительно: `current_run_id` пуст, `block_recurrences < 2`, `consecutive_failures < max_retries`.
Всё остальное уходит в эскалацию: комментарий `triage: escalation` + файл
`triage-escalations-<ts>.json` с `recommended_action` и `suggested_next_step`.

## Чего скрипт НЕ делает

- Не трогает `ready`/`review`: незаспавненные карточки и сторож `blocker_auth`
  (устаревший rate-limit в `tasks.last_failure_error`) — отдельная история.
- Не меняет БД напрямую: только `hermes kanban` CLI; единственное чтение SQLite —
  `PRAGMA integrity_check` в health-check.
- Не запускается из контекста воркера (`HERMES_SUPERVISED_CHILD` / `HERMES_DELEGATED_CHILD_CONTEXT` → выход `1`).

## Переменные

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `HERMES_KANBAN_DB` | `~/.hermes/kanban.db` | БД доски |
| `HERMES_KANBAN_BOARD` | `default` | slug доски |
| `TRIAGE_MAX_TASKS` | `200` | лимит сканирования |
| `TRIAGE_DRY_RUN` | `false` | dry-run без изменений |
| `TRIAGE_STATE_PATH` / `TRIAGE_LOG_PATH` | `~/.hermes/kanban/triage_state.json` / `triage.log` | идемпотентность и лог (JSON Lines) |

## Траблшутинг

- Повторная обработка той же блокировки не происходит: fingerprint пишется в state и в
  скрытый маркер комментария `<!-- triage-fingerprint: ... -->`.
- `triage already running` — висит `~/.hermes/kanban/triage.lock`; проверить, что процесс не идёт, и удалить.
- `escalation_age_exceeded: true` в payload — задача висит дольше суток, нужен человек.
