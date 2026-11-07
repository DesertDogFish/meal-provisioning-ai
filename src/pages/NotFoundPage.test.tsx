/**
 * BL-66: страница «Страница не найдена» — видимый 404-фидбек и рабочий выход.
 * Проверяем ровно контракт карточки: заголовок + CTA ведёт на /trips.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import NotFoundPage from './NotFoundPage';

function renderAt(initial: string) {
  return render(
    // ключ истории явно не 'default' — это навигация ВНУТРИ сессии, а не холодный старт
    <MemoryRouter initialEntries={[{ pathname: initial, key: 'in-session' }]}>
      <Routes>
        <Route path="/trips" element={<div data-testid="trips-stub">Походы</div>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotFoundPage (BL-66)', () => {
  // п.17: редирект на /trips срабатывает ТОЛЬКО на холодном старте (первая запись истории,
  // её ключ — 'default'); внутри сессии у записи свой ключ, поэтому 404 честный.

  it('показывает заголовок и подсказку про опечатку в адресе', () => {
    renderAt('/ololo');
    expect(screen.getByTestId('not-found-page')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeTruthy();
    expect(screen.getByText(/опечатка или страница переехала/i)).toBeTruthy();
  });

  it('CTA «К списку походов» ведёт на канон /trips', () => {
    renderAt('/ololo');
    fireEvent.click(screen.getByTestId('not-found-cta'));
    expect(screen.getByTestId('trips-stub')).toBeTruthy();
  });

  it('рендерится на любом неизвестном вложенном маршруте', () => {
    renderAt('/trips/t1/whatever/ololo');
    expect(screen.getByTestId('not-found-page')).toBeTruthy();
  });
});

describe('NotFoundPage — холодный старт (UX-список владельца п.17)', () => {
  it('после рестарта неизвестный URL сразу уводит на /trips', async () => {
    // флаг «booting» взведён по умолчанию при загрузке модуля — эмулируем старт приложения
    vi.resetModules();
    const { default: NotFound } = await import('./NotFoundPage');
    render(
      <MemoryRouter initialEntries={['/undefined']}>
        <Routes>
          <Route path="/trips" element={<div data-testid="trips-stub">Походы</div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('trips-stub')).toBeTruthy();
  });
});
