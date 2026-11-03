# Задача: офлайн-режим и синхронизация (веб + Capacitor-обёртка)

Status: READY
Created: 2026-11-03
Closed:

## Цель
Сделать приложение полностью рабочим офлайн (чтение и запись) с синхронизацией с бэкендом при появлении сети, не ломая веб-версию. Мобильная обёртка (Capacitor) автоматически получает те же возможности, так как работает поверх web build.

## Архитектура (целевая)
- **Слой данных**: все вызовы API идут через `Repository` (единственный интерфейс). Реализации: `OnlineRepository` (fetch к бэкенду) и `OfflineRepository` (IndexedDB).
- **Локальная БД**: IndexedDB (Dexie.js) для web и Capacitor. Таблицы: products, recipes, trips, meals, shopping, checklist, users, syncQueue.
- **Синхронизация**: очередь изменений (`SyncQueue`), оркестратор (`SyncManager`), разрешение конфликтов (`ConflictResolver`), мониторинг сети (`NetworkMonitor`).
- **Service Worker**: кэш статики + API GET, background sync.
- **Аутентификация**: JWT в IndexedDB (зашифровано), refresh rotation.

## Этап 0 — Подготовка API-слоя (уже частично)
- [ ] 0.1. Вынести все вызовы `fetch`/`api.*` из компонентов в единый слой `src/api/` (уже есть `src/api/*.ts` — проверить полноту).
- [ ] 0.2. Ввести интерфейс `IRepository<T>` с методами `getAll`, `getById`, `save`, `delete`, `sync`.
- [ ] 0.3. Создать `src/repositories/OnlineRepository.ts` — обёртка над текущим API.

## Этап 1 — Локальная БД (IndexedDB)
- [ ] 1.1. Добавить зависимость `dexie` (или `idb`).
- [ ] 1.2. Создать `src/db/schema.ts` — схема таблиц (products, recipes, trips, meals, shopping, checklist, users, syncQueue).
- [ ] 1.3. Создать `src/db/indexedDb.ts` — инициализация Dexie, миграции версий.
- [ ] 1.4. Создать `src/repositories/OfflineRepository.ts` — реализация `IRepository` поверх IndexedDB.
- [ ] 1.5. Добавить unit-тесты для IndexedDB-репозиториев.

## Этап 2 — Синхронизация
- [ ] 2.1. Создать `src/sync/SyncQueue.ts` — очередь изменений (create/update/delete) с метаданными (timestamp, entity, id).
- [ ] 2.2. Создать `src/sync/ConflictResolver.ts` — разрешение конфликтов при 409 (optimistic locking): стратегия "server wins" / "client wins" / "merge".
- [ ] 2.3. Создать `src/sync/SyncManager.ts` — оркестрация: при появлении сети отправить очередь, обработать ответы, обновить локальную БД.
- [ ] 2.4. Создать `src/sync/NetworkMonitor.ts` — отслеживание online/offline (navigator.onLine + fetch probe).
- [ ] 2.5. Добавить интеграционные тесты синхронизации (mock-сервер).

## Этап 3 — Service Worker и кэширование
- [ ] 3.1. Расширить `src/pwa/sw.js`: кэшировать GET-ответы API (network-first, fallback to cache).
- [ ] 3.2. Добавить background sync API для отправки очереди.
- [ ] 3.3. Обновить `src/pwa/manifest.json` (если нужно) для офлайн-режима.

## Этап 4 — Аутентификация офлайн
- [ ] 4.1. Хранить JWT (access + refresh) в IndexedDB (зашифровано, ключ из пароля или device).
- [ ] 4.2. Реализовать refresh rotation при появлении сети.
- [ ] 4.3. Логин-форма: при офлайн — показать "нет сети, попробуйте позже" или использовать кэшированные данные.

## Этап 5 — UI и UX
- [ ] 5.1. Добавить индикатор статуса (онлайн/офлайн/синхронизация) в шапку.
- [ ] 5.2. Добавить кнопку "Синхронизировать" в настройки.
- [ ] 5.3. Диалог разрешения конфликтов (при 409 показать diff и выбор).
- [ ] 5.4. Офлайн-баннер: "Вы офлайн, изменения сохранены локально".

## Этап 6 — Тестирование
- [ ] 6.1. Unit-тесты репозиториев (online/offline).
- [ ] 6.2. E2E офлайн-сценарии (Playwright с network throttling).
- [ ] 6.3. Тесты конфликтов (409, merge).

## Этап 7 — Мобильная обёртка (Capacitor)
- [ ] 7.1. Добавить плагин `@capacitor/network` для отслеживания сети.
- [ ] 7.2. (Опционально) Добавить `@capacitor-community/sqlite` для нативного SQLite вместо IndexedDB.
- [ ] 7.3. Обновить `meal-provisioning-mobile/scripts/pull-web.ps1` для копирования web build с офлайн-ассетами.
- [ ] 7.4. Тестировать APK на реальном устройстве.

## Заметки
- Веб-приложение остаётся веб-приложением; офлайн-слой — это улучшение, а не замена.
- Capacitor-обёртка просто копирует `www` из `meal-provisioning-ai/dist` — все изменения web-кода автоматически попадают в APK.
- Не начинать с нативного SQLite: IndexedDB работает и в web, и в Capacitor (через WebView). Нативный SQLite — оптимизация, не обязательность.
- Оптимистичная блокировка (409) уже реализована на бэкенде — использовать как основу для конфликтов.

## Результаты (заполнить при закрытии)
