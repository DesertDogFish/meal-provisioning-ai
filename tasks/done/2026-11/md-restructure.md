# Задача: Реструктуризация MD под слабых агентов (дешёвые операции)

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02

## Цель
По запросу владельца: AGENTS.md — только важное + ссылки; «скиллы» в отдельной папке;
реестры backlog/knownbugs запрещены — всё в файлах-задачах; закрытие = `git mv` в done.

## Подзадачи
- [x] 1. Написать `skills/` (9 файлов ≤ 80 строк: README, create-task, fix-bug, testing,
      close-task, migrations, docs-sync, coding-rules, domain-rules).
- [x] 2. Переписать `AGENTS.md` (378 → 75 строк): золотые правила, карта папок,
      таблица «сценарий → скилл», ключ к старым ссылкам.
- [x] 3. Расформировать живые реестры: 43 карточки BL + KB-9/17/22 → 11 файлов-задач
      `tasks/` (тексты дословно, индекс-чекбоксы вверху); KB-10/16 → `skills/testing.md`
      + дословный архив `tasks/done/2026-11/kb10-kb16-env-recipes.md`.
- [x] 4. Перенести закрытое: 12 планов 2026-10 → `tasks/done/2026-10/`, план аудита
      02.11 → `tasks/done/2026-11/`, архивы реестров → `tasks/done/archive/registry-*.md`
      (FROZEN-баннер, не редактировать).
- [x] 5. Заглушки: `plans/backlog.md`, `plans/knownbugs.md`, `PLAN.md` (5–7 строк,
      «расформировано, иди в tasks/»).
- [x] 6. Живые доки: ссылки `plans/done/…` → `tasks/done/2026-10/…` (ARCHITECTURE,
      design-pack/components, README, backend/README); убраны устаревшие «baseline-красный
      EconomicConsistencyTest» и «LICENSE в процессе» (README), «этапы R0–R9 в PLAN.md»
      (ARCHITECTURE); DESIGN_MIGRATION.md отсутствует — из белого списка исключён.
- [x] 7. CI: сломанный non-blocking гейт «Check MD files» (ждал 4 файла) заменён
      blocking-гейтом «MD whitelist» по правилам `skills/docs-sync.md` (закрывает BL-45);
      YAML валиден, список файлов passes локально.

## Результаты
- Итог проверки белого списка (tracked+untracked MD): нарушителей 0.
- Комментарии кода (~90 файлов) с историческими ссылками `plans/…` НЕ правились
  намеренно — ключ дан в AGENTS.md (атрибуция, файлы лежат в `tasks/done/`, имя не менялось).
- Код и миграции не затрагивались — тестовые прогоны предыдущей задачи действительны.
- Не проверено: Workflow run (нет gh) — гейт «MD whitelist» провалидирован локально
  тем же grep+regex, что в шаге ci.yml.
- BL-45 и BL-60 закрыты этой реструктуризацией (помечены в `tasks/repo-hygiene.md`).
