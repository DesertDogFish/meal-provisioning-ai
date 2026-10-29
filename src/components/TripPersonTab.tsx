/**
 * Подзадача 26 аудита (2026-10-29): вкладка «На человека» — вынесена из
 * `TripDetailPage.tsx` (R8/R9). Сводка (приёмы, люди, суммы, калории) и
 * таблица продуктов на одного участника. Компонент презентационный:
 * факт-цены и исключения уже применены в `deriveTripView`.
 */
import TabHeader from './TabHeader';
import InfoTip from './InfoTip';
import { formatAmount } from '../utils/calculations';
import { formatRub } from '../utils/formatRub';
import type { TripView } from '../utils/tripDerived';
import type { Trip } from '../types/tripDetail';

export interface TripPersonTabProps {
  trip: Trip;
  /** U33: среднее число участников по дням (с учётом peopleOverride) */
  realPeople: number;
  tripSummary: {
    costPerDefaultPerson: number;
    costPerPersonMeal: number;
    caloriesPerPersonMeal?: number | null;
  };
  /** U28: строки отсортированы по алфавиту; факт-цены применены */
  personSummary: TripView['personSummary'];
}

export function TripPersonTab({ trip, realPeople, tripSummary, personSummary }: TripPersonTabProps) {
  return (
    <div className="space-y-4 max-w-4xl">
      {/* Fix-5 (п.2/3/4/6): единая шапка + человеческие названия вместо
          «человеко-приёмов» и «на чел./приём», у каждого числа — тултип с формулой */}
      <TabHeader
        title="На человека"
        subtitle="Сколько продуктов и денег приходится на одного участника — за поход и за один приём пищи"
      />
      <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>Сводка</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {/* Fix-7 (п.29): считаем ПРИЁМЫ (завтраки+обеды+ужины+перекусы),
                  а не человеко-приёмы */}
              <span className="keep-pair">
                Приёмов пищи всего
                <InfoTip text="Число приёмов пищи во всём меню: завтраки + обеды + ужины + перекусы по всем дням." />
              </span>
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>
              {(trip.days ?? []).reduce((a, d) => a + (d.meals?.length ?? 0), 0)}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              <span className="keep-pair">
                Людей в походе
                <InfoTip text="Среднее число участников по дням (переопределения «людей на день» учитываются). На него делятся общие суммы." />
              </span>
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{Math.round(realPeople * 10) / 10}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              <span className="keep-pair">
                На человека за поход
                <InfoTip text="Общая стоимость закупки ÷ людей в походе. Столько платит каждый участник при равном делении." />
              </span>
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerDefaultPerson)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              <span className="keep-pair">
                На человека за приём
                <InfoTip text="Общая стоимость ÷ число приёмов пищи (люди × приёмы). Средняя цена одного приёма на одного человека." />
              </span>
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{formatRub(tripSummary.costPerPersonMeal)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              <span className="keep-pair">
                Калории за приём
                <InfoTip text="Средняя калорийность одного приёма пищи на человека — считается из продуктов блюд." />
              </span>
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{tripSummary.caloriesPerPersonMeal ? `${Math.round(tripSummary.caloriesPerPersonMeal)} ккал` : '—'}</p>
          </div>
        </div>
      </div>

      {/* Per person products */}
      <div className="rounded-xl overflow-hidden mob-scroll table-cards" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>Продукты на человека</h3>
        </div>
        {/* Fix-6 (п.23): без внутреннего скролла */}
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--elev)' }}>
              <tr>
                <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Продукт</th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                  <span className="keep-pair">
                    На человека
                    <InfoTip text="Количество продукта на одного участника за ВЕСЬ поход: общее количество ÷ людей в походе." />
                  </span>
                </th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                  <span className="keep-pair">
                    На чел./приём
                    <InfoTip text="Среднее количество на одного человека за один приём пищи: общее количество ÷ приёмов пищи всего." />
                  </span>
                </th>
                <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>
                  <span className="keep-pair">
                    Стоимость на человека
                    <InfoTip text="Стоимость этого продукта на одного участника за весь поход (с фактическими ценами, если чек введён)." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody style={{ borderTop: '1px solid var(--border)' }}>
              {personSummary.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="row-title px-4 py-2.5" data-label="" style={{ color: 'var(--text)' }}>{item.ingredientName}</td>
                  <td className="keep-num px-4 py-2.5 text-right" data-label="На человека" style={{ color: 'var(--muted)' }}>{formatAmount(item.amountPerDefaultPerson, item.unit)}</td>
                  <td className="keep-num px-4 py-2.5 text-right" data-label="На чел./приём" style={{ color: 'var(--muted)' }}>{formatAmount(item.amountPerPersonMeal, item.unit)}</td>
                  <td className="keep-num px-4 py-2.5 text-right" data-label="Стоимость" style={{ color: 'var(--text)' }}>
                    {item.costPerDefaultPerson != null ? formatRub(item.costPerDefaultPerson) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
}

export default TripPersonTab;
