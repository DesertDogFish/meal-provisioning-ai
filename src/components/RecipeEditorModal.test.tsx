/// <reference types="vitest/globals" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import RecipeEditorModal from './RecipeEditorModal';
import { ToastProvider } from './ToastProvider';

const products = [
  { id: 'p1', name: 'Гречка', unit: 'KG', kcalPer100g: 313, pieceWeightG: null },
  { id: 'p2', name: 'Тушенка говяжья 325 г', unit: 'PCS', kcalPer100g: 215, pieceWeightG: 325 },
];

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  getRecipes: vi.fn(),
  humanize: (n: number, u: string) => `${n} ${u}`,
  formatMoney: (v: number) => String(v),
  UNIT_LABELS: { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' },
}));

import { api } from '../api/client';

const renderEditor = (recipe: any = null, props: Record<string, unknown> = {}) =>
  render(
    <ToastProvider>
      <RecipeEditorModal recipe={recipe} categories={['Супы', 'Каши']} onClose={vi.fn()} onSaved={vi.fn()} {...props} />
    </ToastProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as any).mockResolvedValue({ content: products, totalElements: products.length });
  (api.post as any).mockResolvedValue({ id: 'r99' });
  (api.put as any).mockResolvedValue({ id: 'r1' });
});

describe('RecipeEditorModal — создание', () => {
  it('рендерит форму и превью ккал после выбора продуктов', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/products', { params: { size: '1000' } }));
    expect(screen.getByLabelText('Название')).toBeTruthy();
    expect(screen.getByText('Состав (количество на 1 порц.)')).toBeTruthy();
  });

  it('сохраняет payload контракта RecipeRequest', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Тестовое блюдо' } });
    fireEvent.click(screen.getByRole('button', { name: 'Обед' }));

    fireEvent.click(screen.getByRole('button', { name: /ингредиент/ }));
    const productInput = screen.getByLabelText('Продукт');
    fireEvent.focus(productInput);
    fireEvent.change(productInput, { target: { value: 'греч' } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /Гречка/ }));
    // U31: AmountInput для KG — ввод в граммах: 100 г = 0,1 кг (без «0,1 кг» дробями)
    fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: 'Создать блюдо' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/admin/recipes',
        expect.objectContaining({
          name: 'Тестовое блюдо',
          mealType: 'LUNCH',
          cookMinutes: 0,
          baseServings: 1,
          ingredients: [{ ingredientId: 'p1', amount: 0.1 }],
        })
      )
    );
    // превью ккал: 0.1 кг гречки = 313 ккал на порцию
    expect(screen.getByText(/313 ккал\/порция/)).toBeTruthy();
  });

  it('валидация: пустое имя и пустой состав блокируют сохранение', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Создать блюдо' }));
    // UX-осмотр 31.10 (п.2): RU-копи вместо технических шаблонов Jakarta
    expect(await screen.findByText(/Укажите название блюда/)).toBeTruthy();
    expect(screen.getByText(/Добавьте хотя бы один ингредиент/)).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('строку состава можно удалить', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /ингредиент/ }));
    expect(screen.getAllByLabelText('Удалить строку').length).toBe(1);
    fireEvent.click(screen.getAllByLabelText('Удалить строку')[0]);
    expect(screen.queryAllByLabelText('Удалить строку').length).toBe(0);
  });
});

describe('RecipeEditorModal — редактирование', () => {
  const recipe = {
    id: 'r1',
    name: 'Уха из рыбных консервов',
    mealType: 'LUNCH',
    category: 'Супы',
    cookMinutes: 25,
    baseServings: 1,
    ingredients: [{ ingredientId: 'p1', amount: 0.05, ingredient: { name: 'Гречка', unit: 'KG' } }],
  };

  it('предзаполняет форму и состав из рецепта', async () => {
    renderEditor(recipe);
    await screen.findByDisplayValue('Гречка'); // продукты загрузились, строка сматчена
    expect((screen.getByLabelText('Название') as HTMLInputElement).value).toBe('Уха из рыбных консервов');
    // U31: 0,05 кг отображается в граммах — «50» (после загрузки справочника продуктов)
    await waitFor(() =>
      expect((screen.getByLabelText('Количество') as HTMLInputElement).value).toBe('50'),
    );
    expect((screen.getByLabelText('Продукт') as HTMLInputElement).value).toBe('Гречка');
  });

  it('сохраняет через PUT /admin/recipes/{id}', async () => {
    renderEditor(recipe);
    await screen.findByDisplayValue('Гречка');
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Уха по-новому' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/admin/recipes/r1',
        expect.objectContaining({ name: 'Уха по-новому', ingredients: [{ ingredientId: 'p1', amount: 0.05 }] })
      )
    );
  });
});

