/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 3, KB-32).
 *
 * Контракт текстового поля даты в `DatePicker`:
 *  - пользователь ВИДИТ и НАБИРАЕТ дату в ru-RU — ДД.ММ.ГГГГ (плейсхолдер тот же);
 *  - форма, API и бэкенд хранят ISO `YYYY-MM-DD` (контракт не меняется);
 *  - набор с клавиатуры коммитится: полностью набранная дата — сразу
 *    (Playwright `fill`/быстрый ввод не делают blur), частичная — на blur/Enter.
 *
 * Модуль чистый (без React/DOM), поэтому контракт формата покрыт unit-тестом
 * `dateInput.test.ts` (R1/R2), а компонент — своим (`DatePicker.test.tsx`).
 */

/** Подсказка формата — совпадает с плейсхолдером поля. */
export const DATE_INPUT_PATTERN = 'ДД.ММ.ГГГГ';

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const LOCAL_RE = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/;

/** Реальна ли дата в календаре (31.02 → нет). Двухзначный год → 20xx. */
function realDate(day: number, month: number, year: number): string | null {
  const fullYear = year < 100 ? 2000 + year : year;
  if (month < 1 || month > 12 || day < 1) return null;
  const d = new Date(fullYear, month - 1, day);
  if (d.getFullYear() !== fullYear || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${fullYear}-${mm}-${dd}`;
}

/**
 * Набранный/вставленный текст → ISO `YYYY-MM-DD`.
 * Принимает ДД.ММ.ГГГГ, Д.М.ГГГГ, ДД/ММ/ГГГГ и ISO (вставка из буфера, e2e-fill).
 * Нераспознанное или несуществующее → `''` (поле считается пустым).
 */
export function parseDateInput(text: string | null | undefined): string {
  if (!text) return '';
  const raw = String(text).trim();
  if (!raw) return '';
  const iso = raw.match(ISO_RE);
  if (iso) return realDate(Number(iso[3]), Number(iso[2]), Number(iso[1])) ?? '';
  const local = raw.match(LOCAL_RE);
  if (local) return realDate(Number(local[1]), Number(local[2]), Number(local[3])) ?? '';
  return '';
}

/**
 * ISO (или уже локальный текст) → ДД.ММ.ГГГГ для отображения в поле.
 * Пустое/нечитаемое → `''`, чтобы пользователь видел плейсхолдер «ДД.ММ.ГГГГ».
 */
export function formatDateInput(value: string | null | undefined): string {
  const iso = parseDateInput(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Полностью ли набрана дата — можно коммитить БЕЗ blur.
 *
 * Двухзначный год сюда намеренно не входит: иначе набор «10.11.2026» на
 * промежуточном «10.11.20» коммитил бы 2020 год и «съедал» дальнейший ввод.
 * Короткий год принимается только явным коммитом (blur/Enter) через
 * `parseDateInput`.
 */
export function isCompleteDateText(text: string | null | undefined): boolean {
  if (!text) return false;
  const raw = String(text).trim();
  return /^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) || /^\d{1,2}[./]\d{1,2}[./]\d{4}$/.test(raw);
}
