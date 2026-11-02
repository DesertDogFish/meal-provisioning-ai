# Skill: доменные правила (походы, каталог, деньги)

Подробности и формулы — `ARCHITECTURE.md` (§Core Calculations, §Database, §API-контракт).
Здесь — обязательные следствия для нового кода (нарушение = баг).

## Снепшоты каталога (V20)
- Каталожные выборки (UI-справочники, админ) фильтруют `trip_id IS NULL`; выборки по
  id ингредиентов похода — НЕ фильтруют (это копии).
- Страницы похода читают блюда/цены ТОЛЬКО через `GET /trips/{id}/recipes` и
  `GET /trips/{id}/prices`; глобальные `/recipes`, `/prices` — для каталога/админа.
- Новые ссылки «поход → продукт/блюдо» создают trip-scoped копию через
  `TripCatalogSnapshotService`, иначе блокировки справочника.
- Уникальность имён продуктов — только среди глобальных (partial-индекс); копии с `code = NULL`.

## Деньги и ккал
- На клиенте НЕ пересчитываются: страницы похода читают `/summary/*`, клиент только
  форматирует (`formatRub`, `humanize`). Исключение — preview в админ-редакторах и
  live-итоги модалок до сохранения.
- Округление — строго по «Эталону округлений» в `ARCHITECTURE.md`; инвариант сумм
  (by-days = shopping = person-итоги) охраняет `EconomicConsistencyTest`.

## Mock-паритет (R3)
- Новые эндпоинты и семантики (latest-срез цен, снепшоты, composition batch PUT)
  реализуются в `src/api/mockServer.ts` В ТОЙ ЖЕ задаче + contract-тест.
- Mock-сводки `/summary/*` считают из meals/edits/exclusions, а не отдают фикстуры.
- Mock-режим помечается честно: `/meta` version = `'mock'`.

## Хранилища
- Данные похода — только сервер. НОВЫЕ localStorage/`tripStaging`-хранилища для правок,
  исключений и факта запрещены; существующие — долг (задача `tasks/ux-behavior.md`), не расширять.

## Auth (с 02.11.2026)
- Refresh: ротация mark-based (`revoked_at`/`replaced_by_id`, V36); предъявление отозванного
  токена = reuse → отзыв ВСЕЙ семьи + 401 + метрика `auth.refresh.reuse`.
- Хэш refresh — HMAC-SHA256 от производного ключа (label `provision-refresh-hash`),
  не сам JWT_SECRET. TTL — из `JwtProperties`, не хардкод.
- Пароль ≥ 8 (backend `RegisterRequest`, mock `mockAuth.ts`, фронт `PASSWORD_MIN_LENGTH`) —
  меняется только во всех трёх местах сразу.
- Side-effect перед броском исключения в `@Transactional` — с `noRollbackFor` (иначе откатится).

## Ошибки API
- Единый формат ProblemDetail (`GlobalExceptionHandler`); неизвестный API-путь → 404
  ProblemDetail (не 500); в prod `detail` внутренних исключений не отдаётся (стабильный код).