describe('RecipeEditorModal — категория (U15: свободный ввод + подсказки)', () => {
  it('фокус открывает стилизованный список существующих категорий', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const cat = screen.getByLabelText('Категория') as HTMLInputElement;
    fireEvent.focus(cat);
    expect(await screen.findByRole('listbox', { name: 'Существующие категории' })).toBeTruthy();
    expect(screen.getByText('Каши')).toBeTruthy();
  });

  it('клик по подсказке подставляет категорию; свой текст сохраняется', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const cat = screen.getByLabelText('Категория') as HTMLInputElement;
    fireEvent.focus(cat);
    fireEvent.change(cat, { target: { value: 'Суп' } });
    fireEvent.mouseDown(await screen.findByText('Супы'));
    expect(cat.value).toBe('Супы');
    // категория — свободный ввод: можно вписать своё значение, которого нет в списке
    fireEvent.change(cat, { target: { value: 'Десерты' } });
    expect(cat.value).toBe('Десерты');
  });
});

// bugs-recipes-catalog пп.4–5: подсказка категории — в InfoTip; свободный ввод
// продукта — создание из редактора (паттерн ManualItemsModal Fix-6 п.13, общий
// компонент FreeProductCreate — R8 без дубля).
describe('RecipeEditorModal — bugs-recipes-catalog пп.4–5', () => {
  it('п.4: подсказка категории убрана в InfoTip — видимого текста под полем нет', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText('Свободный ввод: выберите существующую или впишите свою.')).toBeNull();
    expect(screen.getByTestId('info-tip')).toBeTruthy();
    // aria-describedby не ссылается на удалённую подсказку
    expect(screen.getByLabelText('Категория').getAttribute('aria-describedby')).toBeNull();
  });

  it('п.5: админ — неизвестный продукт создаётся (check-name → POST) и выбирается в строке', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (String(url).startsWith('/product-categories')) return Promise.resolve([{ id: '7', name: 'Разное' }]);
      if (String(url).startsWith('/admin/products/check-name')) return Promise.resolve({ duplicate: false });
      if (String(url).startsWith('/admin/products')) return Promise.resolve({ content: products, totalElements: products.length });
      return Promise.resolve(null);
    });
    (api.post as any).mockResolvedValue({ id: 'p77' });
    renderEditor(null, { isAdmin: true });
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Добавить ингредиент' }));
    const input = screen.getByLabelText('Продукт');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Кускус волшебный' } });

    fireEvent.click(await screen.findByTestId('recipe-create-product'));
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/products', {
      name: 'Кускус волшебный', unit: 'PCS', categoryId: 7,
    }));
    // продукт автоматически выбран в строке, free-text-панель исчезла
    await waitFor(() => expect((screen.getByLabelText('Продукт') as HTMLInputElement).value).toBe('Кускус волшебный'));
    expect(screen.queryByTestId('recipe-create-product')).toBeNull();

    // блюдо сохраняется — в составе созданный продукт
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Кускус-тест' } });
    fireEvent.change(screen.getByLabelText('Количество'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать блюдо' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/recipes', expect.objectContaining({
      ingredients: [expect.objectContaining({ ingredientId: 'p77' })],
    })));
  });

  it('п.5: не-админ — подсказка «продукты добавляет админ» вместо кнопки создания', async () => {
    renderEditor();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Добавить ингредиент' }));
    const input = screen.getByLabelText('Продукт');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Кускус волшебный' } });
    expect(await screen.findByText(/Новые продукты добавляет администратор/)).toBeTruthy();
    expect(screen.queryByTestId('recipe-create-product')).toBeNull();
  });
});
