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
import { Button } from './Button';
import type { Trip } from '../types/tripDetail';

export interface TripActionsProps {
  trip: Trip;
  /** возврат к списку походов */
  onBack: () => void;
}

export function TripActions({ trip, onBack }: TripActionsProps) {
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
    </div>
  );
}

export default TripActions;
