# Задача: типизировать мок-слой фронтенда (убрать `any`)

Status: READY
Created: 2026-11-06
Closed:

## Цель
В `src/` **425** вхождений `: any` / `as any`. Больше всего — в мок-слое, который
изображает ответы API: именно там `any` маскирует расхождения с реальными DTO,
и такие расхождения ловятся только руками (или вообще не ловятся).
Привести ключевые мок-файлы к типам из `src/types` и включить проверку.

## Подзадачи
- [ ] 1. `src/api/mockCatalog.ts` (30) — типизировать фабрики данных по DTO каталога; приёмка: 0 `any` в файле, `npm run typecheck` чист, `npm test` зелёный.
- [ ] 2. `src/api/mockComposition.ts` (28) — то же для состава блюда; приёмка: 0 `any`, typecheck+tests чистые.
- [ ] 3. `src/api/mockTripsPart1.ts` (24) — типизировать поход/дни/приёмы; приёмка: 0 `any`, тесты `TripDetail*`/`trips*` зелёные.
- [ ] 4. `src/api/mockTripProgress.ts` (18) — типизировать прогресс; приёмка: 0 `any`, typecheck чист.
- [ ] 5. `src/api/mockServer.ts` (14) + `mockSnapshot`/`mockRecipesCrud`-тесты — типизировать роутер и хелперы; приёмка: суммарно 0 `any` в этих файлах, `npm test` зелёный.
- [ ] 6. Включить гейт: в `package.json` добавить скрипт `typecheck:no-any` (grep по `: any` с явным allowlist) или правило eslint `@typescript-eslint/no-explicit-any: warn` с порогом; приёмка: скрипт падает на новом `any` в `src/api/`.

## Заметки
Замер 06.11.2026: `grep -rc ": any\b\|as any\b" --include='*.ts' --include='*.tsx' src` →
425 всего; топ: `mockCatalog.ts` 30, `mockComposition.ts` 28, `mockTripsPart1.ts` 24,
`mockTripProgress.ts` 18, `checklist.test.ts` 18, `mockServer.ts` 14.
Правило R9 (`skills/coding-rules.md`) запрещает `any` в новом коде — старый слой остался.
Не трогать тестовые `any` в этой задаче (они дешёвые для чтения), только `src/api/mock*` и `mockServer`.

## Результаты (заполнить при закрытии)
