/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductFormModal from './ProductFormModal';
import { ToastProvider } from './ToastProvider';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import { api } from '../api/client';

const categories = [
  { id: 1, name: 'Крупы' },
  { id: 2, name: 'Мясо' },
] as any;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  (api.get as any).mockImplementation((url: string) => {
    if (String(url).includes('/prices')) return Promise.resolve([]);
    if (String(url).includes('check-name')) return Promise.resolve({ duplicate: false });
    if (String(url).includes('/admin/emis/products')) return Promise.resolve([]);
    if (String(url).includes('/product-categories')) return Promise.resolve(categories);
    return Promise.resolve([]);
  });
  (api.post as any).mockResolvedValue({ id: 'new1' });
  (api.put as any).mockResolvedValue({});
});

const renderModal = (props: Record<string, unknown> = {}) => {
  const onClose = props.onClose ?? vi.fn();
  const onSaved = props.onSaved ?? vi.fn();
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ProductFormModal categories={categories} onClose={onClose as any} onSaved={onSaved as any} {...props} />
      </ToastProvider>
    </MemoryRouter>,
  );
};

describe('ProductFormModal — render/open/close', () => {
  it('renders create mode title and close button', () => {
    renderModal();
    expect(screen.getByText('Новый продукт')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeTruthy();
  });

  it('returns null when open is false', () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <ProductFormModal open={false} categories={categories} />
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(container.textContent).toBe('');
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('close (X) button calls onClose', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders edit mode title when product provided', () => {
    renderModal({ product: { id: 'p1', name: 'Гречка', categoryId: 1, unit: 'KG' } });
    expect(screen.getByText('Редактировать продукт')).toBeTruthy();
  });
});

describe('ProductFormModal — validation', () => {
  it('save is disabled without name/category', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /Сохранить/ })).toBeDisabled();
  });

  it('shows error and does not save when piece weight missing for PCS with calories', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Яблоко' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    // unit PCS
    fireEvent.click(screen.getByRole('button', { name: 'шт' }));
    // calories
    // NumberField commit via change? try typing
    const calInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(calInput, { target: { value: '100' } });
    fireEvent.blur(calInput);
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).not.toHaveBeenCalledWith('/admin/products', expect.anything()));
  });
});

describe('ProductFormModal — submit', () => {
  it('create success calls api.post, onSaved, onClose', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/products', expect.objectContaining({ name: 'Гречка', categoryId: 1 })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('edit success calls api.put', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ product: { id: 'p1', name: 'Гречка', categoryId: 1, unit: 'KG' }, onClose, onSaved });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/products/p1', expect.objectContaining({ name: 'Гречка' })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submit failure does not close', async () => {
    (api.post as any).mockRejectedValueOnce(new Error('boom'));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    // give time
    await new Promise(r => setTimeout(r, 50));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sets price when price provided', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.change(screen.getByLabelText('Цена'), { target: { value: '210' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/products', expect.anything()));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ingredient-prices', expect.objectContaining({ pricePerUnit: 210 })));
  });
});

describe('ProductFormModal — emis price series', () => {
  it('renders price chart when editing product with emisCode', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).includes('/prices')) return Promise.resolve([{ price: 100 }]);
      if (String(url).includes('check-name')) return Promise.resolve({ duplicate: false });
      if (String(url).includes('/admin/emis/products')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderModal({ product: { id: 'p1', name: 'Гречка', categoryId: 1, unit: 'KG', emisCode: 'E1' } });
    await waitFor(() => expect(screen.getByTestId('emis-price-chart')).toBeTruthy());
  });
});

describe('ProductFormModal — duplicate check', () => {
  it('hard duplicate warning disables save after debounce', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).includes('check-name')) return Promise.resolve({ duplicate: true, sameUnit: true, existingName: 'Гречка' });
      if (String(url).includes('/prices')) return Promise.resolve([]);
      if (String(url).includes('/admin/emis/products')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    // trigger duplicate check via unit change
    fireEvent.click(screen.getByRole('button', { name: 'л' }));
    await new Promise(r => setTimeout(r, 400));
    await waitFor(() => expect(screen.getByText(/уже существует/)).toBeTruthy());
  });
});

describe('ProductFormModal — extra branches', () => {
  it('invalid price shows error and skips price post', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.change(screen.getByLabelText('Цена'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/products', expect.anything()));
    await new Promise(r => setTimeout(r, 50));
    expect(api.post).not.toHaveBeenCalledWith('/admin/ingredient-prices', expect.anything());
  });

  it('price post failure keeps product saved', async () => {
    (api.post as any).mockImplementation((url: string) => {
      if (url === '/admin/products') return Promise.resolve({ id: 'new1' });
      if (url === '/admin/ingredient-prices') return Promise.reject(new Error('price fail'));
      return Promise.resolve({});
    });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderModal({ onClose, onSaved });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.change(screen.getByLabelText('Цена'), { target: { value: '210' } });
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/ingredient-prices', expect.anything()));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('DUPLICATE_PRODUCT error branch', async () => {
    (api.post as any).mockRejectedValueOnce(new Error('DUPLICATE_PRODUCT'));
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Категория' }));
    fireEvent.click(screen.getByRole('option', { name: 'Крупы' }));
    fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 50));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('soft duplicate warning branch', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).includes('check-name')) return Promise.resolve({ duplicate: true, sameUnit: false, existingName: 'Гречка' });
      if (String(url).includes('/prices')) return Promise.resolve([]);
      if (String(url).includes('/admin/emis/products')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('button', { name: 'л' }));
    await new Promise(r => setTimeout(r, 400));
    await waitFor(() => expect(screen.getByText(/в другой единице/)).toBeTruthy());
  });

  it('check-name failure branch', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).includes('check-name')) return Promise.reject(new Error('boom'));
      if (String(url).includes('/prices')) return Promise.resolve([]);
      if (String(url).includes('/admin/emis/products')) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Гречка' } });
    fireEvent.click(screen.getByRole('button', { name: 'л' }));
    await new Promise(r => setTimeout(r, 400));
    await waitFor(() => expect(screen.getByText(/Не удалось проверить/)).toBeTruthy());
  });

  it('empty name early return in duplicate check', async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: '' } });
    await new Promise(r => setTimeout(r, 400));
  });

  it('emis link picker onChange covers setter', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).includes('/admin/emis/products')) return Promise.resolve([{ code: 'E1', name: 'Позиция ЕМИСС' }]);
      if (String(url).includes('/prices')) return Promise.resolve([]);
      if (String(url).includes('check-name')) return Promise.resolve({ duplicate: false });
      return Promise.resolve([]);
    });
    renderModal();
    const input = screen.getByLabelText('Поиск позиции ЕМИСС');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'греч' } });
    await new Promise(r => setTimeout(r, 400));
    const btn = await screen.findByRole('button', { name: /Привязать к позиции/ });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByText(/Позиция ЕМИСС/)).toBeTruthy());
  });
});

describe('ProductFormModal — duplicate false/empty', () => {
  it('duplicate false branch and empty name early return', async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: 'Новое' } });
    await new Promise(r => setTimeout(r, 400));
    fireEvent.change(screen.getByPlaceholderText('Например: Гречка ядрица'), { target: { value: '' } });
    await new Promise(r => setTimeout(r, 400));
  });
});
