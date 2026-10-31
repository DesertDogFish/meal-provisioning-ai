/**
 * План plans/2026-10-31-ux-audit-cleanup-dedup.md (п.2/п.3): раздел «Интеграции»
 * — одна витрина с табами «Настройка | Журнал синков | Импорт каталога».
 * Проверяются: переключение табов, deep-link ?tab=, перенесённый стагинг-флоу
 * (approve/reject) и «единственный триггер синка» (из журнала — ссылка-действие).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('../components/ToastProvider', () => ({
  useToast: () => ({ showError, showSuccess }),
}));

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock('../api/client', async () => {
  class ApiClientError extends Error {
    error: any;
    constructor(error: any) { super(error?.detail ?? 'api error'); this.error = error; }
  }
  return {
    ApiClientError,
    api: {
      get: (...args: unknown[]) => getMock(...args),
      post: (...args: unknown[]) => postMock(...args),
      postFile: vi.fn(),
    },
  };
});

import IntegrationsPage from './IntegrationsPage';

const FULL_LOG = {
  id: 7, provider: 'ROSSTAT', type: 'PRICES', status: 'SUCCESS',
  triggeredBy: 'MANUAL', triggeredUserEmail: 'admin@provision.app',
  startedAt: '2026-10-30T10:00:00Z', finishedAt: '2026-10-30T10:00:05Z',
  durationSeconds: 5, createdCount: 1, updatedCount: 2, errorCount: 0,
  details: { requestCount: 3, items: [], errors: [] },
};

/** Запуск с полными деталями (items/errors/fatalError) — для drawer-теста (R5, cleanup-п.10). */
const DETAILED_LOG = {
  id: 8, provider: 'ROSSTAT', type: 'PRICES', status: 'PARTIAL',
  triggeredBy: 'SCHEDULED', triggeredUserEmail: '',
  startedAt: '2026-10-30T04:00:00Z', finishedAt: '2026-10-30T04:00:02Z',
  durationSeconds: null, createdCount: 1, updatedCount: 1, errorCount: 2,
  details: {
    requestCount: 2,
    fatalError: 'Источник частично недоступен',
    items: [
      { productId: 1, productName: 'Гречка', externalCode: 'X1', priceDate: '2026-10-29', oldPrice: 10, newPrice: 12.5, action: 'UPDATED', reason: 'Рост цены', anomaly: true },
      { productId: 2, productName: 'Соль', externalCode: 'X2', priceDate: '2026-10-29', oldPrice: null, newPrice: null, action: 'CREATED', reason: null, anomaly: false },
    ],
    errors: [
      { externalCode: 'X3', message: 'о'.repeat(200) },
      { externalCode: 'X4', message: 'короткая' },
    ],
  },
};

const STAGING = [
  { id: 1, source: 'AI', status: 'PENDING', suggestedName: 'Каша гречневая', suggestedMealType: 'DINNER', suggestedIngredients: [{ mappedIngredientId: 'ing1', amount: 1 }] },
  { id: 3, source: 'MANUAL', status: 'APPROVED', suggestedName: 'Чай с лимоном', suggestedMealType: 'SNACK', suggestedIngredients: [] },
];

function routeGet(path: string) {
  if (path.startsWith('/admin/integrations/sync-logs')) return [];
  if (path.startsWith('/admin/integrations')) return [{ id: 1, provider: 'ROSSTAT', status: 'CONNECTED', baseUrl: '', lastConnectedAt: null, lastSyncAt: null, errorMessage: null }];
  if (path.startsWith('/admin/sync-logs/kpi')) return { totalRuns: 1, successRate: 100, totalUpdated: 2, totalErrors: 0 };
  if (path.startsWith('/admin/sync-logs')) return [FULL_LOG];
  if (path.startsWith('/admin/staging')) return STAGING;
  return [];
}

function renderPage(initialEntry = '/integrations') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <IntegrationsPage />
    </MemoryRouter>
  );
}

