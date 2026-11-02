# Skill: тесты и проверки (копии команд, не изобретай свои)

## Ограничения среды агента (песочница 2 vCPU / ~1 ГБ RAM, без Docker-демона)
- ПОЛНЫЙ `mvn test` — OOM (137). Backend-тесты — только per-class, рецепт ниже.
- НЕ запускать никогда (OOM даже при -Xmx256m): `UserPricesIntegrationTest`,
  `EconomicConsistencyTest`, `DockerStackSmokeTest`. В отчёте: «не запускались из-за
  лимита памяти», это НЕ «упали».
- Playwright/e2e в песочнице не стартует (OOM раннера) — e2e проверяет CI.
- Интеграционные тесты без Docker идут через LocalPgFallback: PostgreSQL на порту **5433**.

## Backend: прогон одного класса (копировать как есть)
```bash
cd backend
MAVEN_OPTS="-Xmx400m -XX:MaxMetaspaceSize=256m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:+EnableDynamicAgentLoading -Xshare:off -Dfile.encoding=UTF-8" \
JWT_SECRET=ci-test-secret-key-for-jwt-tokens-must-be-at-least-256-bits-long-hs256-ok \
mvn -B -o test -DforkCount=0 -Dtest='ИмяКласса' -DfailIfNoSpecifiedTests=false
```
- `-o` (offline) обязательно — иначе Maven виснет на сети.
- `-DforkCount=0` обязательно — форк без него OOM.
- **На Windows/git-bash `mvn` из PATH не стартует** (`ClassNotFoundException:
  org.codehaus.plexus.classworlds.launcher.Launcher`) — запускать `cmd.exe /c "mvn ..."`,
  а переменные брать из `.env`: `set -a; . ../.env; set +a` (подробнее — `AGENTS.md`,
  «Грабли окружения»).
- Несколько классов: `-Dtest='A,B,C'` (суммарно ≤ 3 Spring-классов за прогон).

## Между прогонами: чистка тестовых БД (иначе stale-состояние)
```bash
psql -h localhost -p 5433 -U test -d postgres -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'provision%'" \
| while read db; do psql -h localhost -p 5433 -U test -d postgres -c "DROP DATABASE \"$db\" WITH (FORCE)"; done
```
Дропать ВСЕ `provision%` (имена разные: `provision_test_*`, `provision_upgrade_test`,
`provision_meta_test`). `FlywayUpgradeIntegrationTest` переиспользует свою БД — после
смены файлов миграций без дропа будет «checksum mismatch».

## Ловушка: stale-ресурсы в target/classes
После ПЕРЕИМЕНОВАНИЯ/УДАЛЕНИЯ файлов миграций `mvn test` НЕ убирает старые копии из
`backend/target/classes/db/migration/` → Flyway видит дубль («more than one migration with
version N») при чистом исходном дереве. Лечить: `rm target/classes/db/migration/<старый>.sql`
или `mvn clean` (медленно).

## Покрытие backend (JaCoCo)
Измерение: прогнать тесты с javaagent (при forkCount=0 `prepare-agent` не работает):
```bash
MAVEN_OPTS="$MAVEN_OPTS -javaagent:/root/.m2/repository/org/jacoco/org.jacoco.agent/0.8.12/org.jacoco.agent-0.8.12-runtime.jar=destfile=$PWD/target/jacoco.exec,append=true" mvn -B -o test -DforkCount=0 -Dtest='...'
```
Отчёт+гейт: `mvn -B -o -P coverage-gate jacoco:report jacoco:check@coverage-gate`;
LINE-доля в `target/site/jacoco/jacoco.csv` ($8=missed, $9=covered). Порог 0.60 (pom).

## Frontend
```bash
npm run lint            # 0 errors (warnings допустимы)
npm run typecheck:all   # app + e2e + node конфиги
npm run test            # vitest, весь сьют
npm run test:coverage   # гейт R5: lines ≥ 80% на зоне изменения
npm run build           # если трогал src/
npm run test:contract   # если трогал API/mock (файлы *contract*)
```

## Гейты перед завершением работы (что прогнать — по факту правок)
| Тронул | Прогнать |
|---|---|
| backend java | per-class тесты затронутых классов + 1 интеграционный сосед |
| миграции | `SnapshotIsolationIntegrationTest`, `FlywayUpgradeIntegrationTest` + чистка БД/stale |
| src/ фронтенд | lint + typecheck:all + vitest (затронутые файлы) + build |
| API-контракт | contract-тесты (mock ↔ real) |
| CI yml | хотя бы `yq`/визуально; полный прогон — только в GitHub Actions |

## Отчёт о прогонах — честно (R6)
Пиши числа: «AuthIntegrationTest 10/10», «vitest 935/935». Не прогонял — так и напиши
(«не запускалось: лимит памяти / нет демона»), никогда не выдавай за «зелёное».
