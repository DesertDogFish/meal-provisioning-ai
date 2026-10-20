import { useState } from 'react';
import { useApp, generateId } from '../store/AppContext';
import { Package, DollarSign, BookOpen, Download, Plus, Trash2, Edit2, Check, X, AlertTriangle } from 'lucide-react';
import { UnitOfMeasure, MealType, RecipeSource } from '../types';
import { formatAmount } from '../utils/calculations';

type AdminTab = 'ingredients' | 'prices' | 'recipes' | 'import';

const unitLabels: Record<UnitOfMeasure, string> = { KG: 'кг', L: 'л', PCS: 'шт' };
const mealTypeLabels: Record<MealType, string> = { BREAKFAST: 'Завтрак', LUNCH: 'Обед', DINNER: 'Ужин', SNACK: 'Перекус' };

export default function AdminPage() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<AdminTab>('ingredients');
  
  // Ingredient form
  const [showIngForm, setShowIngForm] = useState(false);
  const [editingIng, setEditingIng] = useState<string | null>(null);
  const [ingForm, setIngForm] = useState({ name: '', unit: 'KG' as UnitOfMeasure, category: '' });
  
  // Price form
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceForm, setPriceForm] = useState({ ingredientId: '', pricePerUnit: '', currency: 'RUB', effectiveFrom: '' });
  
  // Recipe form
  const [showRecForm, setShowRecForm] = useState(false);
  const [recForm, setRecForm] = useState({ name: '', mealType: 'LUNCH' as MealType, baseServings: 4, caloriesPerServing: '', ingredients: [{ ingredientId: '', amount: '' }] as { ingredientId: string; amount: string }[] });
  
  // Mapping form
  const [showMapForm, setShowMapForm] = useState(false);
  const [mapForm, setMapForm] = useState({ externalName: '', source: 'API' as RecipeSource, internalIngredientId: '' });

  const tabs = [
    { id: 'ingredients' as AdminTab, label: 'Компоненты', icon: <Package size={16} /> },
    { id: 'prices' as AdminTab, label: 'Цены', icon: <DollarSign size={16} /> },
    { id: 'recipes' as AdminTab, label: 'Рецепты', icon: <BookOpen size={16} /> },
    { id: 'import' as AdminTab, label: 'Импорт', icon: <Download size={16} /> },
  ];

  const isIngredientUsed = (ingId: string) => state.recipes.some(r => r.ingredients.some(ri => ri.ingredientId === ingId));
  const getIngredientRecipes = (ingId: string) => state.recipes.filter(r => r.ingredients.some(ri => ri.ingredientId === ingId));
  const isRecipeUsed = (recId: string) => state.trips.some(t => t.days?.some(d => d.meals?.some(m => m.recipeId === recId)));

  const handleSaveIngredient = () => {
    if (!ingForm.name || !ingForm.category) return;
    if (editingIng) {
      if (isIngredientUsed(editingIng)) { alert('Компонент используется в рецептах и не может быть изменён'); return; }
      dispatch({ type: 'UPDATE_INGREDIENT', payload: { id: editingIng, name: ingForm.name, unit: ingForm.unit, category: ingForm.category, createdAt: state.ingredients.find(i => i.id === editingIng)?.createdAt || '' } });
    } else {
      dispatch({ type: 'ADD_INGREDIENT', payload: { id: generateId(), name: ingForm.name, unit: ingForm.unit, category: ingForm.category, createdAt: new Date().toISOString() } });
    }
    setShowIngForm(false);
    setEditingIng(null);
    setIngForm({ name: '', unit: 'KG', category: '' });
  };

  const handleDeleteIngredient = (id: string) => {
    if (isIngredientUsed(id)) {
      const recipes = getIngredientRecipes(id);
      alert(`Компонент используется в рецептах: ${recipes.map(r => r.name).join(', ')}`);
      return;
    }
    dispatch({ type: 'DELETE_INGREDIENT', payload: id });
  };

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
    if (!recForm.name || recForm.ingredients.length === 0 || !recForm.ingredients[0].ingredientId) return;
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
  };

  const handleDeleteRecipe = (id: string) => {
    if (isRecipeUsed(id)) {
      alert('Рецепт используется в походах и не может быть удалён');
      return;
    }
    dispatch({ type: 'DELETE_RECIPE', payload: id });
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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Администрирование</h1>
        <p className="text-slate-500 mt-1">Управление компонентами, ценами и рецептами</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Ingredients tab */}
      {tab === 'ingredients' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{state.ingredients.length} компонентов</p>
            <button onClick={() => { setShowIngForm(true); setEditingIng(null); setIngForm({ name: '', unit: 'KG', category: '' }); }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
              <Plus size={16} /> Добавить
            </button>
          </div>

          {showIngForm && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" placeholder="Название" value={ingForm.name} onChange={e => setIngForm({ ...ingForm, name: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
                <select value={ingForm.unit} onChange={e => setIngForm({ ...ingForm, unit: e.target.value as UnitOfMeasure })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                  <option value="KG">кг</option>
                  <option value="L">л</option>
                  <option value="PCS">шт</option>
                </select>
                <input type="text" placeholder="Категория" value={ingForm.category} onChange={e => setIngForm({ ...ingForm, category: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveIngredient} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Сохранить</button>
                <button onClick={() => setShowIngForm(false)} className="px-4 py-2 text-slate-600 text-sm hover:text-slate-800">Отмена</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Название</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Единица</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Категория</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.ingredients.map(ing => (
                  <tr key={ing.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900 font-medium">{ing.name}</td>
                    <td className="px-4 py-3 text-slate-600">{unitLabels[ing.unit]}</td>
                    <td className="px-4 py-3 text-slate-600">{ing.category}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isIngredientUsed(ing.id) && <span title="Используется в рецептах"><AlertTriangle size={14} className="text-amber-500" /></span>}
                        <button onClick={() => { setEditingIng(ing.id); setIngForm({ name: ing.name, unit: ing.unit, category: ing.category }); setShowIngForm(true); }}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 rounded"><Edit2 size={14} /></button>
                        <button onClick={() => handleDeleteIngredient(ing.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prices tab */}
      {tab === 'prices' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-500">{state.prices.length} цен</p>
            <button onClick={() => setShowPriceForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
              <Plus size={16} /> Добавить цену
            </button>
          </div>

          {showPriceForm && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select value={priceForm.ingredientId} onChange={e => setPriceForm({ ...priceForm, ingredientId: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="">Компонент...</option>
                  {state.ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input type="number" placeholder="Цена" value={priceForm.pricePerUnit} onChange={e => setPriceForm({ ...priceForm, pricePerUnit: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <input type="date" value={priceForm.effectiveFrom} onChange={e => setPriceForm({ ...priceForm, effectiveFrom: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <select value={priceForm.currency} onChange={e => setPriceForm({ ...priceForm, currency: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="RUB">₽ RUB</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSavePrice} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Сохранить</button>
                <button onClick={() => setShowPriceForm(false)} className="px-4 py-2 text-slate-600 text-sm">Отмена</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Компонент</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Цена за ед.</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Валюта</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Действует с</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.prices.map(price => {
                  const ing = state.ingredients.find(i => i.id === price.ingredientId);
                  return (
                    <tr key={price.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{ing?.name || '?'}</td>
                      <td className="px-4 py-3 text-right text-slate-900 font-medium">{price.pricePerUnit} {price.currency}</td>
                      <td className="px-4 py-3 text-slate-600">{price.currency}</td>
                      <td className="px-4 py-3 text-slate-600">{new Date(price.effectiveFrom).toLocaleDateString('ru-RU')}</td>
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
            <p className="text-sm text-slate-500">{state.recipes.length} рецептов</p>
            <button onClick={() => setShowRecForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm">
              <Plus size={16} /> Новый рецепт
            </button>
          </div>

          {showRecForm && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="Название" value={recForm.name} onChange={e => setRecForm({ ...recForm, name: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <select value={recForm.mealType} onChange={e => setRecForm({ ...recForm, mealType: e.target.value as MealType })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="BREAKFAST">Завтрак</option>
                  <option value="LUNCH">Обед</option>
                  <option value="DINNER">Ужин</option>
                  <option value="SNACK">Перекус</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Порций" value={recForm.baseServings} onChange={e => setRecForm({ ...recForm, baseServings: parseInt(e.target.value) || 1 })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                <input type="number" placeholder="Ккал/порция (опц.)" value={recForm.caloriesPerServing} onChange={e => setRecForm({ ...recForm, caloriesPerServing: e.target.value })}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Ингредиенты:</p>
                {recForm.ingredients.map((ri, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select value={ri.ingredientId} onChange={e => { const n = [...recForm.ingredients]; n[idx].ingredientId = e.target.value; setRecForm({ ...recForm, ingredients: n }); }}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
                      <option value="">Компонент...</option>
                      {state.ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({unitLabels[i.unit]})</option>)}
                    </select>
                    <input type="number" step="0.001" placeholder="Кол-во" value={ri.amount} onChange={e => { const n = [...recForm.ingredients]; n[idx].amount = e.target.value; setRecForm({ ...recForm, ingredients: n }); }}
                      className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                    {recForm.ingredients.length > 1 && (
                      <button onClick={() => setRecForm({ ...recForm, ingredients: recForm.ingredients.filter((_, i) => i !== idx) })}
                        className="p-2 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>
                    )}
                  </div>
                ))}
                <button onClick={() => setRecForm({ ...recForm, ingredients: [...recForm.ingredients, { ingredientId: '', amount: '' }] })}
                  className="text-sm text-emerald-600 hover:text-emerald-700">+ Добавить ингредиент</button>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveRecipe} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">Сохранить</button>
                <button onClick={() => setShowRecForm(false)} className="px-4 py-2 text-slate-600 text-sm">Отмена</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {state.recipes.map(recipe => (
              <div key={recipe.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{recipe.name}</h3>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{mealTypeLabels[recipe.mealType]}</span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">{recipe.source}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{recipe.baseServings} порций • {recipe.ingredients.length} ингр.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isRecipeUsed(recipe.id) && <span title="Используется в походах"><AlertTriangle size={14} className="text-amber-500" /></span>}
                    <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
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
              <p className="text-sm text-slate-500">Черновики рецептов из внешних источников</p>
            </div>
          </div>

          {/* Staging recipes */}
          <div className="space-y-4">
            {state.stagingRecipes.map(staging => (
              <div key={staging.id} className={`bg-white rounded-xl border p-5 ${
                staging.status === 'PENDING' ? 'border-amber-200' : staging.status === 'APPROVED' ? 'border-emerald-200' : 'border-red-200'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{staging.suggestedName || 'Без названия'}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        staging.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        staging.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {staging.status === 'PENDING' ? 'Ожидает' : staging.status === 'APPROVED' ? 'Одобрен' : 'Отклонён'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">Источник: {staging.source} • {new Date(staging.createdAt).toLocaleDateString('ru-RU')}</p>
                  </div>
                  {staging.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveStaging(staging.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">
                        <Check size={14} /> Одобрить
                      </button>
                      <button onClick={() => handleRejectStaging(staging.id)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50">
                        <X size={14} /> Отклонить
                      </button>
                    </div>
                  )}
                </div>

                {staging.suggestedMealType && (
                  <p className="text-sm text-slate-600 mb-2">Тип: {mealTypeLabels[staging.suggestedMealType]}</p>
                )}

                {/* Raw payload preview */}
                <details className="mb-3">
                  <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Сырые данные (JSON)</summary>
                  <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 overflow-x-auto">
                    {JSON.stringify(staging.rawPayload, null, 2)}
                  </pre>
                </details>

                {/* Suggested ingredients */}
                {staging.suggestedIngredients && (
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Предложенные ингредиенты:</p>
                    <div className="space-y-1">
                      {staging.suggestedIngredients.map((si, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${si.mappedIngredientId ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                          <span className="text-slate-700">{si.externalName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">{si.amount} {unitLabels[si.unit]}</span>
                            {si.mappedIngredientId ? (
                              <span className="text-emerald-600 text-xs">→ {state.ingredients.find(i => i.id === si.mappedIngredientId)?.name}</span>
                            ) : (
                              <span className="text-amber-600 text-xs">не сопоставлен</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {staging.rejectionReason && (
                  <p className="text-sm text-red-600 mt-2">Причина: {staging.rejectionReason}</p>
                )}
              </div>
            ))}

            {state.stagingRecipes.length === 0 && (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                <Download size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">Нет черновиков для модерации</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
