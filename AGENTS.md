# Agents

## Правила для AI-агентов

### 1. Запрет на создание MD-файлов

**Строго запрещено** создавать новые MD-файлы вне белого списка.

**Белый список (ровно 4 файла):**
- `README.md` — запуск, стек, ссылки
- `ARCHITECTURE.md` — слои данных, режимы, расчёты, контракт
- `PLAN.md` — единственный живой статус, текущая фаза, бэклог, баги
- `AGENTS.md` — этот файл (правила для агентов)

**Запрещено:**
- `*_REPORT.md`
- `FINAL_*.md`
- `*_SUMMARY.md`
- `*_FIX.md`
- `*_IMPLEMENTATION.md`
- `MIGRATION_PLAN.md`
- `MODE_AUDIT_AND_MIGRATION.md`
- Любые другие MD-файлы вне белого списка

**Исключение:** `backend/README.md` разрешён (документация для backend).

### 2. Формат отчёта

**Никаких файлов с отчётами!**

Отчёт пишется прямо в ответе в формате:

```
Commit: <hash>
Workflow run: <URL>
backend: passed/failed
frontend: passed/failed
docker: passed/failed
security: passed/warning/failed
test: passed/failed

<3-5 строк что сделано>
```

**Обязательно:**
- Ссылка на зелёный workflow run (без неё статус "не проверено")
- Статусы всех джобов
- Краткое описание изменений (3-5 строк)

**Запрещено:**
- Создавать MD-файлы с отчётами
- Писать длинные отчёты в файлах
- Дублировать информацию из PLAN.md

### 3. Запрет на генерацию SHA

**Строго запрещено** генерировать SHA для GitHub Actions вручную.

**Разрешённые способы получения SHA:**
1. Через GitHub UI: открыть action → Releases → нажать на коммит → скопировать SHA
2. Через утилиту `pin-github-action`
3. Через Dependabot/Renovate

**Безопасная альтернатива:**
- Использовать теги (`@v4`, `@master`) вместо SHA
- Это менее безопасно, но работает без генерации SHA

**Примеры запрещённых SHA:**
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # ❌ Выдуманный
uses: actions/setup-java@8df10367165c4f5c0fb5e5d5e2f7b3c7a5a3a3a3  # ❌ Выдуманный
```

**Примеры разрешённых:**
```yaml
uses: actions/checkout@v4  # ✅ Тег
uses: actions/setup-java@v4  # ✅ Тег
```

### 4. Запрет на изменение архитектуры в тикетах на фикс

**Тикеты на фикс** — только для исправления ошибок CI, багов, lint.

**Запрещено в тикетах на фикс:**
- Менять архитектуру
- Добавлять новые фичи
- Рефакторить код без необходимости
- Создавать новые файлы (кроме исправления багов)

**Разрешено в тикетах на фикс:**
- Исправлять ошибки компиляции
- Исправлять ошибки lint
- Исправлять ошибки тестов
- Добавлять `@Disabled` для баг-тестов со ссылкой на TODO в PLAN.md
- Исправлять CI workflows (non-blocking для security)

**Пример:**
```
Тикет: "Починить CI — 11 ошибок компиляции"

✅ Исправить конструкторы в тестах
✅ Добавить моки для новых зависимостей
✅ Добавить @Disabled для ShoppingListCostAggregationBugTest
❌ Рефакторить SummaryService
❌ Добавлять новую фичу "Кладовая"
```

### 5. Баг-тесты и @Disabled

**Баг-тесты** — тесты, которые документируют известные баги.

**Правила:**
- Помечать `@Disabled` с комментарием
- Ссылка на TODO в PLAN.md
- Не удалять тест (он документирует баг)
- Вернуть тест после фикса бага

**Пример:**
```java
@Disabled("Legacy bug-demo test: агрегация стоимости по endDate. TODO: PLAN.md#known-bugs-1")
@Test
void testCostAggregationBug() {
    // Тест документирует баг
}
```

**В PLAN.md:**
```markdown
## Known Bugs

