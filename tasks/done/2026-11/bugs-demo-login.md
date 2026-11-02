# Пачка багов: не зайти демо-учёткой в docker-стенд

Status: DONE
Created: 2026-11-02
Closed: 2026-11-02
Источник: репорт владельца 02.11.2026 — «в логе напечатан `generated random demo password
for admin@provision.app`, но ни он, ни пароль из `.env` не подходят».

## Диагностика (воспроизведено на живом стенде)

Старт `provision-backend` даёт в одном логе две противоречащие строки:

```
WARN  DevDataInitializer : ADMIN_PASSWORD is not set — generated random demo password
                           for admin@provision.app: <случайный> (set ADMIN_PASSWORD ...)
INFO  DevDataInitializer : Demo user already exists, skipping: admin@provision.app
```

плюс `Unauthorized: Invalid email or password` на попытках входа. В БД —
`admin@provision.app` с `created_at = 2026-10-25` (запись живёт в volume `postgres_data`,
перезапуск её не пересоздаёт). То есть **напечатанный пароль никогда не сохранялся**, а
пароль из `.env` в контейнер вообще не попадал: `docker compose config` показывает у
backend только `SEED_DEMO_USERS`, без `ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`.

## Подзадачи

- [x] BUG: `.env`-пароли демо-учёток не доходят до контейнера — `docker-compose.yml`
  прокидывает `SEED_DEMO_USERS`, но не `ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`, поэтому
  заданный в `.env` пароль молча игнорируется и в лог идёт «ADMIN_PASSWORD is not set».
  Файлы: `docker-compose.yml`, `.env.example`. Приёмка: `docker compose config` показывает
  обе переменные у backend; логин с паролем из `.env` отдаёт 200.
- [x] BUG: лог печатает НЕДЕЙСТВИТЕЛЬНЫЙ пароль, и заданный пароль не применяется к
  существующему демо-юзеру: `resolvePassword()` вызывается ДО проверки существования, а
  `seedUser()` при существующей записи ничего не делает → случайный пароль из лога не
  сохранён (а на volume-БД он вообще никогда не сработает после первого старта).
  Файлы: `backend/src/main/java/com/provision/config/DevDataInitializer.java`,
  `backend/src/test/java/com/provision/config/DevDataInitializerTest.java`. Приёмка:
  red→green unit-тесты (существующий юзер + заданный пароль → хеш обновлён; существующий
  юзер + пустой пароль → ни генерации, ни записи) + реальный логин в docker.

## Заметки

- Второй баг — не косметика: без обновления хеша существующей записи прокидка переменных
  из `.env` не помогла бы (запись от 2026-10-25 всё равно осталась бы со старым паролем).
- Предложенное решение: при ЗАДАННОМ пароле (`ADMIN_PASSWORD`/`DEMO_USER_PASSWORD`) сид
  обновляет хеш существующего демо-юзера (dev-профиль, явное намерение оператора), при
  пустом — ничего не генерирует и не печатает, а пишет, что пароль НЕ менялся. Это
  изменение поведения сида (не только фикс) — подтверждено владельцем 02.11.2026
  (репорт + просьба починить, затем «всё там норм, кроме формулировки лога»).
- Затронут только профиль `dev`; публичный сервер (`SEED_DEMO_USERS=false`) не меняется.

## Результаты (02.11.2026)

- **Конфиг:** `docker-compose.yml` backend получил `ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}` и
  `DEMO_USER_PASSWORD: ${DEMO_USER_PASSWORD:-}`; `docker compose config` показывает обе
  переменные (значения compose маскирует как `***`). Без этих строк Spring видел пустые
  значения → «ADMIN_PASSWORD is not set» и пароль из `.env` не работал.
- **Код:** `DevDataInitializer.seedUser` — при существующей записи и ЗАДАННОМ пароле
  обновляет `passwordHash` и сохраняет; `resolvePassword()` (генерация + печать) вызывается
  только для НОВОЙ записи. Пустой env + существующий юзер → ни encode, ни save, в логе
  «password NOT changed». Роль существующей записи сохраняется.
- **Формулировка лога:** по замечанию владельца строка `password updated from
  DEMO_USER_PASSWORD: user@provision.app` читалась как «пароль = user@provision.app».
  Теперь email первым, значение из env в текст не подставляется:
  `Demo user already exists: <email> — password hash refreshed from <ENV>`.
- **Unit:** `DevDataInitializerTest` 6/6 GREEN, в т.ч. два новых: existing + configured →
  хеш обновлён без дубля; existing + empty → ни генерации, ни записи (плюс проверка, что
  ложной строки «generated random demo password» в выводе нет).
- **Живой стенд:** пересобранный образ на volume-БД от 25.10 → лог
  `Demo user already exists: admin@provision.app — password hash refreshed from ADMIN_PASSWORD`
  и то же для `user@provision.app`; `POST /api/v1/auth/login` с паролями из `.env` → HTTP 200
  для обеих учёток (тело: `accessToken` 304 символа, `refreshToken`, `tokenType`).
- **Документация:** `.env.example`, `README.md`, `application.yml` — описано поведение
  «задан → применяется и обновляется при перезапуске; пуст → только для новой записи».