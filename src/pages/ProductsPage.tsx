import { useState, useEffect } from 'react';
import { useToast } from '../components/ToastProvider';
import { Plus, Search, X } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import { ProductTable, type ProductRow } from '../components/ProductTable';
import { api } from '../api/client';
import type { UnitOfMeasure, ProductCategory } from '../types';
import { humanizeUnit, recipesWord } from '../utils/text';

type Product = ProductRow;

export default function ProductsPage() {
  const { showError, showSuccess } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Filters
  const [query, setQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [priceStatus, setPriceStatus] = useState('');
  const [bindingStatus, setBindingStatus] = useState('');
  const [usageStatus, setUsageStatus] = useState('');
  
  
  // Form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState<UnitOfMeasure>('KG');
  const [formPackSize, setFormPackSize] = useState<number | null>(null);
  const [formRoundToPacks, setFormRoundToPacks] = useState(false);
  const [formCalories, setFormCalories] = useState<number | null>(null);
  const [formPieceWeightG, setFormPieceWeightG] = useState<number | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ type: 'hard' | 'soft'; message: string } | null>(null);

  // Загрузка данных
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [productsData, categoriesData] = await Promise.all([
        api.get<any>('/admin/products?size=1000'),
        api.get<ProductCategory[]>('/product-categories')
      ]);

      // FIX: бэкенд (/api/v1/admin/products) возвращает Spring Page (список в content),
      // mock-сервер — обычный массив. Нормализуем оба варианта.
      const rawList: any[] = Array.isArray(productsData)
        ? productsData
        : (productsData?.content ?? []);

      // FIX: маппинг ProductResponse (бэкенд) -> ProductRow (фронтенд):
      // category у бэкенда — объект {name}, id — число, а не строка.
      setProducts(
        rawList.map(p => ({
          ...p,
          id: String(p.id),
          categoryName: p.categoryName ?? p.category?.name ?? '',
          categoryId: p.categoryId ?? (p.category != null ? String(p.category.id ?? '') : undefined)
        }))
      );
      setCategories(categoriesData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Не удалось загрузить данные');
      showError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };


  // Проверка дубликата
  const checkDuplicate = async (name: string, unit: UnitOfMeasure) => {
    if (!name) {
      setDuplicateWarning(null);
      return;
    }

    try {
      const response = await api.get<any>(
        `/admin/products/check-name?name=${encodeURIComponent(name)}&unit=${unit}`
      );
      
      if (response.duplicate) {
        if (response.sameUnit) {
          setDuplicateWarning({
            type: 'hard',
            message: `Продукт «${response.existingName}» (${humanizeUnit(unit)}) уже существует.`
          });
        } else {
          setDuplicateWarning({
            type: 'soft',
            message: `Есть «${response.existingName}» в другой единице. Создаёте отдельный продукт (${humanizeUnit(unit)})?`
          });
        }
      } else {
        setDuplicateWarning(null);
      }
    } catch (error) {
      console.error('Failed to check duplicate:', error);
      // ЗАДАЧА 3: пользователь узнаёт, что проверка дубля не выполнена
      showError('Не удалось проверить наличие такого же продукта');
    }
  };

  const handleSave = async () => {
    if (!formName || !formCategory) {
      showError('Заполните обязательные поля');
      return;
    }

    if (duplicateWarning?.type === 'hard') {
      showError('Продукт с таким именем и единицей уже существует');
      return;
    }

    // CR-1: валидация pieceWeightG для PCS/PACK
    if ((formUnit === 'PCS' || formUnit === 'PACK') && formCalories && !formPieceWeightG) {
      showError('Для шт/уп с калорийностью обязателен вес 1 шт/уп в граммах');
      return;
    }

    try {
      const body = {
        name: formName,
        categoryId: parseInt(formCategory),
        unit: formUnit,
        packSize: formPackSize,
        roundToPacks: formRoundToPacks,
        kcalPer100g: formCalories,
        pieceWeightG: formPieceWeightG
      };

      if (editingProduct) {
        await api.put(`/admin/products/${editingProduct.id}`, body);
        showSuccess('Продукт обновлён');
      } else {
        await api.post('/admin/products', body);
        showSuccess('Продукт создан');
      }

      setShowModal(false);
      resetForm();
      await loadData();
    } catch (error: any) {
      // P0-4: перехватываем машиночитаемый код DUPLICATE_PRODUCT и показываем понятный текст без KG/PCS/ID
      const raw = String(error?.message ?? '') + ' ' + String(error?.error?.detail ?? error?.detail ?? '');
      if (raw.includes('DUPLICATE_PRODUCT') || /already exists/i.test(raw)) {
        showError('Продукт с таким названием и единицей измерения уже существует.');
      } else {
        showError(error.error?.detail || error.detail || error.message || 'Ошибка сохранения');
      }
    }
  };

  const handleDelete = async (product: Product) => {
    if (product.usageRecipes > 0) {
      showError(`Продукт используется в ${product.usageRecipes} ${recipesWord(product.usageRecipes)} и не может быть удалён`);
      return;
    }

    if (!confirm(`Удалить продукт "${product.name}"?`)) return;

    try {
      await api.del(`/admin/products/${product.id}`);
      showSuccess('Продукт удалён');
      await loadData();
    } catch (error: any) {
      showError(error.detail || 'Ошибка удаления');
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormCategory(product.categoryId || '');
    setFormUnit(product.unit);
    setFormPackSize(product.packSize ?? null);
    setFormRoundToPacks(product.roundToPacks ?? false);
    setFormCalories(product.kcalPer100g ?? null);
    setFormPieceWeightG(product.pieceWeightG ?? null);
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
    setFormPieceWeightG(null);
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



  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <button onClick={loadData} className="ghost-btn mt-4">Повторить</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            {products.length} продуктов · {categories.length} категорий
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
          <option value="KG">кг</option>
          <option value="L">л</option>
          <option value="PCS">шт</option>
          <option value="PACK">уп</option>
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
      <ProductTable
        products={products}
        filters={{ query, categories: selectedCategories, unit: selectedUnit, priceStatus, bindingStatus, usageStatus }}
        onEdit={openEditModal}
        onDelete={handleDelete}
        onResetFilters={resetFilters}
      />

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
                    background: duplicateWarning.type === 'hard' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 158, 44, 0.1)',
                    border: `1px solid ${duplicateWarning.type === 'hard' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 158, 44, 0.3)'}`,
                    color: duplicateWarning.type === 'hard' ? '#FFB4A2' : 'var(--amber-300)'
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
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Единица измерения *
                </label>
                <div className="flex gap-2">
                  {(['KG', 'L', 'PCS', 'PACK'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => {
                        setFormUnit(u);
                        checkDuplicate(formName, u);
                      }}
                      className="flex-1 px-4 py-2.5 rounded-lg font-bold transition-all"
                      style={{
                        background: formUnit === u ? 'var(--grad-brand)' : 'transparent',
                        border: formUnit === u ? '1px solid transparent' : '1px solid var(--border)',
                        color: formUnit === u ? '#04121A' : 'var(--text)'
                      }}
                    >
                      {u === 'KG' ? 'кг' : u === 'L' ? 'л' : u === 'PCS' ? 'шт' : 'уп'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Калорийность на 100 г / 100 мл * (как на упаковке)
                </label>
                <NumberField
                  value={formCalories}
                  stepRef={formCalories ?? 100}
                  maxDecimals={0}
                  onCommit={v => setFormCalories(v)}
                  placeholder="как на упаковке"
                />
              </div>

              {(formUnit === 'PCS' || formUnit === 'PACK') && formCalories && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                    Вес 1 {formUnit === 'PCS' ? 'шт' : 'уп'}, г * (обязательно для шт и уп)
                  </label>
                  <NumberField
                    value={formPieceWeightG}
                    stepRef={formPieceWeightG ?? 100}
                    maxDecimals={0}
                    onCommit={v => setFormPieceWeightG(v)}
                    placeholder={formUnit === 'PCS' ? "например, 325 для тушёнки" : "например, 600 для блока лапши"}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--fire)' }}>
                    ⚠ Обязательно для шт/уп с калорийностью
                  </p>
                </div>
              )}
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
                  background: 'var(--grad-brand)',
                  color: '#221204',
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