### 1. Агрегация стоимости по endDate

**Симптом:** При изменении цен во время похода стоимость считается неверно.
**Тест:** ShoppingListCostAggregationBugTest (@Disabled)
**Решение:** Считать стоимость для каждого дня отдельно
```

### 6. Проверка перед коммитом

**Обязательные проверки перед коммитом:**

```bash
# Backend
cd backend
mvn -B -ntp clean test  # ✅ BUILD SUCCESS

# Frontend
cd ..
npm run lint            # ✅ 0 errors
npm run build           # ✅ BUILD SUCCESS
npm run test            # ✅ Все тесты проходят

# Проверка MD-файлов
git ls-files '*.md'     # ✅ Ровно 4 файла (+ backend/README.md)
```

**Запрещено коммитить если:**
- Backend тесты падают
- Frontend lint показывает errors
- Frontend build падает
- Появились новые MD-файлы вне белого списка
- Выдуманы SHA для GitHub Actions

### 7. Работа с CI

**Правила для CI workflows:**

1. **Security сканеры** — non-blocking по умолчанию
   ```yaml
   - name: Semgrep
     continue-on-error: true
   ```

2. **Dependency Review** — non-blocking (может быть отключён в приватных репо)
   ```yaml
   - name: Dependency Review
     continue-on-error: true
   ```

3. **Trivy** — non-blocking (rate limit 429 от Maven Central)
   ```yaml
   - name: Trivy FS scan
     continue-on-error: true
   ```

4. **Интеграционные тесты** — временно отключены
   ```xml
   <excludes>
     <exclude>**/*IntegrationTest.java</exclude>
   </excludes>
   ```

### 8. Миграция компонентов

**Паттерн миграции компонента на API клиент:**

```typescript
// БЫЛО (с AppContext):
import { useApp } from '../store/AppContext';

export default function MyComponent() {
  const { state, dispatch } = useApp();
  const products = state.ingredients;
  
  const handleCreate = () => {
    dispatch({ type: 'ADD_INGREDIENT', payload: newProduct });
  };
}

// СТАЛО (с API клиентом):
import { api } from '../api/client';
import { useState, useEffect } from 'react';

export default function MyComponent() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadProducts();
  }, []);
  
  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await api.get('/admin/products');
      setProducts(data.content || data);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleCreate = async (newProduct) => {
    try {
      await api.post('/admin/products', newProduct);
      await loadProducts();
    } catch (error) {
      console.error('Failed to create product:', error);
    }
  };
}
```

**После миграции:**
1. Убрать компонент из `excludedFiles` в `.eslintrc.cjs`
2. Проверить `npm run lint` — должно быть 0 errors
3. Проверить работу в режимах AUTO/FORCE_API/FORCE_MOCK

### 9. Правила кодинга фич (R1-R7)

#### R1. Тест до кода (red-green) — для любого бага и любой новой мате/логики
1. Пишешь тест на новое поведение / на баг.
2. Запускаешь ЛОКАЛЬНО на старом коде: `npm run test` (или `mvn -B -ntp test -Dtest=...`)
3. Тест ДОЛЖЕН упасть. Если прошёл на старом коде — тест бесполезен, переписать.
4. Только после этого пишешь код фичи/фикса.
5. Снова локально: тест проходит.

**Доказательство в отчёте:** строки «упал на старом» → «прошёл на новом» (вывод vitest/mvn).

#### R2. Слой теста = где живёт изменение (не «хоть что-нибудь»)
- чистая функция / математика (calc.ts, humanize, парсеры) → unit-тест (vitest)
- поведение UI-компонента (даты, поля, таблицы, модалки, бейдж) → component-тест (RTL + vitest)
- форма ответа API / DTO / эндпоинт → contract-тест (mock) + integration (бэк)
- клиент / режимы / watchdog / фолбэк → component-тест (MODE-сьют)
- миграция БД / Flyway → integration-тест (бэк)

Если изменение затрагивает несколько строк — тестируешь каждый затронутый слой.

#### R3. Фича не готова без своего теста
DoD фичи = фича + тест по R2 + локально зелёные:
```bash
npm run lint   # 0 errors
npm run test   # failed: 0
npm run build  # success
```
Для бэка: `mvn -B -ntp test` (Failures: 0, Errors: 0)

#### R4. Запрет глушить тесты без следа
- `@Disabled` / `it.skip` / `@Ignore` — только со ссылкой на пункт в PLAN.md в той же строке.
- Локальный страж (запускаешь перед пушем):
  ```bash
  grep -rnE "@Disabled|it\.skip|test\.skip|@Ignore" src backend/src
  ```
  Каждая находка без `// TODO PLAN.md: ...` = красный, чинить.

#### R5. Coverage на новом коде
- После vitest-изменений: `npx vitest run --coverage`
- Порог lines ≥ 80% на `src/utils/**`, `src/api/**` и новых компонентах.
- Legacy-страницы не душим — гейт только на зоне изменения.

#### R6. Что кодер НЕ утверждает
- Не писать «CI зелёный» / «regression исключена» — ты не видишь ран.
- Формулировать так: «локально зелёно, red-green доказан, хеш <...>».
- Финальную сверку с Actions делаю я (Олег).

#### R7. Отчёт о работе (без новых MD)
В ответе, не в файле:
```
Хеш коммита: <...>
Локально: lint=0err, test=N passed/0 failed, build=ok, coverage=X%
Red-green: <название теста> упал на старом → прошёл на новом
Затронутые слои (R2): <перечислить>
Обновил PLAN.md: да/нет (что перенёс)
```

### 10. Полнота изменения: системный подход

**Инвариант:** Изменение = все слои, которые оно сопрягает, а не только тот, что в тикете.

#### Матрица сопряжённых слоёв
- **UI/экран** → DTO-поля, хуки клиента, unitLabel/humanize, loading/error/empty, PLAN.md
- **DTO/ответ API** → TS-типы фронта, mock-ответ, contract-тест, интеграционные бэка, ARCHITECTURE.md (если контракт)
- **Эндпоинт** → client.ts + mockServer.ts + contract-тест (три одновременно), SecurityConfig, PLAN.md
- **Схема БД** → новая Vn__ (не правь применённую), entity, репо-запросы, сид, ARCHITECTURE.md
- **Конфиг/env/pom/package** → Dockerfile, compose, workflow, README (те же ключи/порты/версии)
- **Докер-контур** → application.yml (URL внутри сети), workflow docker-job, README, ARCHITECTURE.md
- **Workflow** → локальная воспроизводимость, теги vs SHA (не генерировать SHA), README бейджи, PLAN.md
- **Граница/слой/источник данных** → ARCHITECTURE.md обязателен, AGENTS.md (если правила), PLAN.md

#### Триггеры «если → то»
- новое/переименованное поле DTO → синхронизируй тип фронта + mock + contract; grep старого имени
- новый эндпоинт → client.ts + mockServer.ts + contract-тест в одном коммите (одно без двух = рассинхрон)
- изменение схемы → Vn__ + entity + сид + ARCHITECTURE.md; grep нового поля в migration
- тронул конфиг/env/pom/package → открой Dockerfile, compose, оба workflow, README и сверь ключи/порты/версии
- меняешь докер-контур или границу слоя → ARCHITECTURE.md в том же коммите
- закрыл/начал фичу или нашёл регрессию → PLAN.md (статус/бэклог/постмортем), новый MD не создавать
- меняешь `<repositories>`/зависимости Maven → flyway-repo и spring-release снаружи недоступны (не browseable / JS / 401): не добавляй репы «на глаз», не поломай существующие, сверяй локально через `mvn dependency:tree`

#### Ритуал перед пушем (локально, без GitHub)
1. `npm run lint` (0 err) && `npm run test` (failed 0) && `npm run build` (ok)
   `cd backend && mvn -B -ntp test` (Failures 0, Errors 0)
2. grep нового имени/эндпоинта/поля по src и backend/src — сверить со строками матрицы
3. grep нового env-ключа/порта/сервиса по .github, backend, compose, README
4. `grep -rnE "@Disabled|it\.skip|test\.skip|@Ignore"` — находки только с TODO-ссылкой в PLAN.md
5. PLAN.md актуален; ARCHITECTURE.md обновлён, если менялся контракт/граница/слой/докер; README обновлён, если менялся запуск/стек/переменные

#### Чего НЕ делать
- ❌ Не считать задачу закрытой по одному файлу из тикета.
- ❌ Не добавлять эндпоинт/поле в один слой, оставляя другие рассинхроненными.
- ❌ Не править применённую миграцию вместо создания новой.
- ❌ Не создавать новые MD-файлы — статус в PLAN.md, правила в AGENTS.md, границы в ARCHITECTURE.md.
- ❌ Не утверждать «CI зелёный» (ты не видишь ран) — приноси вывод локальных команд + хеш.

### 10. Проверка MD-файлов в CI

**Добавить в CI job для проверки MD-файлов:**

```yaml
- name: Check MD files
  run: |
    count=$(git ls-files '*.md' | grep -v '^backend/README.md$' | wc -l)
    if [ "$count" -ne 4 ]; then
      echo "::error::Expected 4 MD files (README.md, ARCHITECTURE.md, PLAN.md, AGENTS.md), found $count"
      git ls-files '*.md'
      exit 1
    fi
```

**Через неделю** перевести в blocking (exit 1).

### 10. Документация

**Правила документирования:**

1. **README.md** — только запуск, стек, ссылки
2. **ARCHITECTURE.md** — архитектура, слои, расчёты, контракт
3. **PLAN.md** — единственный живой статус, бэклог, баги
4. **AGENTS.md** — этот файл (правила для агентов)

**Запрещено:**
- Дублировать информацию между файлами
- Создавать новые MD-файлы
- Писать длинные отчёты в файлах

**Разрешено:**
- Обновлять существующие файлы из белого списка
- Добавлять комментарии в код
- Создавать документацию в виде комментариев

## Checklist перед коммитом

- [ ] Backend тесты проходят (`mvn -B -ntp test`)
- [ ] Frontend lint проходит (`npm run lint`)
- [ ] Frontend build проходит (`npm run build`)
- [ ] Frontend тесты проходят (`npm run test`)
- [ ] Нет новых MD-файлов вне белого списка
- [ ] Нет выдуманных SHA для GitHub Actions
- [ ] Отчёт в формате Commit/Workflow run/статусы
- [ ] Ссылка на зелёный workflow run

## Примеры

### Правильный отчёт

```
Commit: abc123def456
Workflow run: https://github.com/DesertDogFish/meal-provisioning-ai/actions/runs/12345
backend: passed
frontend: passed
docker: passed
security: warning (Semgrep non-blocking)
test: passed

Исправлены 11 ошибок компиляции в backend тестах (обновлены конструкторы SummaryService, IngredientRequest, RecipeRequest). Удалены unused imports в 8 frontend файлах. Добавлены исключения для немигрированных компонентов в .eslintrc.cjs.
```

### Неправильный отчёт

```
❌ Создан файл CI_FIX_REPORT.md с подробным описанием
❌ Нет ссылки на workflow run
❌ Нет статусов джобов
❌ Длинное описание на 10 страниц
```

## Контакты

Если есть вопросы по правилам — обновить этот файл (AGENTS.md).

Если нужно добавить новую фичу — создать тикет в PLAN.md.

Если найден баг — добавить в PLAN.md#known-bugs.
