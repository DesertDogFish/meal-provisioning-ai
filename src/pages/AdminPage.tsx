import { useState } from 'react';
import { useApp, generateId } from '../store/AppContext';
import { DollarSign, BookOpen, Download, Plus, Trash2, Check, X, AlertTriangle } from 'lucide-react';
import { UnitOfMeasure, MealType } from '../types';
import { ConflictError, ValidationError } from '../utils/errors';
import { validateRecipe } from '../utils/validation';
import { useToast } from '../components/ToastProvider';

type AdminTab = 'prices' | 'recipes' | 'import';

const unitLabels: Record<UnitOfMeasure, string> = { KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' };
const mealTypeLabels: Record<MealType, string> = { BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус' };

export default function AdminPage() {
  const { state, dispatch } = useApp();
  const { showError, showSuccess } = useToast();
  const [tab, setTab] = useState<AdminTab>('prices');
  
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

  const isRecipeUsed = (recId: string) => state.trips.some(t => t.days?.some(d => d.meals?.some(m => m.recipeId === recId)));

  const handleSavePrice = () => {
    if (!priceForm.ingredientId || !priceForm.pricePerUnit || !priceForm.effectiveFrom) return;
    dispatch({
      type: 'ADD_PRICE',
      payload: { id: generateId(), ingredientId: priceForm.ingredientId, pricePerUnit: parseFloat(priceForm.pricePerUnit), currency: priceForm.currency, effectiveFrom: priceForm.effectiveFrom }
    });
    setShowPriceForm(false);
    setPriceForm({ ingredientId: '', pricePerUnit: '', currency: 'RUB', effectiveFrom: '' });
  };

  const handleSaveRecipe = () => {
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
      .map(i => ({ ingredientId: i.ingredientId, amount: parseFloat(i.amount), ingredient: state.ingredients.find(ing => ing.id === i.ingredientId) }));
    
    dispatch({
      type: 'ADD_RECIPE',
      payload: {
        id: generateId(),
        name: recForm.name,
        mealType: recForm.mealType,
        baseServings: recForm.baseServings,
        caloriesPerServing: recForm.caloriesPerServing ? parseInt(recForm.caloriesPerServing) : undefined,
        source: 'MANUAL',
        ingredients: recipeIngredients as any,
        createdAt: new Date().toISOString(),
      }
    });
    setShowRecForm(false);
    setRecForm({ name: '', mealType: 'LUNCH', baseServings: 4, caloriesPerServing: '', ingredients: [{ ingredientId: '', amount: '' }] });
    showSuccess('Рецепт добавлен');
  };

  const handleDeleteRecipe = (id: string) => {
    if (isRecipeUsed(id)) {
      const trips = state.trips.filter(t => t.days?.some(d => d.meals?.some(m => m.recipeId === id)));
      const conflictError = new ConflictError(
        `Рецепт "${state.recipes.find(r => r.id === id)?.name}" используется в походах и не может быть удалён`,
        trips.map(t => ({ resourceType: 'trip', resourceId: t.id, resourceName: t.name }))
      );
      showError(conflictError.toProblemDetail());
      return;
    }
    dispatch({ type: 'DELETE_RECIPE', payload: id });
    showSuccess('Рецепт удалён');
  };

  const handleApproveStaging = (stagingId: string) => {
    const staging = state.stagingRecipes.find(s => s.id === stagingId);
    if (!staging) return;
    const recipeIngredients = (staging.suggestedIngredients || [])
      .filter(si => si.mappedIngredientId)
      .map(si => ({
        ingredientId: si.mappedIngredientId!,
        amount: si.amount,
        ingredient: state.ingredients.find(i => i.id === si.mappedIngredientId)
      }));
    
    dispatch({
      type: 'APPROVE_STAGING',
      payload: {
        stagingId,
        recipe: {
          id: generateId(),
          name: staging.suggestedName || 'Imported recipe',
          mealType: staging.suggestedMealType || 'DINNER',
          baseServings: 4,
          source: staging.source,
          ingredients: recipeIngredients as any,
          createdAt: new Date().toISOString(),
        }
      }
    });
  };

  const handleRejectStaging = (stagingId: string) => {
    const reason = prompt('Причина отклонения:');
    if (reason !== null) {
      dispatch({ type: 'REJECT_STAGING', payload: { stagingId, reason } });
    }
  };

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
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{state.prices.length} цен</p>
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
                  {state.ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
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
                {state.prices.map(price => {
                  const ing = state.ingredients.find(i => i.id === price.ingredientId);
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
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{state.recipes.length} рецептов</p>
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
                      {state.ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({unitLabels[i.unit]})</option>)}
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
            {state.recipes.map(recipe => (
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
                    {isRecipeUsed(recipe.id) && <span title="Используется в походах"><AlertTriangle size={14} className="text-amber-500" /></span>}
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
            {state.stagingRecipes.map(staging => (
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
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Источник: {staging.source} • {new Date(staging.createdAt).toLocaleDateString('ru-RU')}</p>
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

                {/* Raw payload preview */}
                <details className="mb-3">
                  <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Сырые данные (JSON)</summary>
                  <pre className="mt-2 p-3 rounded-lg text-xs overflow-x-auto" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                    {JSON.stringify(staging.rawPayload, null, 2)}
                  </pre>
                </details>

                {/* Suggested ingredients */}
                {staging.suggestedIngredients && (
                  <div>
                    <p className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Предложенные ингредиенты:</p>
                    <div className="space-y-1">
                      {staging.suggestedIngredients.map((si, idx) => (
                        <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm" style={{
                          background: si.mappedIngredientId ? 'rgba(52, 211, 153, 0.1)' : 'rgba(245, 158, 11, 0.1)'
                        }}>
                          <span style={{ color: 'var(--text)' }}>{si.externalName}</span>
                          <div className="flex items-center gap-2">
                            <span style={{ color: 'var(--muted)' }}>{si.amount} {unitLabels[si.unit]}</span>
                            {si.mappedIngredientId ? (
                              <span className="text-xs" style={{ color: 'var(--ok)' }}>→ {state.ingredients.find(i => i.id === si.mappedIngredientId)?.name}</span>
                            ) : (
                              <span className="text-xs" style={{ color: 'var(--fire)' }}>не сопоставлен</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {staging.rejectionReason && (
                  <p className="text-sm mt-2" style={{ color: '#FCA5A5' }}>Причина: {staging.rejectionReason}</p>
                )}
              </div>
            ))}

            {state.stagingRecipes.length === 0 && (
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
