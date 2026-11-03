/**
 * trip-workflow-redesign п.5: отчёт больше не одинокая страница —
 * роут /trips/:id/report редиректит на /trips/:id?stage=ready (шаринг-ссылки
 * не ломаются), контент отчёта живёт этапом ⑤ «Поход готов».
 */
/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import ReportRedirect from './ReportRedirect';

function Probe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

describe('ReportRedirect — redesign п.5', () => {
  it('/trips/:id/report → /trips/:id?stage=ready (replace)', () => {
    render(
      <MemoryRouter initialEntries={['/trips/77/report']}>
        <Routes>
          <Route path="/trips/:id/report" element={<ReportRedirect />} />
          <Route path="/trips/:id" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('loc').textContent).toBe('/trips/77?stage=ready');
  });
});
