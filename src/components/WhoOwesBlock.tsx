/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.5/п.9): «Кто сколько
 * должен» — ОДИН компонент на этап ④ и отчёт (раньше дубль: свой блок в
 * PriceOverridesTab и свой расчёт «поровну» в TripReportPage). Расчёт — из
 * общих view-моделей deriveTripView: факт-сумма закупки ÷ реальное число людей;
 * по дням — факт дня ÷ люди дня. Деньги на клиенте не пересчитываются сверх
 * этой формулы (AGENTS §12).
 */
import InfoTip from './InfoTip';
import { formatRub } from '../utils/format';

export interface WhoOwesDay {
  dayDate: string;
  people: number;
  actualCost: number;
}

export interface WhoOwesBlockProps {
  /** фактическая сумма закупки (из общего пайплайна — shoppingTotalFinal) */
  totalActual: number;
  /** реальное число людей (среднее по дням с учётом override) */
  realPeople: number;
  /** разбивка по дням — только для варианта 'stage' */
  days?: WhoOwesDay[];
  /** 'stage' — блок этапа ④ (поровну + дни); 'report' — список участников */
  variant?: 'stage' | 'report';
}

export function WhoOwesBlock({ totalActual, realPeople, days, variant = 'stage' }: WhoOwesBlockProps) {
  const perPerson = totalActual / Math.max(1, realPeople);
  const realPeopleLabel = Number.isInteger(realPeople)
    ? String(realPeople)
    : realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 });

  if (variant === 'report') {
    // Отчёт: «Итог: поровну» — участники 1..N (округлённо вверх по людям)
    return (
      <section className="who-owes" data-testid="report-owe">
        <b style={{ color: 'var(--text)' }}>Итог: поровну</b>
        {Array.from({ length: Math.max(1, Math.round(realPeople)) }, (_, i) => (
          <div className="who-owes__row" key={i}>
            <span className="avatar-chip" aria-hidden>{i + 1}</span>
            <span className="flex-1">Участник {i + 1}</span>
            <b className="keep-num" style={{ color: 'var(--text)' }}>{formatRub(perPerson)}</b>
          </div>
        ))}
      </section>
    );
  }

  return (
    <div className="who-owes max-w-3xl" data-testid="who-owes">
      <b style={{ color: 'var(--text)' }}>Кто сколько должен · при равном делении</b>
      <div className="who-owes__row">
        <span className="keep-pair">
          Поровну на человека
          <InfoTip text={`Фактическая сумма закупки ÷ людей в походе (${realPeopleLabel} чел. — среднее по дням с учётом переопределений).`} />
        </span>
        <b className="keep-num" style={{ color: 'var(--w1)' }}>{formatRub(perPerson)}</b>
      </div>
      {(days ?? []).map(day => (
        <div className="who-owes__row" key={day.dayDate}>
          <span className="keep-pair">
            {new Date(day.dayDate).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}
            <span className="cap" style={{ color: 'var(--text-2)' }}> · {day.people} чел.</span>
          </span>
          <span className="keep-num" style={{ color: 'var(--text-2)' }}>
            {formatRub(day.actualCost)} · <b style={{ color: 'var(--text-1)' }}>{formatRub(day.actualCost / Math.max(1, day.people))}/чел</b>
          </span>
        </div>
      ))}
    </div>
  );
}

export default WhoOwesBlock;
