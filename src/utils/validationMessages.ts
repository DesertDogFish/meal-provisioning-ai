/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 2).
 *
 * ЕДИНЫЙ маппинг «техническое имя поля → человеческая RU-копи».
 *
 * Зачем отдельный модуль (R9 — одна ответственность):
 *  - `validation.ts` — правила (аналог Jakarta-аннотаций бэкенда), он же
 *    собирает `FieldError`; тексты берёт отсюда.
 *  - серверные/mock-ответы приходят в ProblemDetail.errors с техническими
 *    английскими сообщениями бэка (`must not be blank`); UI локализует их той
 *    же таблицей (`humanizeFieldError`), поэтому клиентская и серверная ошибка
 *    по одному полю выглядят одинаково.
 *  - само поле (`field`) остаётся в ProblemDetail/FieldError для логов и
 *    подсветки инпута — из вывода пользователю технический префикс убран.
 */

/** Именительный падеж: «Дата начала», «Количество человек». */
export const FIELD_LABELS: Record<string, string> = {
  name: 'Название',
  startDate: 'Дата начала',
  endDate: 'Дата окончания',
  defaultPeople: 'Количество человек',
  notes: 'Заметки',
  email: 'Эл. почта',
  password: 'Пароль',
  firstName: 'Имя',
  lastName: 'Фамилия',
  unit: 'Единица измерения',
  category: 'Категория',
  mealType: 'Тип приёма',
  baseServings: 'Число порций',
  ingredients: 'Состав',
  amount: 'Количество',
  pricePerUnit: 'Цена за единицу',
};

/** Родительный падеж — для сравнений («не раньше даты начала»). */
const FIELD_LABELS_GENITIVE: Record<string, string> = {
  name: 'названия',
  startDate: 'даты начала',
  endDate: 'даты окончания',
  defaultPeople: 'количества человек',
  email: 'эл. почты',
  password: 'пароля',
  firstName: 'имени',
  lastName: 'фамилии',
  unit: 'единицы измерения',
  category: 'категории',
  mealType: 'типа приёма',
  baseServings: 'числа порций',
  ingredients: 'состава',
};

/** Готовая копи «поле пустое» — самая частая ошибка формы. */
const BLANK_TEXT: Record<string, string> = {
  name: 'Укажите название',
  startDate: 'Укажите дату начала',
  endDate: 'Укажите дату окончания',
  defaultPeople: 'Укажите количество человек',
  notes: 'Укажите заметки',
  email: 'Укажите эл. почту',
  password: 'Укажите пароль',
  firstName: 'Укажите имя',
  lastName: 'Укажите фамилию',
  unit: 'Укажите единицу измерения',
  category: 'Укажите категорию',
  mealType: 'Укажите тип приёма',
  baseServings: 'Укажите число порций',
  ingredients: 'Добавьте хотя бы один ингредиент',
};

const BLANK_FALLBACK = 'Заполните обязательное поле';

/** Человекочитаемое имя поля; неизвестное поле — как есть, пустое — «Поле». */
export function fieldLabel(field: string | null | undefined): string {
  if (!field) return 'Поле';
  return FIELD_LABELS[field] ?? field;
}

/** Родительный падеж имени поля (для «не раньше …»). */
export function fieldLabelGenitive(field: string | null | undefined): string {
  if (!field) return 'указанной даты';
  return FIELD_LABELS_GENITIVE[field] ?? FIELD_LABELS[field] ?? field;
}

/** «Укажите дату начала» — с учётом контекста формы (subject). */
export function blankMessage(field: string, subject?: string): string {
  if (subject) return `Укажите ${subject}`;
  return BLANK_TEXT[field] ?? (FIELD_LABELS[field] ? `${FIELD_LABELS[field]} — обязательное поле` : BLANK_FALLBACK);
}

export interface FieldErrorLike {
  field: string;
  message: string;
}

/**
 * Серверное/mock-сообщение ошибки поля → человеческая RU-копи.
 *
 * Распознаёт технические шаблоны Jakarta-валидации бэкенда; всё остальное
 * (уже локализованные тексты, бизнес-ошибки вроде «Поход с таким названием
 * уже существует») проходит как есть. Технический префикс `field:` не
 * добавляется никогда — поле остаётся в ProblemDetail для логов.
 */
export function humanizeFieldError(err: FieldErrorLike | null | undefined): string {
  if (!err) return BLANK_FALLBACK;
  const raw = (err.message ?? '').trim();
  const label = FIELD_LABELS[err.field];

  if (!raw) return label ? blankMessage(err.field) : BLANK_FALLBACK;
  if (/must not be (blank|null)/i.test(raw)) return label ? blankMessage(err.field) : BLANK_FALLBACK;
  if (/must be a valid email/i.test(raw)) return 'Укажите корректный адрес эл. почты';
  if (/must contain at least one ingredient/i.test(raw)) return BLANK_TEXT.ingredients;

  const size = raw.match(/must be between (\d+) and (\d+) characters/i);
  if (size) return `${fieldLabel(err.field)}: от ${size[1]} до ${size[2]} символов`;

  if (/must be positive/i.test(raw)) return `${fieldLabel(err.field)}: значение должно быть больше нуля`;

  const min = raw.match(/must be at least ([\d.,-]+)/i);
  if (min) return `${fieldLabel(err.field)}: не меньше ${min[1]}`;

  const max = raw.match(/must be at most ([\d.,-]+)/i);
  if (max) return `${fieldLabel(err.field)}: не больше ${max[1]}`;

  const after = raw.match(/must be on or after (\w+)/i);
  if (after) return `${fieldLabel(err.field)} не может быть раньше ${fieldLabelGenitive(after[1])}`;

  if (/must be today or in the future/i.test(raw)) return `${fieldLabel(err.field)}: дата не может быть в прошлом`;

  const oneOf = raw.match(/must be one of: (.+)/i);
  if (oneOf) return `${fieldLabel(err.field)}: допустимые значения — ${oneOf[1]}`;

  if (/has invalid format/i.test(raw)) return `${fieldLabel(err.field)}: неверный формат`;

  // Не технический шаблон — считаем текст уже человеческим (бизнес-ошибка бэка).
  return raw;
}
