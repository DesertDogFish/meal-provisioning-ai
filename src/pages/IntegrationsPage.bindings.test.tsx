// Fix-14: привязка товара к источнику (Росстат/ЕМИСС).
// Покрывает три боли пользователя:
//  1) «Mapping already exists» — теперь повторная привязка = upsert (не ошибка);
//  2) «хрен знает что там есть» — виден список текущих привязок + можно отвязать;
//  3) «в результате даже цена не высвечивается» — поиск сразу показывает цену.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock('../components/ToastProvider', () => ({
  useToast: () => ({ showError, showSuccess }),
}));

const getMock = vi.fn();
const postMock = vi.fn();
const delMock = vi.fn();
vi.mock('../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: (...a: unknown[]) => postMock(...a),
    del: (...a: unknown[]) => delMock(...a),
  },
}));

import IntegrationsPage from './IntegrationsPage';

const CONNECTED = {
  id: 1, provider: 'ROSSTAT', status: 'CONNECTED', baseUrl: 'https://www.fedstat.ru',
  lastConnectedAt: '2026-10-27T10:00:00Z', lastSyncAt: null, errorMessage: null,
};
const INGREDIENTS = [
  { id: '5', name: 'Апельсины' },
  { id: '6', name: 'Бананы' },
];

// Текущие привязки (мутируется между сценариями)
let bindings: any[] = [];

function routerGet(path: string) {
  if (path === '/admin/integrations') return [CONNECTED];
  if (path === '/admin/integrations/sync-logs') return [];
  if (path === '/admin/products') return INGREDIENTS;
  if (path === '/admin/integrations/ROSSTAT/mappings') return bindings.map(b => ({ ...b }));
  if (path.startsWith('/admin/integrations/ROSSTAT/products/search')) {
    // Реальный бэкенд (Fix-14) отдаёт цену категории из выгрузки
    return [{
      code: '1754800', name: 'Бананы, кг', brand: 'Росстат',
      packAmount: 1, packUnit: 'KG', imageUrl: null,
      price: 173.45, priceDate: '2026-09-01',
    }];
  }
  return [];
}

describe('IntegrationsPage: Fix-14 привязки и цены', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindings = [
      { mappingId: 99, ingredientId: 5, ingredientName: 'Апельсины', externalCode: '1743453',
        externalName: 'Апельсины, кг', packAmount: 1, packUnit: 'KG', createdAt: '2026-10-27T10:00:00Z' },
    ];
    getMock.mockImplementation(async (path: string) => routerGet(path));
    postMock.mockImplementation(async (path: string, body: any) => {
      if (/\/mapping$/.test(path)) {
        const id = Number(path.match(/ingredients\/(\d+)\/mapping/)![1]);
        const existing = bindings.find(b => b.ingredientId === id);
        if (existing) { existing.externalCode = body.externalCode; }
        else bindings.push({ mappingId: Date.now(), ingredientId: id, ingredientName: '?',
          externalCode: body.externalCode, externalName: null, packAmount: body.packAmount,
          packUnit: body.packUnit, createdAt: new Date().toISOString() });
        return null;
      }
      return null;
    });
    delMock.mockImplementation(async (path: string) => {
      const m = path.match(/ingredients\/(\d+)\/mapping/);
      if (m) bindings = bindings.filter(b => b.ingredientId !== Number(m[1]));
      return null;
    });
  });

  it('показывает список текущих привязок (что уже связано)', async () => {
    render(<IntegrationsPage />);
    await waitFor(() => expect(screen.getByText('Текущие привязки')).toBeTruthy());
    await waitFor(() => expect(screen.getByText(/1743453/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Отвязать Апельсины/ })).toBeTruthy();
  });

  it('отвязка удаляет привязку из списка (DELETE)', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />);
    await waitFor(() => expect(screen.getByText(/1743453/)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /Отвязать Апельсины/ }));

    await waitFor(() => expect(delMock).toHaveBeenCalledWith(
      '/admin/integrations/ingredients/5/mapping/ROSSTAT'));
    await waitFor(() => expect(screen.queryByText(/1743453/)).toBeNull());
    expect(screen.getByText(/Пока ничего не привязано/)).toBeTruthy();
    expect(showSuccess).toHaveBeenCalled();
  });

  it('поиск показывает цену категории до привязки', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />);
    await waitFor(() => expect(screen.getByText('Текущие привязки')).toBeTruthy());

    // Выбираем ингредиент «Бананы» (id 6) через CustomSelect (combobox + portal-listbox)
    await user.click(screen.getByRole('combobox', { name: 'Ингредиент для привязки' }));
    await user.click(await screen.findByRole('option', { name: 'Бананы' }));

    // Вводим запрос и жмём «Найти»
    await user.type(screen.getByPlaceholderText('Введите название продукта...'), 'банан');
    await user.click(screen.getByRole('button', { name: 'Найти товар' }));

    // Цена высвечивается в результате (173,45 ₽), а не «Цена появится после синхронизации»
    await waitFor(() => expect(screen.getByText('Бананы, кг')).toBeTruthy());
    expect(screen.getByText(/173,45/)).toBeTruthy();
  });

  it('привязка отправляет upsert-POST и не падает на «already exists»', async () => {
    const user = userEvent.setup();
    render(<IntegrationsPage />);
    await waitFor(() => expect(screen.getByText('Текущие привязки')).toBeTruthy());

    await user.click(screen.getByRole('combobox', { name: 'Ингредиент для привязки' }));
    await user.click(await screen.findByRole('option', { name: 'Бананы' }));
    await user.type(screen.getByPlaceholderText('Введите название продукта...'), 'банан');
    await user.click(screen.getByRole('button', { name: 'Найти товар' }));
    await waitFor(() => expect(screen.getByText('Бананы, кг')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Привязать товар' }));

    await waitFor(() => expect(postMock).toHaveBeenCalledWith(
      '/admin/integrations/ingredients/6/mapping',
      expect.objectContaining({ provider: 'ROSSTAT', externalCode: '1754800', packUnit: 'KG' }),
    ));
    // Никакой красной ошибки — привязка успешна
    expect(showError).not.toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalled();
  });
});
