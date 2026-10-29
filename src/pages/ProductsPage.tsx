import { useState, useEffect, useRef } from 'react';
import { useToast } from '../components/ToastProvider';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7)
import { Plus, Search, X } from 'lucide-react';
import { NumberField } from '../components/NumberField';
import { ProductTable, type ProductRow } from '../components/ProductTable';
import { EmisLinkPicker } from '../components/EmisLinkPicker';
import Modal from '../components/Modal';
import CustomSelect from '../components/CustomSelect';
import { DatePicker } from '../components/DatePicker';
import { api } from '../api/client';
import type { UnitOfMeasure, ProductCategory, IngredientPrice } from '../types';
import { humanizeUnit, recipesWord } from '../utils/text';
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
  
  
  // Form
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formUnit, setFormUnit] = useState<UnitOfMeasure>('KG');
  const [formPackSize, setFormPackSize] = useState<number | null>(null);
  const [formRoundToPacks, setFormRoundToPacks] = useState(false);
  const [formCalories, setFormCalories] = useState<number | null>(null);
  const [formPieceWeightG, setFormPieceWeightG] = useState<number | null>(null);
  // V20-ux: цена продукта правится прямо из карточки продукта (ранее — только отдельной
  // вкладкой «Цены» в админке, из-за чего цену «невозможно было установить» на месте)
  const [formPrice, setFormPrice] = useState('');
  const [formPriceDate, setFormPriceDate] = useState('');
  // V26/V28: источник цены — позиция локального справочника ЕМИСС («софт»-привязка).
  // Пустая строка = не привязан, цену ведёт человек.
  const [formEmisCode, setFormEmisCode] = useState('');
  const [formEmisName, setFormEmisName] = useState<string | null>(null);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, number>>({});
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


  // Проверка дубликата.
  // U23 (flaky e2e): две защиты от гонок —
  // 1) отменяемый debounce: клик по единице отменяет незавершённую проверку
  //    со старой единицей (иначе медленный ответ перезаписывал свежий warning);
  // 2) сторож по порядковому номеру: устаревший асинхронный ответ не влияет
  //    на состояние, если уже запущена более новая проверка.
  const dupCheckSeq = useRef(0);
  const dupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkDuplicate = async (name: string, unit: UnitOfMeasure) => {
    const seq = ++dupCheckSeq.current;
    if (!name) {
      setDuplicateWarning(null);
      return;
    }

    try {
      const response = await api.get<any>(
        `/admin/products/check-name?name=${encodeURIComponent(name)}&unit=${unit}`
      );
      if (seq !== dupCheckSeq.current) return; // уже запущена более новая проверка

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
      if (seq !== dupCheckSeq.current) return;
      console.error('Failed to check duplicate:', error);
      // ЗАДАЧА 3: пользователь узнаёт, что проверка дубля не выполнена
      showError('Не удалось проверить наличие такого же продукта');
    }
  };

  /** Отменяет незавершённый debounce и планирует проверку дубля через 300 мс. */
  const scheduleDuplicateCheck = (name: string, unit: UnitOfMeasure) => {
    if (dupDebounce.current) clearTimeout(dupDebounce.current);
    dupDebounce.current = setTimeout(() => checkDuplicate(name, unit), 300);
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
        pieceWeightG: formPieceWeightG,
        // null = отвязать источник цены (бэкенд: пусто → null)
        emisCode: formEmisCode.trim() || null
      };

      let savedId: string | number | undefined = editingProduct?.id;
      if (editingProduct) {
        await api.put(`/admin/products/${editingProduct.id}`, body);
        showSuccess('Продукт обновлён');
      } else {
        const created = await api.post<{ id?: string | number }>('/admin/products', body);
        savedId = created?.id ?? savedId;
        showSuccess('Продукт создан');
      }

      // Цена (новый срез ingredient_prices): отдельно от карточки продукта,
      // чтобы ошибка цены не откатывала сохранение самого продукта
      const priceVal = Number(formPrice.replace(',', '.'));
      if (formPrice.trim() && savedId != null) {
        if (!(priceVal > 0)) {
          showError('Цена должна быть числом больше нуля');
        } else {
          try {
            await api.post('/admin/ingredient-prices', {
              ingredientId: savedId,
              pricePerUnit: priceVal,
              currency: 'RUB',
              effectiveFrom: formPriceDate || new Date().toISOString().slice(0, 10),
            });
            showSuccess('Цена установлена');
          } catch (priceErr: any) {
            showError(priceErr?.error?.detail || priceErr?.detail || 'Продукт сохранён, но цену установить не удалось');
          }
        }
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
    setFormName(product.name);
    setFormCategory(product.categoryId || '');
    setFormUnit(product.unit);
    setFormPackSize(product.packSize ?? null);
    setFormRoundToPacks(product.roundToPacks ?? false);
    setFormCalories(product.kcalPer100g ?? null);
    setFormPieceWeightG(product.pieceWeightG ?? null);
    setFormPrice('');
    setFormPriceDate(new Date().toISOString().slice(0, 10));
    setFormEmisCode(product.emisCode ?? '');
    setFormEmisName(product.emisName ?? null);
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
    setFormPrice('');
    setFormPriceDate('');
    setFormEmisCode('');
    setFormEmisName(null);
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



  // KB-5: пикеру привязки нужен контекст продукта, чтобы сервер вернул цену, пересчитанную
  // на нашу единицу, и предупреждение о сомнительной паре. Текущая цена — из формы, если её
  // ввели, иначе действующая цена редактируемого продукта.
  const formPriceNumber = Number(String(formPrice).replace(',', '.'));
  const emisCurrentPrice = Number.isFinite(formPriceNumber) && formPriceNumber > 0
    ? formPriceNumber
    : (editingProduct?.currentPrice?.value ?? null);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
        </div>
        {/* Fix-10 (п.4): брендовый лоаджер вместо «Загрузка…» */}
        <PageLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Продукты</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <Button variant="ghost" onClick={loadData}>Повторить</Button>
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
        {/* Fix-7 (п.5): кнопка создания — справа, иконочная (единый паттерн);
            aria-label «Добавить продукт» сохранён (E2E-03/04/05) */}
        <Button variant="primary" iconOnly onClick={() => { resetForm(); setShowModal(true); }}
                aria-label="Добавить продукт" title="Добавить продукт" icon={<Plus size={18} />} />
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

        {(query || selectedUnit || priceStatus || bindingStatus) && (
          <Button variant="ghost" onClick={resetFilters} aria-label="Сбросить фильтры">
                      <X size={16} />
                      Сбросить
                    </Button>
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
        <Modal onClose={() => setShowModal(false)}>
          <div className="modal-sheet rounded-2xl shadow-xl w-full max-w-md p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {/* U21: единый крестик в шапке модалки */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                {editingProduct ? 'Редактировать продукт' : 'Новый продукт'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Закрыть"
                className="p-2 rounded-lg transition-colors shrink-0"
                style={{ color: 'var(--muted)' }}
              >
                <X size={18} />
              </button>
            </div>

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
                    scheduleDuplicateCheck(e.target.value, formUnit);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="Например: Гречка ядрица"
                />
                {duplicateWarning && (
                  <div className="mt-2 p-3 rounded-lg text-sm" style={{
                    background: duplicateWarning.type === 'hard' ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'color-mix(in srgb, var(--amber-500) 10%, transparent)',
                    border: `1px solid ${duplicateWarning.type === 'hard' ? 'color-mix(in srgb, var(--danger) 30%, transparent)' : 'color-mix(in srgb, var(--amber-500) 30%, transparent)'}`,
                    color: duplicateWarning.type === 'hard' ? 'var(--danger)' : 'var(--amber-300)'
                  }}>
                    {duplicateWarning.message}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Категория *
                </label>
                {/* U12 (список багов 25.10): нативный <select> выглядел чужеродно —
                    кастомный dropdown в стиле приложения (Фаза 13, CustomSelect). */}
                <CustomSelect
                  value={formCategory}
                  onChange={setFormCategory}
                  options={categories.map(cat => ({ value: String(cat.id), label: cat.name }))}
                  placeholder="Выберите категорию..."
                  ariaLabel="Категория"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  Единица измерения *
                </label>
                {/* Fix-5 (п.16): компактные чипы-единицы вместо кнопок «на пол-лица» */}
                <div className="flex gap-1.5" role="group" aria-label="Единица измерения">
                  {(['KG', 'L', 'PCS', 'PACK'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => {
                        setFormUnit(u);
                        // U23: отменяем незавершённый debounce-чек со старой единицей
                        scheduleDuplicateCheck(formName, u);
                      }}
                      aria-pressed={formUnit === u}
                      className="px-3.5 py-1.5 text-sm font-semibold transition-all"
                      style={{
                        borderRadius: 'var(--r-input, 8px)',
                        background: formUnit === u ? 'var(--grad-brand)' : 'transparent',
                        border: formUnit === u ? '1px solid transparent' : '1px solid var(--border)',
                        color: formUnit === u ? 'var(--on-fire)' : 'var(--text-2)'
                      }}
                    >
                      {u === 'KG' ? 'кг' : u === 'L' ? 'л' : u === 'PCS' ? 'шт' : 'уп'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  {/* Fix-5 (п.18): калорийность — НЕ обязательна («могу не знать»);
                      длинная подсказка переехала из плейсхолдера (не влезал) в подпись */}
                  Калорийность на 100 г / 100 мл (опционально)
                </label>
                <NumberField
                  value={formCalories}
                  stepRef={formCalories ?? 100}
                  maxDecimals={0}
                  onCommit={v => setFormCalories(v)}
                  placeholder="ккал"
                  ariaLabel="Калорийность на 100 г или 100 мл"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Как на упаковке. Можно оставить пустым.</p>
              </div>

              {/* Fix-5 (п.18): вес штуки/упаковки показываем ВСЕГДА для шт/уп —
                  он не зависит от того, знаете ли вы калорийность */}
              {(formUnit === 'PCS' || formUnit === 'PACK') && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                    Вес 1 {formUnit === 'PCS' ? 'шт' : 'уп'}, г{formCalories ? ' *' : ''}
                  </label>
                  <NumberField
                    value={formPieceWeightG}
                    stepRef={formPieceWeightG ?? 100}
                    maxDecimals={0}
                    onCommit={v => setFormPieceWeightG(v)}
                    placeholder={formUnit === 'PCS' ? "325" : "600"}
                    ariaLabel={`Вес одной штуки или упаковки в граммах`}
                  />
                  {formCalories ? (
                    <p className="text-xs mt-1" style={{ color: 'var(--fire)' }}>
                      ⚠ Обязательно: без веса ккал для шт/уп не рассчитать
                    </p>
                  ) : (
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                      Например: 325 для банки тушёнки, 600 для блока лапши
                    </p>
                  )}
                </div>
              )}

              {/* V26/V28: откуда брать цену — позиция ЕМИСС (ищется по локальной копии).
                  Ручная цена ниже остаётся доступной, но у привязанного продукта
                  синхронизация её перезапишет. */}
              <EmisLinkPicker
                value={formEmisCode}
                linkedName={formEmisName}
                unit={formUnit}
                pieceWeightG={formPieceWeightG}
                currentPrice={emisCurrentPrice}
                onChange={(code, name) => {
                  setFormEmisCode(code);
                  setFormEmisName(name);
                }}
              />

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>
                  {editingProduct
                    ? `Цена, ₽ за ${formUnit === 'KG' ? 'кг' : formUnit === 'L' ? 'л' : formUnit === 'PCS' ? 'шт' : 'уп'}${
                        priceByIngredient[String(editingProduct.id)] != null
                          ? ` (сейчас ${priceByIngredient[String(editingProduct.id)]})`
                          : ' (сейчас не задана)'
                      }`
                    : `Цена при создании, ₽ за ${formUnit === 'KG' ? 'кг' : formUnit === 'L' ? 'л' : formUnit === 'PCS' ? 'шт' : 'уп'} (опционально)`}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="например, 210"
                    aria-label="Цена"
                    className="flex-1 px-3 py-2 rounded-lg outline-none"
                    style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  />
                  {/* U10 (список багов 25.10): единый календарь приложения —
                      DatePicker (react-datepicker, ru-локаль), а не нативный
                      input[type=date] с системным пикером. */}
                  <div style={{ width: 170 }}>
                    <DatePicker
                      value={formPriceDate || null}
                      onChange={setFormPriceDate}
                      placeholder="Дата действия цены"
                    />
                  </div>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                  Пусто = не менять. Новая цена добавляется срезом с даты (история сохраняется).
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>Отмена</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={!formName || !formCategory || duplicateWarning?.type === 'hard'} aria-label="Сохранить продукт">Сохранить</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {confirmDialog}
    </div>
  );
}
