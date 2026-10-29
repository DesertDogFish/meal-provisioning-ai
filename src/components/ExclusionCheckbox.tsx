/**
 * Подзадача 26 аудита (2026-10-29): чекбокс soft-disable позиции закупки,
 * вынесен из `TripDetailPage.tsx` (R8/R9). Используется вкладками «Закупка
 * на поход» и «Закупка по дням».
 *
 * Фаза 13 (п.5) + Fix-2 (п.5): переключатель soft-disable.
 * С dayDate — исключение ТОЛЬКО этого дня (количество дня уходит из закупки,
 * в остальные дни позиция продолжает закупаться); без — глобальное.
 * Исключение из расчёта НЕ меняет справочник и не отправляется как удаление;
 * черновик живёт в общем стейдже похода (utils/tripStaging).
 */
export interface ExclusionCheckboxProps {
  ingredientId: string;
  /** дата дня — для по-дневного исключения (глобальное: без dayDate) */
  dayDate?: string;
  /** ключи исключений: `ingredientId` (весь поход) ИЛИ `${dayDate}::${ingredientId}` (день) */
  excluded: ReadonlySet<string>;
  /** переключить исключение по ключу */
  onToggle: (key: string) => void;
}

export function ExclusionCheckbox({ ingredientId, dayDate, excluded, onToggle }: ExclusionCheckboxProps) {
  /** Fix-2 (п.5): key = ingredientId (весь поход) ИЛИ `${dayDate}::${ingredientId}` (только день). */
  const key = dayDate ? `${dayDate}::${ingredientId}` : ingredientId;
  const off = excluded.has(key) || (!!dayDate && excluded.has(ingredientId));
  return (
    <input
      type="checkbox"
      checked={!off}
      onChange={() => onToggle(key)}
      aria-label={off ? 'Включить в расчёт' : dayDate ? 'Исключить из этого дня' : 'Исключить из расчёта'}
      title={off ? 'Включить в расчёт' : dayDate ? 'Не покупать в этот день (остальные дни не затрагиваются)' : 'Исключить из расчёта (не удаляя)'}
      className="cursor-pointer"
      style={{ accentColor: 'var(--w2)' }}
    />
  );
}

export default ExclusionCheckbox;
