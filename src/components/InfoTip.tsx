import { HelpCircle } from 'lucide-react';

/**
 * Fix-5 (п.3–5): «На 1 чел. (общее)»?? — у каждого неочевидного числа должна быть
 * подсказка с формулой. InfoTip — иконка «?» с нативным title-тултипом: навёл —
 * прочитал, что за формула прячется. Без зависимостей и попавер-менеджмента.
 */
export interface InfoTipProps {
  /** Текст подсказки — человеческим языком, с формулой и примером, если уместно */
  text: string;
  /** Дополнительный aria-label (по умолчанию из text) */
  label?: string;
}

export function InfoTip({ text, label }: InfoTipProps) {
  return (
    <span
      title={text}
      aria-label={label ?? text}
      role="img"
      className="inline-flex align-middle ml-1 cursor-help shrink-0"
      style={{ color: 'var(--muted)' }}
      data-testid="info-tip"
    >
      <HelpCircle size={13} />
    </span>
  );
}

export default InfoTip;