describe('IntegrationsPage: табы раздела (cleanup-п.2/3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async (path: string) => routeGet(path));
    postMock.mockResolvedValue(null);
  });

  it('по умолчанию открыт таб «Настройка»: карточка ЕМИСС, журнала и импорта нет', async () => {
    renderPage();
    expect(await screen.findByTestId('emis-settings-tab')).toBeTruthy();
    expect(screen.queryByTestId('sync-logs-tab')).toBeNull();
    expect(screen.queryByTestId('catalog-import-tab')).toBeNull();
    // единственный триггер синка — здесь
    expect(screen.getByRole('button', { name: /синхронизировать цены/i })).toBeTruthy();
    // navigation-п.7: «Продукты» — ссылка, а не текст-инструкция
    expect(screen.getByTestId('link-products').closest('a')).toBeTruthy();
  });

  it('клик «Журнал синков» открывает полный журнал (KPI, строка, детали)', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId('integrations-tab-logs'));
    const tab = await screen.findByTestId('sync-logs-tab');
    expect(within(tab).getByTestId('sync-kpi')).toBeTruthy();
    expect(within(tab).getByTestId('sync-log-row-7')).toBeTruthy();
    // детали запуска — drawer
    await user.click(within(tab).getByTestId('sync-log-details-7'));
    expect(await screen.findByText(/Запуск #7/)).toBeTruthy();
    // «Повторить запуск» — ссылка-действие на таб «Настройка», БЕЗ своего POST
    await user.click(screen.getByTestId('sync-drawer-goto-settings'));
    await waitFor(() => expect(screen.getByTestId('emis-settings-tab')).toBeTruthy());
    expect(postMock).not.toHaveBeenCalled();
  });

  it('deep-link /integrations?tab=logs открывает журнал сразу', async () => {
    renderPage('/integrations?tab=logs');
    expect(await screen.findByTestId('sync-logs-tab')).toBeTruthy();
    expect(screen.queryByTestId('emis-settings-tab')).toBeNull();
  });

  it('таб «Импорт каталога»: стагинг-флоу approve/reject переехал с /admin', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('не подходит');
    renderPage();
    await user.click(await screen.findByTestId('integrations-tab-import'));
    const tab = await screen.findByTestId('catalog-import-tab');
    // PENDING — с кнопками, APPROVED — без
    expect(within(tab).getByTestId('staging-card-1')).toBeTruthy();
    expect(within(tab).queryByTestId('staging-approve-3')).toBeNull();

    await user.click(within(tab).getByTestId('staging-approve-1'));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith(
      '/admin/staging/1/approve',
      expect.objectContaining({ name: 'Каша гречневая', mealType: 'DINNER' }),
    ));
    expect(showSuccess).toHaveBeenCalledWith('Блюдо одобрено и добавлено в каталог');

    await user.click(within(tab).getByTestId('staging-reject-1'));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/admin/staging/1/reject', { reason: 'не подходит' }));
    expect(promptSpy).toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it('ошибка загрузки журнала — тост, страница не падает', async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/sync-logs') && !path.includes('kpi')) throw new Error('boom');
      return routeGet(path);
    });
    renderPage('/integrations?tab=logs');
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Не удалось загрузить журнал синков'));
  });
  it('журнал: детали запуска — фатальная ошибка, items, обрезка длинных ошибок, ссылка в «Настройку» (R5)', async () => {
    getMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/sync-logs/kpi')) return { totalRuns: 2, successRate: 50, totalUpdated: 3, totalErrors: 2 };
      if (path.startsWith('/admin/sync-logs')) return [DETAILED_LOG, FULL_LOG];
      return routeGet(path);
    });
    renderPage('/integrations?tab=logs');
    await screen.findByTestId('sync-log-row-8');
    await userEvent.click(screen.getByTestId('sync-log-details-8'));

    // шапка drawer и фатальная ошибка — первым блоком (Fix-15)
    expect(await screen.findByText(/Запуск #8/)).toBeTruthy();
    expect(screen.getByText(/Источник частично недоступен/)).toBeTruthy();
    // плановый запуск, длительность неизвестна (в таблице и в drawer)
    expect(screen.getAllByText(/планово/).length).toBeGreaterThanOrEqual(2);

    // постатейная таблица: старая → новая цена, чип действия, причина, «—» без цен
    expect(screen.getByText('Гречка')).toBeTruthy();
    expect(screen.getByText('10.00')).toBeTruthy();
    expect(screen.getByText('12.50')).toBeTruthy();
    expect(screen.getByText('UPDATED')).toBeTruthy();
    expect(screen.getByText('Рост цены')).toBeTruthy();
    expect(screen.getByText('CREATED')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);

    // Fix-11 (п.9): длинное сообщение обрезано до 160 символов, полный текст — в title
    const longChip = screen.getByTitle('о'.repeat(200));
    expect(longChip.textContent).toContain('…');
    expect(longChip.textContent!.length).toBeLessThan(180);
    // короткое — без обрезки
    expect(screen.getByText((_, el) => el?.textContent === 'X4 · короткая')).toBeTruthy();

    // «Повторить запуск» — ссылка-действие в таб «Настройка» (единственный триггер, cleanup-п.3)
    await userEvent.click(screen.getByTestId('sync-drawer-goto-settings'));
    expect(await screen.findByTestId('emis-settings-tab')).toBeTruthy();

    // запуск без постатейных данных — честная пустота
    await userEvent.click(screen.getByTestId('integrations-tab-logs'));
    await screen.findByTestId('sync-log-row-7');
    await userEvent.click(screen.getByTestId('sync-log-details-7'));
    expect(await screen.findByText('Постатейных данных нет.')).toBeTruthy();
    // закрытие drawer
    await userEvent.click(screen.getByLabelText('Закрыть детали запуска'));
    await waitFor(() => expect(screen.queryByText(/Запуск #7/)).toBeNull());
  });

});
