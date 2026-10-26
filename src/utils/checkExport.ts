/**
 * Fix-3 / PLAN R4-lite: экспорт закупки-чека — CSV (Excel-дружественный: BOM +
 * точка с запятой как разделитель, запятая как десятичный) и печать через
 * window.print(). Печатная раскладка — @media print в index.css.
 */

export interface CsvRow {
  name: string;
  amount: string;      // уже отформатированное количество с единицей
  plannedCost: string; // форматированный план ₽
  actualCost: string;  // форматированный факт ₽
  delta: string;       // дельта, %
}

/** Экранирование значения CSV: кавычки, если есть ; " или перевод строки. */
export function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Собрать CSV-текст закупки/чека (без скачивания — чистая функция, тестируется). */
export function buildShoppingCsv(rows: CsvRow[], title = 'Закупка'): string {
  const head = ['Наименование', 'Количество', 'План, ₽', 'Факт, ₽', 'Δ, %'];
  const lines = [
    head.map(csvCell).join(';'),
    ...rows.map(r => [r.name, r.amount, r.plannedCost, r.actualCost, r.delta].map(csvCell).join(';')),
  ];
  void title;
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Скачать текстовый файл (Blob + object URL). */
export function downloadTextFile(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
