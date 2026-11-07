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
import type { Trip } from '../types/tripDetail';

import { AppMenuButton } from './AppMenuButton';

export interface TripActionsProps {
  trip: Trip;
}

export function TripActions({ trip }: TripActionsProps) {
  return (
    <div className="trip-head-row">
      {/* Просьба владельца 07.11.2026: дублирующая стрелка «назад» убрана —
          из похода выходят кнопкой меню (слева от заголовка). Даты и число
          людей тоже убраны: они есть в сводке похода (.trip-strip / KPI). */}
      <div className="flex items-center gap-1 min-w-0">
        <AppMenuButton />
        <h1 className="text-xl min-[480px]:text-2xl font-bold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>{trip.name}</h1>
      </div>
    </div>
  );

}

export default TripActions;
