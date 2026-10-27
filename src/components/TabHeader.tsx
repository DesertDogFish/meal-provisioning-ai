import type { ReactNode } from 'react';

/**
 * Fix-5 (п.2): единая шапка вкладки похода — на всех вкладках одинаковая
 * структура «заголовок + подпись + действия справа», чтобы при переключении
 * «глаза не прыгали». Раньше на «Закупка на поход» заголовок был, на
 * «По дням» — нет, на «Чеклисте» — свой.
 */
export interface TabHeaderProps {
  title: string;
  /** строка пояснения/итогов под заголовком (текст или ноды с InfoTip) */
  subtitle?: ReactNode;
  /** действия справа (кнопки, чекбоксы-фильтры) */
  right?: ReactNode;
}

export function TabHeader({ title, subtitle, right }: TabHeaderProps) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="min-w-0">
        <h3 className="font-bold" style={{ color: 'var(--text)' }}>{title}</h3>
        {subtitle != null && (
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{subtitle}</p>
        )}
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

export default TabHeader;
