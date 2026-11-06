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
import { ArrowLeft } from 'lucide-react'; // redesign п.6: kebab удалён (FileDown/Printer жили в нём)

import type { Trip } from '../types/tripDetail';

import { AppMenuButton } from './AppMenuButton';
import { HeaderIconButton } from './HeaderIconButton';

export interface TripActionsProps {
  trip: Trip;
  /** возврат к списку походов */
  onBack: () => void;
}

export function TripActions({ trip, onBack }: TripActionsProps) {
  return (
    <div className="trip-head-row">
      {/* UX-список владельца: кнопка меню — размером с заголовок и перед «назад»;
          даты/люди начинаются под кнопками на всю ширину. */}
      <div className="flex items-center gap-1 min-w-0">
        <AppMenuButton />
        <HeaderIconButton label="Назад к походам" onClick={onBack} testId="trip-back">
          <ArrowLeft size={20} />
        </HeaderIconButton>
        <h1 className="text-xl min-[480px]:text-2xl font-bold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>{trip.name}</h1>
      </div>
      <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
        {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')} • {trip.defaultPeople} чел.
      </p>
    </div>
  );

}

export default TripActions;
