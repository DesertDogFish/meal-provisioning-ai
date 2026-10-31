/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * План plans/done/2026-10-31-ux-audit-navigation.md (п.7): текст-инструкция
 * «выполните синхронизацию на странице «Интеграции»» — ссылка (deep-link на
 * таб «Настройка»), а не мёртвый текст. Проверяем на роутере (критерий п.7:
 * «клик переводит без потери контекста — тесты на роутере»).
 */

vi.mock('../api/client', () => ({
  api: { get: vi.fn(async () => []) },
}));

import { EmisLinkPicker } from './EmisLinkPicker';

beforeEach(() => { vi.clearAllMocks(); });

describe('EmisLinkPicker — cross-link «Интеграции» (navigation-п.7)', () => {
  it('в пустом результате «Интеграции» — ссылка на /integrations?tab=settings', async () => {
    render(
      <MemoryRouter>
        <EmisLinkPicker value="" onChange={() => {}} />
      </MemoryRouter>
    );
    const input = screen.getByLabelText('Поиск позиции ЕМИСС');
    fireEvent.focus(input); // открывает панель поиска
    expect(await screen.findByText(/Ничего не найдено/)).toBeTruthy();
    const link = screen.getByTestId('link-integrations');
    expect(link.closest('a')?.getAttribute('href')).toBe('/integrations?tab=settings');
  });
});
