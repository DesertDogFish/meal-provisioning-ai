import { useState, useEffect } from 'react';
import { DollarSign, BookOpen, Download, Plus, Trash2, Check, X } from 'lucide-react';
import { UnitOfMeasure, MealType } from '../types';
import { ConflictError, ValidationError } from '../utils/errors';
import { validateRecipe } from '../utils/validation';
import { useToast } from '../components/ToastProvider';
import { api } from '../api/client';

type AdminTab = 'prices' | 'recipes' | 'import';

interface Ingredient {
  id: string;
  name: string;
  unit: UnitOfMeasure;
}

interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  baseServings: number;
  caloriesPerServing?: number;
  source: string;
  ingredients: Array<{ ingredientId: string; amount: number }>;
}

interface Price {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

interface StagingRecipe {
  id: string;
  suggestedName: string;
  source: string;
  status: string;
  suggestedMealType?: MealType;
  suggestedIngredients?: Array<{ mappedIngredientId?: string; amount: number }>;
}

const unitLabels: Record<UnitOfMeasure, string> = { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' };
const mealTypeLabels: Record<MealType, string> = { BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус' };

export default function AdminPage() {
  const { showError, showSuccess } = useToast();
  const [tab, setTab] = useState<AdminTab>('prices');
  
  // Data
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [stagingRecipes, setStagingRecipes] = useState<StagingRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Price form
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({ ingredientId: '', pricePerUnit: '', currency: 'RUB', effectiveFrom: '' });
  
  // Recipe form
  const [showRecForm, setShowRecForm] = useState(false);
  const [recForm, setRecForm] = useState({ name: '', mealType: 'LUNCH' as MealType, baseServings: 4, caloriesPerServing: '', ingredients: [{ ingredientId: '', amount: '' }] as { ingredientId: string; amount: string }[] });
  
  const tabs = [
    { id: 'prices' as AdminTab, label: 'Цены', icon: <DollarSign size={16} /> },
    { id: 'recipes' as AdminTab, label: 'Рецепты', icon: <BookOpen size={16} /> },
    { id: 'import' as AdminTab, label: 'Импорт', icon: <Download size={16} /> },
  ];

  // Загрузка данных
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [ingredientsData, recipesData, pricesData, stagingData] = await Promise.all([
        api.get<any>('/admin/products'),
        api.get<Recipe[]>('/recipes'),
        api.get<Price[]>('/admin/prices'),
        api.get<StagingRecipe[]>('/admin/staging')
      ]);
      
      setIngredients(ingredientsData.content || ingredientsData);
      setRecipes(recipesData);
      setPrices(pricesData);
      setStagingRecipes(stagingData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Не удалось загрузить данные');
      showError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const isRecipeUsed = async (recId: string): Promise<boolean> => {
    try {
      const trips = await api.get<any[]>('/trips');
      return trips.some(t => t.days?.some((d: any) => d.meals?.some((m: any) => m.recipeId === recId)));
    } catch (err) {
      console.error('Failed to check recipe usage:', err);
      return false;
    }
  };

  const handleSavePrice = async () => {
    if (!priceForm.ingredientId || !priceForm.pricePerUnit || !priceForm.effectiveFrom) return;
    
    try {
      await api.post('/admin/prices', {
        ingredientId: priceForm.ingredientId,
        pricePerUnit: parseFloat(priceForm.pricePerUnit),
        currency: priceForm.currency,
        effectiveFrom: priceForm.effectiveFrom
      });
      
      setShowPriceForm(false);
      setPriceForm({ ingredientId: '', pricePerUnit: '', currency: 'RUB', effectiveFrom: '' });
      showSuccess('Цена добавлена');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка сохранения цены');
    }
  };

  const handleSaveRecipe = async () => {
    // Validate recipe data
    const errors = validateRecipe({
      name: recForm.name,
      mealType: recForm.mealType,
      baseServings: recForm.baseServings,
      ingredients: recForm.ingredients.filter(i => i.ingredientId && i.amount),
    });
    if (errors.length > 0) {
      const validationError = new ValidationError(errors, 'Некорректные данные рецепта');
      showError(validationError.toProblemDetail());
      return;
    }

    const recipeIngredients = recForm.ingredients
      .filter(i => i.ingredientId && i.amount)
      .map(i => ({ ingredientId: i.ingredientId, amount: parseFloat(i.amount) }));
    
    try {
      await api.post('/admin/recipes', {
        name: recForm.name,
        mealType: recForm.mealType,
        baseServings: recForm.baseServings,
        caloriesPerServing: recForm.caloriesPerServing ? parseInt(recForm.caloriesPerServing) : undefined,
        ingredients: recipeIngredients
      });
      
      setShowRecForm(false);
      setRecForm({ name: '', mealType: 'LUNCH', baseServings: 4, caloriesPerServing: '', ingredients: [{ ingredientId: '', amount: '' }] });
      showSuccess('Рецепт добавлен');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка сохранения рецепта');
    }
  };

  const handleDeleteRecipe = async (id: string) => {
    const used = await isRecipeUsed(id);
    if (used) {
      const recipe = recipes.find(r => r.id === id);
      const conflictError = new ConflictError(
        `Рецепт "${recipe?.name}" используется в походах и не может быть удалён`
      );
      showError(conflictError.toProblemDetail());
      return;
    }
    
    try {
      await api.del(`/admin/recipes/${id}`);
      showSuccess('Рецепт удалён');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка удаления рецепта');
    }
  };

  const handleApproveStaging = async (stagingId: string) => {
    const staging = stagingRecipes.find(s => s.id === stagingId);
    if (!staging) return;
    
    try {
      await api.post(`/admin/staging/${stagingId}/approve`, {
        name: staging.suggestedName || 'Imported recipe',
        mealType: staging.suggestedMealType || 'DINNER',
        baseServings: 4,
        ingredients: (staging.suggestedIngredients || [])
          .filter(si => si.mappedIngredientId)
          .map(si => ({ ingredientId: si.mappedIngredientId!, amount: si.amount }))
      });
      
      showSuccess('Рецепт одобрен');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка одобрения рецепта');
    }
  };

  const handleRejectStaging = async (stagingId: string) => {
    const reason = prompt('Причина отклонения:');
    if (reason !== null) {
      try {
        await api.post(`/admin/staging/${stagingId}/reject`, { reason });
        showSuccess('Рецепт отклонён');
        await loadData();
      } catch (err: any) {
        showError(err.detail || 'Ошибка отклонения рецепта');
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Администрирование</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Администрирование</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <button onClick={loadData} className="ghost-btn mt-4">Повторить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Администрирование</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>Управление ценами, рецептами и импортом</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--surface)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              background: tab === t.id ? 'var(--elev)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--muted)',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Prices tab */}
      {tab === 'prices' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{prices.length} цен</p>
            <button onClick={() => setShowPriceForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm" style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}>
              <Plus size={16} /> Добавить цену
            </button>
          </div>

          {showPriceForm && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select value={priceForm.ingredientId} onChange={e => setPriceForm({ ...priceForm, ingredientId: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="">Компонент...</option>
                  {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input type="number" placeholder="Цена" value={priceForm.pricePerUnit} onChange={e => setPriceForm({ ...priceForm, pricePerUnit: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <input type="date" value={priceForm.effectiveFrom} onChange={e => setPriceForm({ ...priceForm, effectiveFrom: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <select value={priceForm.currency} onChange={e => setPriceForm({ ...priceForm, currency: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="RUB">₽ RUB</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSavePrice} className="px-4 py-2 rounded-full text-sm" style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}>Сохранить</button>
                <button onClick={() => setShowPriceForm(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--elev)' }}>
                <tr>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Компонент</th>
                  <th className="text-right px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Цена за ед.</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Валюта</th>
                  <th className="text-left px-4 py-3 font-medium" style={{ color: 'var(--muted)' }}>Действует с</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border)' }}>
                {prices.map(price => {
                  const ing = ingredients.find(i => i.id === price.ingredientId);
                  return (
                    <tr key={price.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{ing?.name || '?'}</td>
                      <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--text)' }}>{price.pricePerUnit} {price.currency}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{price.currency}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{new Date(price.effectiveFrom).toLocaleDateString('ru-RU')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recipes tab */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{recipes.length} рецептов</p>
            <button onClick={() => setShowRecForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm" style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}>
              <Plus size={16} /> Новый рецепт
            </button>
          </div>

          {showRecForm && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="Название" value={recForm.name} onChange={e => setRecForm({ ...recForm, name: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <select value={recForm.mealType} onChange={e => setRecForm({ ...recForm, mealType: e.target.value as MealType })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  <option value="BREAKFAST">Завтрак</option>
                  <option value="LUNCH">Обед</option>
                  <option value="DINNER">Ужин</option>
                  <option value="SNACK">Перекус</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Порций" value={recForm.baseServings} onChange={e => setRecForm({ ...recForm, baseServings: parseInt(e.target.value) || 1 })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                <input type="number" placeholder="Ккал/порция (опц.)" value={recForm.caloriesPerServing} onChange={e => setRecForm({ ...recForm, caloriesPerServing: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
              </div>
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Ингредиенты:</p>
                {recForm.ingredients.map((ri, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select value={ri.ingredientId} onChange={e => { const n = [...recForm.ingredients]; n[idx].ingredientId = e.target.value; setRecForm({ ...recForm, ingredients: n }); }}
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      <option value="">Компонент...</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({unitLabels[i.unit]})</option>)}
                    </select>
                    <input type="number" step="0.001" placeholder="Кол-во" value={ri.amount} onChange={e => { const n = [...recForm.ingredients]; n[idx].amount = e.target.value; setRecForm({ ...recForm, ingredients: n }); }}
                      className="w-24 px-3 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }} />
                    {recForm.ingredients.length > 1 && (
                      <button onClick={() => setRecForm({ ...recForm, ingredients: recForm.ingredients.filter((_, i) => i !== idx) })}
                        className="p-2 rounded" style={{ color: '#FCA5A5' }}><X size={16} /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => setRecForm({ ...recForm, ingredients: [...recForm.ingredients, { ingredientId: '', amount: '' }] })}
                  className="text-sm" style={{ color: 'var(--w1)' }}>+ Добавить ингредиент</button>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveRecipe} className="px-4 py-2 rounded-full text-sm" style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}>Сохранить</button>
                <button onClick={() => setShowRecForm(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--muted)' }}>Отмена</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {recipes.map(recipe => (
              <div key={recipe.id} className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold" style={{ color: 'var(--text)' }}>{recipe.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>{mealTypeLabels[recipe.mealType]}</span>
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>{recipe.source}</span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{recipe.baseServings} порций • {recipe.ingredients.length} ингр.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-1.5 rounded" style={{ color: 'var(--muted)' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import tab */}
      {tab === 'import' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>Черновики рецептов из внешних источников</p>
            </div>
          </div>

          {/* Staging recipes */}
          <div className="space-y-4">
            {stagingRecipes.map(staging => (
              <div key={staging.id} className="rounded-xl p-5" style={{ 
                background: 'var(--surface)', 
                border: `1px solid ${
                  staging.status === 'PENDING' ? 'rgba(245, 158, 11, 0.3)' : 
                  staging.status === 'APPROVED' ? 'rgba(52, 211, 153, 0.3)' : 
                  'rgba(239, 68, 68, 0.3)'
                }` 
              }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold" style={{ color: 'var(--text)' }}>{staging.suggestedName || 'Без названия'}</h3>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{
                        background: staging.status === 'PENDING' ? 'rgba(245, 158, 11, 0.16)' :
                          staging.status === 'APPROVED' ? 'rgba(52, 211, 153, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                        color: staging.status === 'PENDING' ? '#F8C468' :
                          staging.status === 'APPROVED' ? '#34D399' : '#FCA5A5'
                      }}>
                        {staging.status === 'PENDING' ? 'Ожидает' : staging.status === 'APPROVED' ? 'Одобрен' : 'Отклонён'}
                      </span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Источник: {staging.source}</p>
                  </div>
                  {staging.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveStaging(staging.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm" style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}>
                        <Check size={14} /> Одобрить
                      </button>
                      <button onClick={() => handleRejectStaging(staging.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm" style={{ border: '1px solid rgba(239, 68, 68, 0.3)', color: '#FCA5A5' }}>
                        <X size={14} /> Отклонить
                      </button>
                    </div>
                  )}
                </div>

                {staging.suggestedMealType && (
                  <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>Тип: {mealTypeLabels[staging.suggestedMealType]}</p>
                )}
              </div>
            ))}

            {stagingRecipes.length === 0 && (
              <div className="text-center py-12 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <Download size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
                <p style={{ color: 'var(--muted)' }}>Нет черновиков для модерации</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
