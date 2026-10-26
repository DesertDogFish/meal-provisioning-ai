/// <reference types="vitest/globals" />
// Scratch-repro: правка блюда, используемого в походе (mock-режим, настоящий mockServer)
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import RecipesPage from './RecipesPage';
import { ToastProvider } from '../components/ToastProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { mockServer } from '../api/mockServer';

beforeEach(() => {
  localStorage.setItem('apiMode', 'mock');
  localStorage.setItem('accessToken', 'mock-access-token-1');
});

describe('repro: редактирование занятого блюда', () => {
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
        <ErrorBoundary>
          <ToastProvider>
            <RecipesPage />
          </ToastProvider>
        </ErrorBoundary>
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
