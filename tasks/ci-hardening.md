# Задача: CI: e2e в CI, coverage-гейт фронта, dependabot, версии Java/Actions

Status: READY
Created: 2026-11-02
Closed:
Источник: реестр `plans/backlog.md`/`plans/knownbugs.md` (расформированы 02.11.2026 —
старый формат; номера BL-n/KB-n сохранены для преемственности, правила — `skills/create-task.md`).

## Состав (индекс — отмечать здесь; подробности в карточках ниже)

- [x] BL-32. Прогнать e2e в CI обычным test-runner'ом. Что сделать: `npm run test:e2e`
- [x] BL-33. Починить E2E-nightly и отделить real-mode от mock-прогона (M). Что сделать:
- [ ] BL-34. Включить coverage-гейт R5 в CI и расширить whitelist (M). Что сделать: шаг
- [x] BL-36. Dependabot + `npm audit` в CI + фикс текущих CVE (S). Что сделать:
- [x] BL-37. Одна версия Java в pom, CI, nightly и Dockerfile (S). Что сделать: выбрать одну
- [x] BL-51. Обновить GitHub Actions и запинить runner-образ (S). Что сделать: поднять actions

## Карточки (текст перенесён дословно)

- **BL-32. Прогнать e2e в CI обычным test-runner'ом.** Что сделать: `npm run test:e2e`
  (проекты `chromium`, `mobile-390`, `mobile-360` — `playwright.config.ts`) в workflow и
  убедиться, что `e2e/mobile.spec.ts` (M-01…M-09) и `e2e/main-flow.spec.ts` (E2E-10) зелёные;
  в песочнице агента test-runner не стартует из-за OOM (ограничение среды), проверки
  делались библиотечным запуском chromium. Критерий приёмки: workflow run с e2e-джобой
  зелёный, при падении публикуется артефакт `playwright-report/`.
  Источник: подзадача 10 плана `tasks/done/2026-10/2026-10-29-ui-nowrap-and-mobile.md`.
  Статус: READY

## Внешний аудит 30.10.2026 (P1/P2/P3)

Задачи внешнего аудита, не вошедшие в P0-блок (он закрыт планом
`tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`). Приоритет и оценка — из аудита:
**S** ≤ 0.5 дня · **M** 1–2 дня · **L** 3–5 дней · **XL** > 5 дней. Задачи XL (BL-40, BL-42)
и задачи, требующие решения владельца (BL-52), при взятии в работу уходят в отдельный файл
плана (`AGENTS.md` §3). Порядок внутри раздела — по приоритету аудита.

### P1

