/// <reference types="vitest/globals" />
/**
 * Сценарный тест (переименован из отладочного RecipesEditRepro.test.tsx —
 * подзадача 10.3 аудита 02.11.2026, BL-65): правка блюда, используемого в походе
 * (mock-режим, настоящий mockServer). Рецепты в походах живут на снепшотах (V20),
 * поэтому редактирование базового блюда обязано проходить без блокировок и
 * ошибок ErrorBoundary.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';

import { ToastProvider } from '../components/ToastProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthProvider } from '../components/AuthProvider'; // cleanup-п.7
import { mockServer } from '../api/mockServer';

import RecipesPage from './RecipesPage';

beforeEach(() => {
  localStorage.setItem('apiMode', 'mock');
  localStorage.setItem('accessToken', 'mock-access-token-1');
});

describe('RecipesPage — редактирование блюда, используемого в походе', () => {
  it('открывает редактор и сохраняет блюдо, используемое в походе', async () => {
    // создаём поход и приём → блюдо становится «занятым» (снепшот)
    const recipes = mockServer.handleRequest<any[]>('GET', '/recipes');
    const used = recipes.find(r => (r.ingredients || []).length >= 1) ?? recipes[0];
    const trip = mockServer.handleRequest<any>('POST', '/trips', {
      name: 'Repro', startDate: '2026-06-01', endDate: '2026-06-02', defaultPeople: 2,
    });
    mockServer.handleRequest('POST', `/trips/${trip.id}/days/${trip.days[0].id}/meals`, {
      recipeId: used.id, mealType: 'LUNCH',
    });

    render(
      <MemoryRouter initialEntries={[`/recipes?edit=${used.id}`]}>
        <AuthProvider>
          <ErrorBoundary>
            <ToastProvider>
              <RecipesPage />
            </ToastProvider>
          </ErrorBoundary>
        </AuthProvider>
      </MemoryRouter>
    );

    // редактор открылся
    const nameInput = await screen.findByLabelText('Название', {}, { timeout: 4000 });
    expect((nameInput as HTMLInputElement).value).toBe(used.name);

    // меняем имя и сохраняем
    fireEvent.change(nameInput, { target: { value: used.name + ' RIGHT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => {
      const updated = mockServer.handleRequest<any[]>('GET', '/recipes').find(r => r.id === used.id);
      expect(updated.name).toBe(used.name + ' RIGHT');
    }, { timeout: 4000 });
    // ErrorBoundary не сработал
    expect(screen.queryByText(/An unexpected error/i)).toBeNull();
  });
});
