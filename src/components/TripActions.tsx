/**
 * Подзадача 26 аудита (2026-10-29): шапка страницы похода (кнопка «назад»,
 * название, даты, люди) — вынесена из `TripDetailPage.tsx` (R8/R9).
 * Компонент презентационный: состояние живёт в хуке `useTripDetail`.
 *
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадачи 1/7): кнопка отчёта
 * на мобильном переехала из полосы готовности в этап ④ и в kebab шапки —
 * здесь kebab-меню «Отчёт по походу» / «Печать / PDF» (случайное нажатие
 * исключено, действия только через меню).
 */
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { Button } from './Button';
import KebabMenu from './KebabMenu';
import type { Trip } from '../types/tripDetail';

export interface TripActionsProps {
  trip: Trip;
  /** возврат к списку походов */
  onBack: () => void;
  /** in-app отчёт (подзадача 7): /trips/:id/report */
  onOpenReport?: () => void;
}

export function TripActions({ trip, onBack, onOpenReport }: TripActionsProps) {
  return (
    <div className="flex items-start gap-3 md:gap-4">
      {/* Ревизия скриншотов 29.10: на телефоне кнопка «назад» прижата к верхней
          строке заголовка (items-start), а не висит по центру трёхстрочного h1. */}
      <div className="shrink-0 mt-0.5">
        <Button variant="ghost" onClick={onBack} aria-label="Назад к походам"><ArrowLeft size={20} /></Button>
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl min-[480px]:text-2xl font-bold truncate" style={{ color: 'var(--text)' }}>{trip.name}</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')} • {trip.defaultPeople} чел.
        </p>
      </div>
      {/* Fix-5 (п.10): отчёт переехал в полосу «Готовность похода» — кнопка
          «Сформировать отчёт» живёт там же, где статус; дубль из шапки убран.
          30.10.2026: на мобильном кнопка из полосы убрана вовсе (подзадача 1) —
          отчёт доступен в kebab шапки и на этапе ④. */}
      <div className="shrink-0 mt-0.5">
        <KebabMenu
          label={`Действия с походом: ${trip.name}`}
          testId="trip-kebab"
          items={[
            ...(onOpenReport
              ? [{
                id: 'report',
                label: 'Отчёт по походу',
                icon: <FileDown size={16} aria-hidden />,
                testId: 'kebab-report',
                onSelect: onOpenReport,
              }]
              : []),
            {
              id: 'print',
              label: 'Печать / PDF',
              icon: <Printer size={16} aria-hidden />,
              testId: 'kebab-print',
              onSelect: () => window.open(`/trips/${trip.id}/print`, '_blank'),
            },
          ]}
        />
      </div>
    </div>
  );
}

export default TripActions;
