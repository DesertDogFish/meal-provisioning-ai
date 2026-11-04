import { useState, useEffect, useRef, useMemo } from 'react';
import { useToast } from '../components/ToastProvider';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7)
import { Plus, Search, X } from 'lucide-react';
import { ProductTable, type ProductRow } from '../components/ProductTable';
import { ProductFormModal } from '../components/ProductFormModal';
import PageHero from '../components/PageHero'; // BUG-002: hero-шапка страницы
import CustomMultiSelect from '../components/CustomMultiSelect';
import CustomSelect from '../components/CustomSelect';
import FilterSheet from '../components/FilterSheet';
import { api } from '../api/client';
import type { ProductCategory, IngredientPrice } from '../types';
import { recipesWord, productsWord, categoriesWord } from '../utils/text';
import { Button } from '../components/Button';

import PageLoader from '../components/PageLoader';
type Product = ProductRow;

export default function ProductsPage() {
  const { showError, showSuccess } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm(); // Fix-6 (п.7)
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
  
  
    // priceByIngredient still used for displaying current price in modal
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, number>>({});

  // Загрузка данных
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [productsData, categoriesData, pricesData] = await Promise.all([
        api.get<any>('/admin/products?size=1000'),
        api.get<ProductCategory[]>('/product-categories'),
        api.get<IngredientPrice[]>('/prices').catch(() => [] as IngredientPrice[])
      ]);
      const pmap: Record<string, number> = {};
      (pricesData || []).forEach(pr => { pmap[String(pr.ingredientId)] = pr.pricePerUnit; });
      setPriceByIngredient(pmap);

      // FIX: бэкенд (/api/v1/admin/products) возвращает Spring Page (список в content),
      // mock-сервер — обычный массив. Нормализуем оба варианта.
      const rawList: any[] = Array.isArray(productsData)
        ? productsData
        : (productsData?.content ?? []);

      // FIX: маппинг ProductResponse (бэкенд) -> ProductRow (фронтенд):
      // category у бэкенда — объект {name}, id — число, а не строка.
      // bindingStatus больше не приходит с бэкенда: «привязан» = выбран источник цены
      // (emis_code), поэтому выводим его из привязки к ЕМИСС.
      setProducts(
        rawList.map(p => ({
          ...p,
          id: String(p.id),
          categoryName: p.categoryName ?? p.category?.name ?? '',
          categoryId: p.categoryId ?? (p.category != null ? String(p.category.id ?? '') : undefined),
          bindingStatus: p.bindingStatus ?? (p.emisCode ? 'BOUND' : 'UNBOUND')
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



  const handleDelete = async (product: Product) => {
    if (product.usageRecipes > 0) {
      showError(`Продукт используется в ${product.usageRecipes} ${recipesWord(product.usageRecipes)} и не может быть удалён`);
      return;
    }

    // Fix-6 (п.7): продукт участвует в ценах/чеках походов — брендовое предупреждение
    const ok = await confirm({
      title: `Удалить продукт «${product.name}»?`,
      confirmLabel: 'Удалить продукт',
      message: <>Продукт уйдёт из справочника вместе с ценами. В уже спланированных походах останутся его копии (снепшоты).</>,
    });
    if (!ok) return;

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
    setShowModal(true);
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedCategories([]);
    setSelectedUnit('');
    setPriceStatus('');
    setBindingStatus('');
    setUsageStatus('');
  };

  // bugs-products-catalog п.4: опции фильтра категорий — из справочника категорий;
  // если он пуст (например, не загрузился) — берём уникальные categoryName продуктов.
  const categoryOptions = useMemo(() => {
    const names = categories.length > 0
      ? categories.map(c => c.name)
      : Array.from(new Set(products.map(p => p.categoryName).filter(Boolean)));
    return names.map(n => ({ value: n, label: n }));
  }, [categories, products]);



  // KB-5: ...
  if (loading) {
    return (
      <div className="space-y-6">
        <PageHero title="Продукты" />
        {/* Fix-10 (п.4): брендовый лоаджер вместо «Загрузка…» */}
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHero
          title="Продукты"
          subtitle={<span style={{ color: 'var(--fire)' }}>{error}</span>}
          right={<Button variant="ghost" onClick={loadData}>Повторить</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header — BUG-002 (tasks/bugs-page-headers.md): PageHero с арт-слоем;
          Fix-7 (п.5): кнопка создания справа, иконочная; aria-label сохранён (E2E-03/04/05) */}
      <PageHero
        title="Продукты"
        subtitle={<>{products.length} {productsWord(products.length)} · {categories.length} {categoriesWord(categories.length)}</>}
        right={(
          <Button variant="primary" iconOnly onClick={() => { setEditingProduct(null); setShowModal(true); }}
                  aria-label="Добавить продукт" title="Добавить продукт" icon={<Plus size={18} />} />
        )}
      />

      {/* Toolbar */}
      <div className="filters-row flex gap-3 items-center flex-wrap">
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
        
        {/* Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 10): на мобильном
            селекты фильтров уезжают в bottom-sheet («Фильтры · N»), на десктопе —
            прежний инлайн рядом с поиском. */}
        <FilterSheet
          count={(selectedCategories.length ? 1 : 0) + (selectedUnit ? 1 : 0) + (priceStatus ? 1 : 0) + (bindingStatus ? 1 : 0)}
          testId="products-filters"
        >
        {/* bugs-products-catalog п.4: фильтр по категориям — state и ветка
            фильтрации существовали, но UI-контрола не было (массив всегда пустой). */}
        <div style={{ width: 180 }}>
          <CustomMultiSelect
            className="w-full"
            values={selectedCategories}
            onChange={setSelectedCategories}
            options={categoryOptions}
            emptyLabel="Категория: все"
            ariaLabel="Фильтр по категориям"
          />
        </div>

        {/* Fix-5: нативные селекты фильтров — в единый CustomSelect.
            Fix-7 (п.4): ФИКСИРОВАННАЯ ширина обёртки + w-full на селекте —
            выбор короткого значения («кг», «все») больше не сужает контрол
            и не «дёргает» верстку строки фильтров. */}
        <div style={{ width: 150 }}>
          <CustomSelect
            className="w-full"
            value={selectedUnit}
            onChange={setSelectedUnit}
            options={[
              { value: '', label: 'Единица: все' },
              { value: 'KG', label: 'кг' },
              { value: 'L', label: 'л' },
              { value: 'PCS', label: 'шт' },
              { value: 'PACK', label: 'уп' },
            ]}
            ariaLabel="Фильтр по единице измерения"
          />
        </div>

        <div style={{ width: 150 }}>
          <CustomSelect
            className="w-full"
            value={priceStatus}
            onChange={setPriceStatus}
            options={[
              { value: '', label: 'Цена: любая' },
              { value: 'HAS_PRICE', label: 'есть цена' },
              { value: 'NO_PRICE', label: 'нет цены' },
            ]}
            ariaLabel="Фильтр по наличию цены"
          />
        </div>

        <div style={{ width: 180 }}>
          <CustomSelect
            className="w-full"
            value={bindingStatus}
            onChange={setBindingStatus}
            options={[
              { value: '', label: 'Интеграция: все' },
              { value: 'BOUND', label: 'привязаны к ЕМИСС' },
              { value: 'UNBOUND', label: 'не привязаны' },
            ]}
            ariaLabel="Фильтр по привязке к интеграции"
          />
        </div>

        {(query || selectedCategories.length > 0 || selectedUnit || priceStatus || bindingStatus) && (
          <Button variant="ghost" onClick={resetFilters} aria-label="Сбросить фильтры">
                      <X size={16} />
                      Сбросить
                    </Button>
        )}

        </FilterSheet>
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
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          priceByIngredient={priceByIngredient}
          onClose={() => { setShowModal(false); setEditingProduct(null); }}
          onSaved={loadData}
        />
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {confirmDialog}
    </div>
  );
}