- **BL-33. Починить E2E-nightly и отделить real-mode от mock-прогона** (M). Что сделать:
  разделить `e2e-nightly.yml` на два независимых job'а (`e2e-mock` и `e2e-real` со своим
  compose-стеком), чтобы падение одного не скипало другой; `retries: process.env.CI ? 2 : 0`
  и `workers: 1` в `playwright.config.ts`; `trace: 'on'` на nightly + артефакт с трейсами;
  длинный комментарий про песочницу агента из `playwright.config.ts` перенести в реестр
  известных дефектов (`plans/knownbugs.md`);
  уведомление о красном nightly (`workflow_run` → issue); после починки снять
  `continue-on-error` для PR. Критерий приёмки: два nightly подряд зелёные, в логе видно
  выполнение `real-mode.spec.ts`; намеренно сломанный `data-testid` валит `e2e-mock`. Источник: внешний аудит 30.10.2026, AU-06 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-34. Включить coverage-гейт R5 в CI и расширить whitelist** (M). Что сделать: шаг
  `npm run test:coverage` в `ci.yml` — сначала non-blocking с публикацией числа в summary,
  через 1–2 недели blocking (приём уже заявлен в шаге «Check MD files»); публиковать ДВЕ цифры
  («по whitelist'у» и «по всему `src/`»); пополнять `coverage.include` по мере декомпозиции
  страниц (BL-53); автоматизировать R5 проверкой «новый файл в `src/utils|api|components`
  обязан попасть в `include`»; рассмотреть `thresholds.branches` (сейчас только `lines`).
  Критерий приёмки: coverage-шаг виден в job summary с обоими числами; добавление
  `src/utils/foo.ts` без внесения в `include` валит проверку. Источник: внешний аудит 30.10.2026, AU-07 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-36. Dependabot + `npm audit` в CI + фикс текущих CVE** (S). Что сделать:
  `.github/dependabot.yml` для экосистем `npm`, `maven`, `github-actions` (`schedule: weekly`,
  `open-pull-requests-limit: 10`, группы для минорных/патчей); блокирующий шаг
  `npm audit --omit=dev --audit-level=high` (moderate — сначала non-blocking в summary);
  поднять `react-router-dom` до исправленной версии и проверить все `<Link to>` на
  пользовательские данные; удалить неиспользуемый `uuid` (CVE уходит вместе с пакетом,
  см. BL-43); ночной job `mvn versions:display-dependency-updates` /
  `display-plugin-updates` без блокировки. Критерий приёмки: Dependabot открыл первые PR;
  `npm audit --omit=dev --audit-level=high` чистый и блокирует CI; `uuid` нет в `package.json`. Источник: внешний аудит 30.10.2026, AU-10 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-37. Одна версия Java в pom, CI, nightly и Dockerfile** (S). Что сделать: выбрать одну
  версию (рекомендация аудита — 21 LTS: образ уже на 21, а BL-40 всё равно ведёт к линии,
  где 17 не оптимален); привести в соответствие `backend/pom.xml` (`java.version` и
  `maven.compiler.release` вместо устаревших `source`/`target`), `ci.yml`,
  `contract-nightly.yml`, `backend/Dockerfile`, `README.md`, `backend/README.md`; запинить
  базовые образы по digest (BL-50); добавить CI-страховку — шаг, сравнивающий `java-version`
  в workflow, `maven.compiler.release` в pom и `FROM` в Dockerfile. Критерий приёмки: все
  четыре источника говорят одно число; `mvn test` и `docker compose build` зелёные;
  проверка-страховка валится при рассинхроне. Источник: внешний аудит 30.10.2026, AU-11 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY

- **BL-51. Обновить GitHub Actions и запинить runner-образ** (S). Что сделать: поднять actions
  до v5 (`checkout`, `setup-node`, `setup-java`, `upload-artifact` — сейчас warning про
  deprecated Node 20); заменить `runs-on: ubuntu-latest` явным `ubuntu-24.04` (миграцию на
  26.04 планировать отдельно, прогнав `ci.yml` через `workflow_dispatch` до переключения);
  `trivy-action@master` → релизный тег; Node 20 → 22 LTS в `setup-node` (согласуется с
  `engines` из BL-43); `postgres:15-alpine` в `contract-nightly.yml` — тот же пин-подход,
  что в BL-50. Критерий приёмки: в логах нет deprecation-предупреждений про Node 20;
  `runs-on` указан явно; все workflow зелёные; `trivy-action` ссылается на тег. Источник: внешний аудит 30.10.2026, AU-29 (сводка 30 задач — `tasks/done/2026-10/2026-10-30-external-audit-p0-block.md`).
  Статус: READY. Пометка аудита 02.11.2026: запись «BL-51 — ГОТОВО 01.11.2026» в
  `plans/done/backlog.md` НЕ соответствует репозиторию — `.github/dependabot.yml` никогда
  не существовал в git-истории, `trivy-action@master` не заменён тегом, `runs-on:
  ubuntu-latest` не заменён явным образом, actions по-прежнему v4; работа предстоит,
  действительна настоящая карточка (см. план `tasks/done/2026-11/2026-11-02-audit-security-usability-ui.md`,
  подзадача 9).

## Результаты (заполнить при закрытии, затем `git mv` файла в `tasks/done/<YYYY-MM>/`)

(заполняется при закрытии)
