# Задача: R8 — разбить оставшиеся файлы больше 500 строк

Status: DONE
Created: 2026-11-06
Closed: 2026-11-06

## Цель
Правило R8 (`skills/coding-rules.md`): файл ≤ 500 строк, цель — 300. После рефакторинга
`EconomicConsistencyTest` и `ShoppingListCalculator` осталось пять файлов за лимитом.
Разбить их по ответственности, поведение и тестовое покрытие не менять.

## Подзадачи
- [x] 1. `RosstatEmisProviderTest.java` (845) — вынести разбор ответов/фикстуры в support-класс.
  Итог (руками, ветка `ai-fixes`): `RosstatEmisProviderTest` 365 + `RosstatEmisProviderParsingTest` 172
  + `RosstatEmisProviderTransportTest` 151 + `RosstatTestFixtures` 245. 37 `@Test` = 20+9+8.
  Прогон трёх классов: `Tests run: 37, Failures: 0, Errors: 0`, BUILD SUCCESS.
- [x] 2. `src/components/TripDetailComponents.test.tsx` (672) — разнести по компонентам.
  Итог: 444 + `TripDetailComponentsTabs.test.tsx` 308. Проверено прогоном: 33 теста (21+12), зелёные.
- [x] 3. `SdmxStreamParserTest.java` (596) — вынести SDMX-фикстуры в хелпер.
  Итог: 494 строки, 17 `@Test`, `SdmxTestXml` 107 строк. Класс отдельно не прогонял — полный сьют зелёный.
- [x] 4. `ShoppingListCostAggregationBugTest.java` (590) — happy-path и regression классы.
  Итог: `...HappyPath` 337 (2 `@Test`) + `...Regression` 312 (3 `@Test`), монолит удалён.
- [x] 5. `scripts/kanban_blocked_triage.py` (710) — классификатор и health-check'и в `scripts/triage/`.
  Итог: `classifier.py` 383 + `health.py` 333, главный файл — шим 2 строки.
  Проверено: `python scripts/test_kanban_blocked_triage.py` → `Ran 6 tests, OK`.

## Заметки
Измерено 06.11.2026 командой `find src backend/src scripts -name '*.ts' -o -name '*.tsx' -o -name '*.java' -o -name '*.py' -exec wc -l`.
Другие файлы >500 строк отсутствуют — рефакторинг R8 в остальном закрыт (коммит `6ff46c53`).
Разбиение тестовых файлов делать без изменения assertions: сверять число `@Test` до/после.

Урок по автоматизации: воркер `coder` дважды резал Rosstat-файл «на глаз» и ломал компиляцию.
Рабочий путь — разбивать по границам членов класса (закрывающая строка ровно `    }`) скриптом,
а не правкой вручную, и после каждого шага проверять `test-compile`.

## Результаты (заполнить при закрытии)
Все пять файлов ≤ 500 строк. Работа лежит в ветке `ai-fixes` (worktree `.worktrees/ai-fixes`),
файлы воркера — в основной копии; ни то ни другое не закоммичено.
