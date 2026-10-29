/**
 * Подзадача 26 аудита (2026-10-29): шапка страницы похода (кнопка «назад»,
 * название, даты, люди) — вынесена из `TripDetailPage.tsx` (R8/R9).
 * Компонент презентационный: состояние живёт в хуке `useTripDetail`.
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import type { Trip } from '../types/tripDetail';

export interface TripActionsProps {
  trip: Trip;
  /** возврат к списку походов */
  onBack: () => void;
}

export function TripActions({ trip, onBack }: TripActionsProps) {
  return (
    <div className="flex items-start gap-4">
      {/* Ревизия скриншотов 29.10: на телефоне кнопка «назад» прижата к верхней
          строке заголовка (items-start), а не висит по центру трёхстрочного h1. */}
      <div className="shrink-0 mt-0.5">
        <Button variant="ghost" onClick={onBack} aria-label="Назад к походам"><ArrowLeft size={20} /></Button>
      </div>
      <div className="flex-1">
        <h1 className="text-xl min-[480px]:text-2xl font-bold" style={{ color: 'var(--text)' }}>{trip.name}</h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')} • {trip.defaultPeople} чел.
        </p>
      </div>
      {/* Fix-5 (п.10): отчёт переехал в полосу «Готовность похода» — кнопка
          «Сформировать отчёт» живёт там же, где статус; дубль из шапки убран */}
    </div>
  );
}

export default TripActions;
