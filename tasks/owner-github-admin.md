# Задача: Задачи владельца (нужен GitHub Admin)

Status: READY
Created: 2026-11-02
Closed:
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [ ] BL-39. Branch protection + conventional commits + запрет push в основную ветку (S).
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

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

(заполняется при закрытии)
