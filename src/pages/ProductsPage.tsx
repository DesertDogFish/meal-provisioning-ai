import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/ToastProvider';
import { Plus, Edit2, Trash2, Search, X } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import { Ingredient, UnitOfMeasure, ProductCategory } from '../types';

interface Product extends Ingredient {
  categoryName: string;
  currentPrice?: {
    value: number;
    currency: string;
    source: string;
  };
  usageRecipes: number;
  bindingStatus: string;
}

export default function ProductsPage() {
  const { state, dispatch } = useApp();
  const { showError, showSuccess } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Filters
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [priceStatus, setPriceStatus] = useState('');
  const [bindingStatus, setBindingStatus] = useState('');
  const [usageStatus, setUsageStatus] = useState('');
  
  // Sorting
  const [sortKey, setSortKey] = useState<'name' | 'category' | 'unit' | 'price' | 'usage'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState<UnitOfMeasure>('KG');
  const [formPackSize, setFormPackSize] = useState<number | null>(null);
  const [formRoundToPacks, setFormRoundToPacks] = useState(false);
  const [formCalories, setFormCalories] = useState<number | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ type: 'hard' | 'soft'; message: string } | null>(null);

  // Преобразование ингредиентов в продукты
  const products = useMemo((): Product[] => {
    return state.ingredients.map(ing => {
      // Найти текущую цену
      const prices = state.prices
        .filter(p => p.ingredientId === ing.id)
        .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
      const currentPrice = prices[0] ? {
        value: prices[0].pricePerUnit,
        currency: prices[0].currency,
        source: 'MANUAL'
      } : undefined;

      // Подсчитать использование в рецептах
      const usageRecipes = state.recipes.filter(r => 
        r.ingredients.some(ri => ri.ingredientId === ing.id)
      ).length;

      // Статус привязки
      const bindingStatus = ing.code ? 'BOUND' : 'UNBOUND';

      // Название категории
      const category = state.categories.find(c => c.name === ing.category);
      const categoryName = category?.name || ing.category || 'Прочее';

      return {
        ...ing,
        categoryName,
        currentPrice,
        usageRecipes,
        bindingStatus
      };
    });
  }, [state.ingredients, state.prices, state.recipes, state.categories]);

  // Фильтрация и сортировка
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Поиск
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q))
      );
    }

    // Фильтр по категории
    if (selectedCategories.length > 0) {
      result = result.filter(p => selectedCategories.includes(p.categoryName));
    }

    // Фильтр по единице
    if (selectedUnit) {
      result = result.filter(p => p.unit === selectedUnit);
    }

    // Фильтр по цене
    if (priceStatus === 'HAS_PRICE') {
      result = result.filter(p => p.currentPrice);
    } else if (priceStatus === 'NO_PRICE') {
      result = result.filter(p => !p.currentPrice);
    }

    // Фильтр по привязке
    if (bindingStatus === 'BOUND') {
      result = result.filter(p => p.bindingStatus === 'BOUND');
    } else if (bindingStatus === 'UNBOUND') {
      result = result.filter(p => p.bindingStatus === 'UNBOUND');
    }

    // Фильтр по использованию
    if (usageStatus === 'USED') {
      result = result.filter(p => p.usageRecipes > 0);
    } else if (usageStatus === 'UNUSED') {
      result = result.filter(p => p.usageRecipes === 0);
    }

    // Сортировка
    result.sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortKey) {
        case 'name':
          aVal = a.name;
          bVal = b.name;
          break;
        case 'category':
          aVal = a.categoryName;
          bVal = b.categoryName;
          break;
        case 'unit':
          aVal = a.unit;
          bVal = b.unit;
          break;
        case 'price':
          aVal = a.currentPrice?.value || 0;
          bVal = b.currentPrice?.value || 0;
          break;
        case 'usage':
          aVal = a.usageRecipes;
          bVal = b.usageRecipes;
          break;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [products, query, selectedCategories, selectedUnit, priceStatus, bindingStatus, usageStatus, sortKey, sortDir]);

  // Проверка дубликата
  const checkDuplicate = (name: string, unit: UnitOfMeasure) => {
    if (!name) {
      setDuplicateWarning(null);
      return;
    }

    const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const normalizedName = normalize(name);

    const existing = products.find(p => 
      normalize(p.name) === normalizedName && p.unit === unit
    );

    if (existing) {
      if (editingProduct && existing.id === editingProduct.id) {
        setDuplicateWarning(null);
        return;
      }
      setDuplicateWarning({
        type: 'hard',
        message: `Жёсткий дубль: продукт «${existing.name}» в ${unit} уже существует.`
      });
      return;
    }

    const softDuplicate = products.find(p => normalize(p.name) === normalizedName && p.unit !== unit);
    if (softDuplicate) {
      setDuplicateWarning({
        type: 'soft',
        message: `Есть «${softDuplicate.name}» в ${softDuplicate.unit}. Создаёте отдельный продукт в ${unit}?`
      });
    } else {
      setDuplicateWarning(null);
    }
  };

  const handleSave = () => {
    if (!formName || !formCategory) {
      showError('Заполните обязательные поля');
      return;
    }

    if (duplicateWarning?.type === 'hard') {
      showError('Продукт с таким именем и единицей уже существует');
      return;
    }

    if (editingProduct) {
      // Обновление
      dispatch({
        type: 'UPDATE_INGREDIENT',
        payload: {
          ...editingProduct,
          name: formName,
          unit: formUnit,
          category: formCategory,
          packSize: formPackSize || undefined,
          roundToPacks: formRoundToPacks,
          caloriesPerUnit: formCalories || undefined
        }
      });
      showSuccess('Продукт обновлён');
    } else {
      // Создание
      dispatch({
        type: 'ADD_INGREDIENT',
        payload: {
          id: `ing_${Date.now()}`,
          name: formName,
          unit: formUnit,
          category: formCategory,
          packSize: formPackSize || undefined,
          roundToPacks: formRoundToPacks,
          caloriesPerUnit: formCalories || undefined,
          createdAt: new Date().toISOString()
        }
      });
      showSuccess('Продукт создан');
    }

    setShowModal(false);
    resetForm();
  };

  const handleDelete = (product: Product) => {
    if (product.usageRecipes > 0) {
      showError(`Продукт используется в ${product.usageRecipes} рецептах и не может быть удалён`);
      return;
    }

    if (!confirm(`Удалить продукт "${product.name}"?`)) return;

    dispatch({ type: 'DELETE_INGREDIENT', payload: product.id });
    showSuccess('Продукт удалён');
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormCategory(product.categoryName);
    setFormUnit(product.unit);
    setFormPackSize(product.packSize ?? null);
    setFormRoundToPacks(product.roundToPacks ?? false);
    setFormCalories(product.caloriesPerUnit ?? null);
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('');
    setFormUnit('KG');
    setFormPackSize(null);
    setFormRoundToPacks(false);
    setFormCalories(null);
    setDuplicateWarning(null);
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedCategories([]);
    setSelectedUnit('');
    setPriceStatus('');
    setBindingStatus('');
    setUsageStatus('');
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const formatPrice = (price?: { value: number; currency: string; source: string }) => {
    if (!price) return <span className="chip-delta fire">нет цены</span>;
    return (
      <span style={{ color: 'var(--text)' }}>
        {price.value.toLocaleString('ru-RU')} {price.currency}
        <span className="chip-delta dim" style={{ marginLeft: '8px' }}>
          {price.source === 'OFF' ? 'OFF' : 'ручная'}
        </span>
      </span>
    );
  };

  // Уникальные категории для фильтра
  const uniqueCategories = useMemo(() => {
    const cats = new Set(products.map(p => p.categoryName));
    return Array.from(cats).sort();
  }, [products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {products.length} продуктов · {state.categories.length} категорий
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="grad-btn flex items-center gap-2"
        >
          <Plus size={16} />
          Продукт
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по названию или штрихкоду..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
            style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
        </div>
        
        <select
          value={selectedUnit}
          onChange={e => setSelectedUnit(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Единица: все</option>
          <option value="KG">KG</option>
          <option value="L">L</option>
          <option value="PCS">PCS</option>
        </select>

        <select
          value={priceStatus}
          onChange={e => setPriceStatus(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Цена: любая</option>
          <option value="HAS_PRICE">есть цена</option>
          <option value="NO_PRICE">нет цены</option>
        </select>

        <select
          value={bindingStatus}
          onChange={e => setBindingStatus(e.target.value)}
          className="px-4 py-2.5 rounded-lg outline-none"
          style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          <option value="">Интеграция: все</option>
          <option value="BOUND">привязаны к OFF</option>
          <option value="UNBOUND">не привязаны</option>
        </select>

        {(query || selectedUnit || priceStatus || bindingStatus) && (
          <button onClick={resetFilters} className="ghost-btn flex items-center gap-2">
            <X size={16} />
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center">
            <p style={{ color: 'var(--muted)' }}>Ничего не найдено</p>
            <button onClick={resetFilters} className="ghost-btn mt-4">Сбросить фильтры</button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--elev)' }}>
                <th 
                  className="text-left px-4 py-3 font-bold cursor-pointer" 
                  style={{ color: 'var(--muted)', fontSize: '11px' }}
                  onClick={() => handleSort('name')}
                >
                  Продукт {sortKey === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-left px-4 py-3 font-bold cursor-pointer" 
                  style={{ color: 'var(--muted)', fontSize: '11px' }}
                  onClick={() => handleSort('category')}
                >
                  Категория {sortKey === 'category' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Ед.</th>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Упаковка</th>
                <th 
                  className="text-left px-4 py-3 font-bold cursor-pointer" 
                  style={{ color: 'var(--muted)', fontSize: '11px' }}
                  onClick={() => handleSort('price')}
                >
                  Цена {sortKey === 'price' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="text-right px-4 py-3 font-bold cursor-pointer" 
                  style={{ color: 'var(--muted)', fontSize: '11px' }}
                  onClick={() => handleSort('usage')}
                >
                  В рецептах {sortKey === 'usage' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3">
                    <b style={{ color: 'var(--text)' }}>{product.name}</b>
                    {product.packSize && (
                      <span className="chip-delta dim" style={{ marginLeft: '8px' }}>
                        уп. {product.packSize} {product.unit}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="chip-delta" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                      {product.categoryName}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{product.unit}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                    {product.packSize || 'развес'}
                  </td>
                  <td className="px-4 py-3">
                    {formatPrice(product.currentPrice)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--text)' }}>
                    {product.usageRecipes}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: 'var(--muted)' }}
                        title="Правка"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: 'var(--muted)' }}
                        title="Удалить"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="rounded-2xl shadow-xl w-full max-w-md p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>
              {editingProduct ? 'Редактировать продукт' : 'Новый продукт'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Название *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => {
                    setFormName(e.target.value);
                    setTimeout(() => checkDuplicate(e.target.value, formUnit), 300);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Например: Гречка ядрица"
                />
                {duplicateWarning && (
                  <div className="mt-2 p-3 rounded-lg text-sm" style={{
                    background: duplicateWarning.type === 'hard' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${duplicateWarning.type === 'hard' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    color: duplicateWarning.type === 'hard' ? '#FCA5A5' : '#F8C468'
                  }}>
                    {duplicateWarning.message}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Категория *
                </label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="">Выберите категорию...</option>
                  {state.categories.map(cat => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Единица измерения *
                </label>
                <div className="flex gap-2">
                  {(['KG', 'L', 'PCS'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => {
                        setFormUnit(u);
                        checkDuplicate(formName, u);
                      }}
                      className="flex-1 px-4 py-2.5 rounded-lg font-bold transition-all"
                      style={{
                        background: formUnit === u ? 'linear-gradient(90deg, var(--w1), var(--w2))' : 'transparent',
                        border: formUnit === u ? '1px solid transparent' : '1px solid var(--border)',
                        color: formUnit === u ? '#04121A' : 'var(--text)'
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Упаковка (размер)
                </label>
                <NumberField
                  value={formPackSize}
                  stepRef={formPackSize ?? 1}
                  maxDecimals={3}
                  minStep={0.001}
                  onCommit={v => setFormPackSize(v)}
                  placeholder="напр. 0.9 для упаковки 900 г"
                />
                <label className="flex items-center gap-2 mt-2 cursor-pointer" style={{ color: 'var(--muted)', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={formRoundToPacks}
                    onChange={e => setFormRoundToPacks(e.target.checked)}
                    disabled={!formPackSize}
                  />
                  округлять закупку до упаковок
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Калорийность на единицу, ккал
                </label>
                <NumberField
                  value={formCalories}
                  stepRef={formCalories ?? 100}
                  maxDecimals={0}
                  onCommit={v => setFormCalories(v)}
                  placeholder="необязательно"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 rounded-full"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                disabled={!formName || !formCategory || duplicateWarning?.type === 'hard'}
                className="flex-1 px-4 py-2.5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, var(--w1), var(--w2))',
                  color: '#04121A',
                  opacity: (!formName || !formCategory || duplicateWarning?.type === 'hard') ? 0.5 : 1
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
