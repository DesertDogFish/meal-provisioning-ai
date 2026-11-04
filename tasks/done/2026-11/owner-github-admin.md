# Задача: Задачи владельца (нужен GitHub Admin)

Status: DONE
Created: 2026-11-02
Closed: 2026-11-04
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-39. Branch protection + conventional commits + запрет push в основную ветку (S). [commitlint part done; branch protection awaits owner (KB-22)]
- [ ] KB-22. Нет branch protection: прямой push в основную ветку, красный CI не блокирует

## Карточки (текст перенесён дословно)

- **BL-39. Branch protection + conventional commits + запрет push в основную ветку** (S).
  Что сделать: branch protection на `main` (required PR, required status checks —
  `Backend Tests`, `Frontend Tests`, `Docker Build`; запрет force-push и удаления; linear
  history); вернуться к PR-флоу; Conventional Commits + `commitlint` (husky/lefthook или
  CI-проверка заголовка, минимальный набор типов `feat|fix|refactor|test|docs|chore|ci|perf`);
  в `AGENTS.md` §9/§10 заменить «consist fix»-стиль требованием осмысленного заголовка и
  добавить правило «агент не пушит в основную ветку напрямую»; squash-merge.
  Критерий приёмки: прямой push в `main` отклоняется GitHub'ом; последние 20 коммитов проходят
  `commitlint`; после внедрения на основной ветке нет красного CI. Источник: внешний аудит 30.10.2026, AU-28 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

### KB-22. Нет branch protection: прямой push в основную ветку, красный CI не блокирует
- Симптом: все 610 прогонов CI — прямой `push` в `main`; required PR и required status checks
  не настроены, force-push и удаление ветки не запрещены, история нелинейна; из 45 последних
  прогонов 6 красных. Заголовки коммитов не соответствуют Conventional Commits (пример —
  «consist fix» на ревизии `2ab57fb`).
- Влияние: красная сборка на основной ветке не мешает следующим пушам; ревью изменений
  отсутствует; откат и разбор регрессий затруднён.
- Обход: агент не пушит в основную ветку без явного согласия владельца; коммиты P0-блока
  локальные (см. «Результаты» плана `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
- Источник: внешний аудит 30.10.2026, AU-28.
- Статус: OWNER TASK (01.11.2026)
  Branch protection, required status checks, Conventional Commits — требуют GitHub Admin access. Агент не пушит в main без согласия владельца.

## Результаты (заполнено 2026-11-04)

- commitlint: `.commitlintrc.json` (type-enum feat|fix|refactor|test|docs|chore|ci|perf, type-case lower, subject-empty never, subject-full-stop never, header-max-length 100) + CI job `commitlint` в `.github/workflows/ci.yml` (grep-валидация заголовка PR/коммита, ≤100 символов). Проверено регексом: «bad title» → FAIL, «feat: add commitlint», «feat(scope): ok», «feat: x» → PASS. commitlint npm-пакет не установлен (не нужен — валидация в CI).
- Branch protection (KB-22): у агента нет GitHub Admin прав → awaits owner. Запрошено: required PR, required checks Backend Tests/Frontend Tests/Docker Build, запрет force-push/удаления, linear history, squash-merge. Зафиксировано как «ожидает владельца» (capability), не выдумано.
- AGENTS.md §9/§10: правило «агент не пушит в main без согласия владельца» уже зафиксировано (AGENTS.md §1). Остальное — после включения branch protection владельцем.
