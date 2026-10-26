import { Button } from './Button';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from './ToastProvider';
import { Download, Printer, X } from 'lucide-react';
import { unitFromTotal, totalFromUnit, roundMoney } from '../utils/checkInput'; // Fix-3 (п.5) + Fix-4 (п.10): ввод чека СУММОЙ, без float-хвостов
import { buildShoppingCsv, downloadTextFile } from '../utils/checkExport'; // Fix-3 / R4-lite: CSV + печать
import { syncServerExclusions } from '../api/shoppingExclusions';      // Fix-3 / R2
import { formatAmount, calculateShoppingList, calculateDayShopping, realTripPeople, dayScopedExclusions } from '../utils/calculations';
import { formatRub, categoryName } from '../utils/format'; // Release-1.0: единый формат чисел/единиц
import { compareRu } from '../utils/rowSort'; // U41: алфавитная сортировка
import { mealsWord } from '../utils/text';
import { NumberField } from './NumberField';
import Modal from './Modal';
import { api, getRecipes, getTripRecipes } from '../api/client';
import {
  ActualPriceDraft,
  loadActualPrices,
  saveActualPrice,
  loadExcluded,
  setExcluded as persistExcluded,
  loadBought,
  onTripStageChange,
} from '../utils/tripStaging';

interface ShoppingItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  totalAmount: number;
  plannedUnitPrice?: number;
  actualUnitPrice?: number | null;
  plannedCost?: number;
  actualCost?: number;
  overridden: boolean;
  hasPlannedPrice: boolean;
}

interface DayShopping {
  dayDate: string;
  plannedCost: number;
  actualCost: number;
}

interface Props {
  tripId: string;
}

type TabType = 'total' | 'days' | 'person';

interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  days?: TripDay[];
}

interface TripDay {
  id: string;
  tripId: string;
  dayDate: string;
  peopleOverride?: number;
  meals?: TripMeal[];
}

interface TripMeal {
  id: string;
  tripDayId: string;
  mealType: string;
  recipeId: string;
  recipe?: any;
  peopleOverride?: number;
  sortOrder: number;
}

interface Recipe {
  id: string;
  name: string;
  mealType: string;
  baseServings: number;
  caloriesPerServing?: number;
  ingredients: any[];
}

interface Price {
  id: string;
  ingredientId: string;
  pricePerUnit: number;
  currency: string;
  effectiveFrom: string;
}

export default function PriceOverridesTab({ tripId }: Props) {
  const { showError, showSuccess } = useToast();
  // Release-1.0 (UI-consistency): сырые данные — в state, таблицы «Закупка» и «По дням»
  // ВЫВОДЯТСЯ из общих утилит (useMemo ниже). Чеки и исключения мгновенно отражаются
  // во всех суммах без ручного пересчёта и без расхождений между вкладками.
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('total');
  const [showModal, setShowModal] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Фаза 13 (п.4/5): ОДИН общий источник фактических цен и исключений для всех
  // вкладок страницы (tripStaging / localStorage). Черновики больше не живут в
  // локальном state — при размонтировании вкладки они НЕ сбрасываются, а ввод
  // фактической цены здесь сразу влияет на «По дням» и «На человека».
  const [draftOverrides, setDraftOverrides] = useState<Record<string, ActualPriceDraft>>({});
  const [shoppingExcluded, setShoppingExcluded] = useState<Set<string>>(new Set());
  // Fix-3 (п.2): отметки «взято» из чеклиста — гейт ввода чека
  const [boughtSet, setBoughtSet] = useState<Set<string>>(new Set());

  // Серверные оверрайды (GET /trips/:id/price-overrides) — как фолбэк, если
  // локальный стейдж пуст (например, чек ввели в другой сессии на сервере).
  const serverOverridesRef = useRef<Record<string, ActualPriceDraft>>({});

  const syncStage = () => {
    setDraftOverrides(loadActualPrices(tripId));
    setShoppingExcluded(loadExcluded(tripId));
    setBoughtSet(loadBought(tripId));
  };

  useEffect(() => {
    syncStage();
    return onTripStageChange(tripId, syncStage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  /** Фаза 13 (п.6): «Закупка и чеки» тоже пишет оверрайды на сервер —
   * после коммита локальную строку пересчитываем из ОБОЩЁННОГО стейджа
   * (localStorage + серверные price-overrides), а не дельтой от старого факта. */
  const commitActualPrice = async (item: ShoppingItem, v: number | null, totalOverride?: number | null) => {
    if (v == null || Number.isNaN(v)) {
      saveActualPrice(tripId, item.ingredientId, null);
    } else {
      saveActualPrice(tripId, item.ingredientId, {
        price: v,
        total: totalOverride != null ? totalOverride : v * item.totalAmount,
      });
    }
    // Синхронизируем серверное хранилище оверрайдов (best effort: mock/офлайн не ломают UI)
    try {
      await api.put(`/trips/${tripId}/price-overrides/${item.ingredientId}`, {
        actualPrice: v,
        comment: v == null ? undefined : 'чек',
      });
    } catch { /* нет роута/прав — локальный стейдж уже сохранён */ }
    // Release-1.0: ручной пересчёт строк не нужен — saveActualPrice рассылает событие
    // стейджа, syncStage обновляет draftOverrides, таблицы пересобираются в useMemo.
  };

  /**
   * Fix-3 (п.5): пользователь вводит СУММУ, которую заплатил по чеку за купленное
   * количество («Факт ₽»), а не ₽/ед. Хранилище и сводки остаются в ценах за
   * единицу — сумма делится на количество позиции и распределяется автоматически.
   */
  const commitActualTotal = (item: ShoppingItem, total: number | null) => {
    if (total == null || Number.isNaN(total)) {
      void commitActualPrice(item, null);
      return;
    }
    const unit = unitFromTotal(total, item.totalAmount);
    if (unit == null) return; // нулевое количество — вводить некуда
    void commitActualPrice(item, unit, total);
  };

  /** Фактические цены: общий стейдж (инлайн-поле + модалка) поверх серверных оверрайдов. */
  const effectiveOverrides = (): Record<string, ActualPriceDraft> => ({
    ...(serverOverridesRef.current || {}),
    ...draftOverrides,
  });

  /** Фаза 13 (п.5): soft-disable позиции из расчёта прямо во вкладке «Закупка». */
  const toggleExcluded = (ingredientId: string) => {
    const next = new Set(shoppingExcluded);
    if (next.has(ingredientId)) next.delete(ingredientId);
    else next.add(ingredientId);
    persistExcluded(tripId, next);
    setShoppingExcluded(next);
    // Fix-3 / R2: глобальные исключения дублируются на сервер (best effort)
    void syncServerExclusions(tripId, next);
  };

  // Загрузка данных через API
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Фаза 13 (п.6): серверные price-overrides — фолбэк-источник фактических цен
      const serverOvs = await api
        .get<Array<{ ingredientId: string; actualPrice: number }>>(`/trips/${tripId}/price-overrides`)
        .catch(() => [] as Array<{ ingredientId: string; actualPrice: number }>);
      serverOverridesRef.current = Object.fromEntries(
        (serverOvs || []).map(o => [String(o.ingredientId), { price: o.actualPrice, total: 0 } as ActualPriceDraft])
      );

      const [tripData, recipesData, pricesData, tripRecipesData] = await Promise.all([
        api.get<Trip>(`/trips/${tripId}`),
        getRecipes(),
        // V20: цены похода — trip-scoped копии (план заморожен на момент планирования)
        api.get<Price[]>(`/trips/${tripId}/prices`),
        // V20 + Release-1.0: копии блюд похода через getTripRecipes — с нормализацией
        // плоских DTO снапшотов (без неё строки «Unknown» и единица «шт» вместо «кг»).
        getTripRecipes(tripId).catch(() => [] as Recipe[])
      ]);

      setTrip(tripData);
      // V20: расчёт по объединённому набору: справочник (пикер) + копии блюд похода
      setAllRecipes([...recipesData, ...tripRecipesData]);
      setPrices(pricesData);
    } catch (err) {
      console.error('Failed to load ', err);
      setError('Не удалось загрузить данные');
      showError('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  // ===== Release-1.0 (UI-consistency): производные таблицы из ОБЩИХ утилит =====
  // Раньше здесь жила локальная копия расчёта («простой расчёт без calculateShoppingList»):
  // она читала только вложенный ri.ingredient и брала ПЕРВУЮ цену без учёта даты.
  // Теперь те же calculateShoppingList/calculateDayShopping, что и на вкладке «Закупка на
  // поход» — одна математика, одни имена, одни единицы на всех поверхностях.
  const recipesMap = useMemo(
    () => new Map(allRecipes.map(r => [String(r.id), r])),
    [allRecipes]
  );

  const shoppingItems = useMemo<ShoppingItem[]>(() => {
    if (!trip) return [];
    const stage = { ...(serverOverridesRef.current || {}), ...draftOverrides };
    // Fix-2 (п.5): по-дневные исключения уменьшают количества агрегата;
    // глобально исключённые строки отфильтровываются из итогов ниже.
    return calculateShoppingList(trip as any, recipesMap as any, prices as any, dayScopedExclusions(shoppingExcluded)).map(it => {
      // Плановая ₽/ед — из плановой стоимости позиции (та же цена по дням, что в «План ₽»),
      // чтобы строка таблицы была самосогласована: plannedCost = plannedUnitPrice × totalAmount.
      const plannedCost = it.estimatedCost;
      const plannedUnitPrice = plannedCost != null && it.totalAmount > 0
        ? plannedCost / it.totalAmount
        : undefined;
      const ov = stage[String(it.ingredientId)];
      const actualUnitPrice = ov?.price ?? plannedUnitPrice;
      return {
        ingredientId: String(it.ingredientId),
        ingredientName: it.ingredientName,
        unit: it.unit,
        totalAmount: it.totalAmount,
        plannedUnitPrice,
        actualUnitPrice,
        plannedCost,
        actualCost: actualUnitPrice != null ? actualUnitPrice * it.totalAmount : plannedCost,
        overridden: ov != null,
        hasPlannedPrice: it.hasPrice,
      };
    })
    // U41: чек и закупка — по алфавиту (иначе длинный список невозможно вводить)
    .sort((a, b) => compareRu(a.ingredientName, b.ingredientName));
  }, [trip, recipesMap, prices, draftOverrides, shoppingExcluded]);

  // ===== U41: категории продуктов для группировки чека =====
  // Best effort: справочник продуктов (mock/admin) + вложенные ingredient-объекты
  // trip-рецептов; фолбэк — «Прочее».
  const [productCats, setProductCats] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    api.get<any>('/admin/products', { params: { size: '1000' } })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.content ?? []);
        const map: Record<string, string> = {};
        for (const p2 of list) map[String(p2.id)] = categoryName(p2) || 'Прочее';
        setProductCats(map);
      })
      .catch(() => { /* не-админ в real-режиме — останутся категории из рецептов */ });
    return () => { cancelled = true; };
  }, []);

  const categoryOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of allRecipes) {
      for (const ri of ((r as any).ingredients || [])) {
        const ing = ri?.ingredient ?? ri;
        const iid = String(ri?.ingredientId ?? ing?.id ?? '');
        const cat = categoryName(ing) || (typeof ri?.category === 'string' ? ri.category : '');
        if (iid && cat) m[iid] = cat;
      }
    }
    return { ...m, ...productCats };
  }, [allRecipes, productCats]);

  /** U41: группы чека — категории по алфавиту («Прочее» в конце), внутри алфавит. */
  const checkGroups = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const it of shoppingItems) {
      const cat = categoryOf[String(it.ingredientId)] || 'Прочее';
      const list = groups.get(cat) ?? [];
      list.push(it);
      groups.set(cat, list);
    }
    const cats = [...groups.keys()].sort((a, b) => {
      if (a === 'Прочее') return 1;
      if (b === 'Прочее') return -1;
      return compareRu(a, b);
    });
    return cats.map(c => ({ category: c, items: groups.get(c)! }));
  }, [shoppingItems, categoryOf]);

  const dayShopping = useMemo<DayShopping[]>(() => {
    if (!trip) return [];
    const stage = { ...(serverOverridesRef.current || {}), ...draftOverrides };
    // Факт дня считаем по количествам ЭТОГО дня (раньше к каждому дню прибавлялась
    // общая дельта всего похода — «По дням» не сходилась с «Закупкой»).
    return calculateDayShopping(trip as any, recipesMap as any, prices as any, shoppingExcluded).map(d => {
      let actual = 0;
      for (const it of d.items) {
        const planned = it.estimatedCost ?? 0;
        const ov = stage[String(it.ingredientId)]?.price;
        actual += ov != null ? ov * it.totalAmount : planned;
      }
      return { dayDate: d.dayDate, plannedCost: d.dayCost, actualCost: actual };
    });
  }, [trip, recipesMap, prices, shoppingExcluded, draftOverrides]);

  const calculateDelta = (planned?: number | null, actual?: number | null): number => {
    if (!planned || !actual || planned === 0) return 0;
    return ((actual - planned) / planned) * 100;
  };

  const formatDelta = (delta: number): string => {
    if (delta === 0) return '0%';
    // Release-1.0: запятая вместо точки («+3,5%») — единый десятичный разделитель во всём UI
    return `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  };

  const getDeltaChipClass = (delta: number): string => {
    if (Math.abs(delta) < 0.001) return 'dim';
    return delta > 0 ? 'fire' : 'ok';
  };

  const totalPlanned = shoppingItems
    .filter(item => !shoppingExcluded.has(item.ingredientId))
    .reduce((sum, item) => sum + (item.plannedCost || 0), 0);
  // Фаза 13 (п.4): факт считается из ОБЩЕГО стейджа цен (draftOverrides + серверные
  // оверрайды) — инлайн-поле «Закупки» на главной вкладке и модалка «Ввести чек»
  // здесь дают одинаковый результат и мгновенно попадают в «По дням»/«На человека».
  const actualUnitOf = (item: ShoppingItem): number | undefined =>
    effectiveOverrides()[item.ingredientId]?.price ?? item.actualUnitPrice;
  const totalActual = shoppingItems
    .filter(item => !shoppingExcluded.has(item.ingredientId))
    .reduce((sum, item) => {
      const u = actualUnitOf(item);
      return sum + (u != null ? item.totalAmount * u : (item.actualCost || 0));
    }, 0);
  const totalDelta = calculateDelta(totalPlanned, totalActual);

  // Release-1.0: «По дням» уже включает фактические цены стейджа и исключения —
  // таблица выводится из dayShopping (useMemo выше), отдельный «view»-слой не нужен.

  // FIX: «только расхождения» учитывает стейдж-оверрайды (факт из общего стейджа),
  // а не только флаг overridden из начального расчёта.
  const filteredItems = onlyDiff
    ? shoppingItems.filter(item => {
        const u = actualUnitOf(item);
        return item.overridden || (u != null && item.plannedUnitPrice != null && u !== item.plannedUnitPrice);
      })
    : shoppingItems;

  // Fix-3 (п.2): чек нельзя ввести, пока в чеклисте не отмечено ни одной покупки.
  // Не блокер: в чеклисте есть «Отметить всё» одной кнопкой.
  const canEnterCheck = boughtSet.size > 0;

  // Fix-3 / R4-lite: экспорт чека-закупки — CSV (Excel: BOM + ';') и печать
  const exportCsv = () => {
    const rows = shoppingItems
      .filter(i => !shoppingExcluded.has(i.ingredientId))
      .map(i => {
        const unit = effectiveOverrides()[i.ingredientId]?.price ?? i.actualUnitPrice ?? null;
        const fact = unit != null ? unit * i.totalAmount : (i.actualCost ?? null);
        return {
          name: i.ingredientName,
          amount: formatAmount(i.totalAmount, i.unit),
          plannedCost: formatRub(i.plannedCost),
          actualCost: formatRub(fact),
          delta: formatDelta(calculateDelta(i.plannedCost, fact)),
        };
      });
    const safeName = String(trip?.name ?? tripId).replace(/[\\/:*?"<>|]/g, '_');
    downloadTextFile(`zakupka-${safeName}.csv`, buildShoppingCsv(rows, String(trip?.name ?? '')));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="note-box">Загрузка...</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="space-y-4">
        <div className="note-box" style={{ color: 'var(--fire)' }}>
          {error || 'Поход не найден'}
        </div>
        <Button variant="ghost">
Повторить
        </Button>
      </div>
    );
  }

  // U33/U34: «на человека» — по РЕАЛЬНОМУ количеству людей (среднее эффективных
  // людей по дням, peopleOverride учитывается), подписи «делим на defaultPeople» убраны.
  const realPeople = Math.max(1, realTripPeople(trip as any));
  const realPeopleLabel = Number.isInteger(realPeople) ? String(realPeople) : realPeople.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
  const totalPersonMeals = trip.days?.reduce((acc: number, d: TripDay) => 
    acc + (d.meals?.reduce((mealAcc: number, m: TripMeal) => mealAcc + (m.peopleOverride || d.peopleOverride || trip.defaultPeople || 1), 0) || 0)
  , 0) || 1;

  return (
    <div className="space-y-4">
      {/* Информационная заметка */}
      <div className="note-box">
        ℹ Факт вводится СУММОЙ из чека за позицию («Факт ₽») — цена за единицу и все
        сводки пересчитываются автоматически и распределяются на всех. Пустое поле = «план».
        {!canEnterCheck && (
          <b style={{ color: 'var(--fire, #d97706)' }}>
            {' '}Ввод чека откроется, когда вы отметите покупки во вкладке «Чеклист»
            (там же можно отметить всё одной кнопкой).
          </b>
        )}
      </div>

      {/* Панель действий */}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Fix-3 (п.2): гейт — чек вводим только после подтверждения закупки в чеклисте */}
        <Button
          variant="primary"
          onClick={() => setShowModal(true)}
          disabled={!canEnterCheck}
          title={canEnterCheck ? undefined : 'Сначала отметьте купленное во вкладке «Чеклист»'}
        >
          Ввести чек
        </Button>
        {/* Fix-3 / R4-lite: рабочая замена мёртвого «Экспорт PDF» — CSV и печать */}
        <Button variant="ghost" icon={<Download size={16} />} onClick={exportCsv} aria-label="Экспорт CSV">
          Экспорт CSV
        </Button>
        {/* Fix-4 (п.6): «Печать» открывает полную печатную версию похода
            (меню по дням + сводка + итоги) — её же сохраняют в PDF */}
        <Button variant="ghost" icon={<Printer size={16} />}
                onClick={() => window.open(`/trips/${tripId}/print`, '_blank')}
                aria-label="Печать" title="Печатная версия похода (можно сохранить в PDF)">
          Печать
        </Button>
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--muted)', fontSize: '12px' }}>
          <input 
            type="checkbox" 
            checked={onlyDiff}
            onChange={e => setOnlyDiff(e.target.checked)}
          />
          только расхождения
        </label>
      </div>

      {/* Табы */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('total')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'total' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'total' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'total' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'total' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'total' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, var(--grad-brand) border-box' : 'none'
          }}
        >
          Закупка
        </button>
        <button
          onClick={() => setActiveTab('days')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'days' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'days' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'days' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'days' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'days' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, var(--grad-brand) border-box' : 'none'
          }}
        >
          По дням
        </button>
        <button
          onClick={() => setActiveTab('person')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'person' 
              ? 'text-white' 
              : ''
          }`}
          style={{
            background: activeTab === 'person' ? 'var(--elev)' : 'transparent',
            border: activeTab === 'person' ? '1px solid transparent' : '1px solid var(--border)',
            color: activeTab === 'person' ? 'var(--text)' : 'var(--muted)',
            backgroundImage: activeTab === 'person' ? 'linear-gradient(var(--elev), var(--elev)) padding-box, var(--grad-brand) border-box' : 'none'
          }}
        >
          На человека
        </button>
      </div>

      {/* Вкладка: Закупка */}
      {activeTab === 'total' && (
        <div className="rounded-xl overflow-hidden max-w-4xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 'var(--sp-1) var(--sp-3) var(--sp-4)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="px-2 py-3" title="Снять галочку, чтобы исключить продукт из расчёта (не удаляя его)"></th>
                <th className="text-left px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Продукт</th>
                {/* Fix-3 (п.5): никаких «₽/ед» — сколько надо купить, план суммой и факт суммой из чека */}
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }} title="Сколько надо было купить по расчёту">Надо купить</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }} title="Плановая стоимость позиции">План ₽</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }} title="Сколько вы заплатили по чеку за купленное количество">Факт ₽</th>
                <th className="text-right px-2 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const actualUnit = draftOverrides[item.ingredientId]?.price ?? item.actualUnitPrice ?? null;
                const excluded = shoppingExcluded.has(item.ingredientId);
                // Fix-3 (п.5): в поле — СУММА чека за позицию; Δ и итоги — тоже суммы.
                // Fix-4 (п.10): округление до копеек — никаких «165,50240000000002».
                const actualTotal = roundMoney(totalFromUnit(actualUnit, item.totalAmount));
                const actualCostView = actualTotal ?? item.actualCost;
                const delta = calculateDelta(item.plannedCost, actualCostView);
                const deltaChipClass = getDeltaChipClass(delta);

                return (
                  <tr key={item.ingredientId} style={{ borderBottom: '1px solid var(--border)', opacity: excluded ? 0.45 : 1 }}>
                    <td className="px-2 py-3 text-center">
                      {/* Фаза 13 (п.5): soft-disable — продукт остаётся в списке, но не влияет на итог */}
                      <input
                        type="checkbox"
                        checked={!excluded}
                        onChange={() => toggleExcluded(item.ingredientId)}
                        aria-label={excluded ? `Включить в расчёт: ${item.ingredientName}` : `Исключить из расчёта: ${item.ingredientName}`}
                        title={excluded ? 'Включить в расчёт' : 'Исключить из расчёта (не удаляя)'}
                        className="cursor-pointer"
                        style={{ accentColor: 'var(--w2)' }}
                      />
                    </td>
                    <td className="px-2 py-3">
                      <b style={{ color: 'var(--text)' }}>{item.ingredientName}</b>
                      {excluded && (
                        <span className="chip-delta dim" style={{ marginLeft: 6, fontSize: 10 }}>искл.</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(item.totalAmount, item.unit)}
                    </td>
                    <td className="px-2 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {excluded ? '—' : formatRub(item.plannedCost)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <NumberField
                        value={actualTotal}
                        stepRef={item.plannedCost}
                        placeholder={`план ${formatRub(item.plannedCost)}`}
                        disabled={!canEnterCheck}
                        onCommit={v => commitActualTotal(item, v)}
                        testId={`actual-input-${item.ingredientId}`}
                        ariaLabel={`Фактическая сумма из чека за позицию (₽): ${item.ingredientName}, куплено ${formatAmount(item.totalAmount, item.unit)}`}
                      />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <span className={`chip-delta ${deltaChipClass}`}>
                        {formatDelta(delta)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Sticky итог */}
          <div className="sticky-totals">
            <span style={{ color: 'var(--text)' }}>
              Итого план: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatRub(totalPlanned)}</b>
            </span>
            <span style={{ color: 'var(--text)' }}>
              Итого факт: <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--w1)' }}>{formatRub(totalActual)}</b>
            </span>
            <span className={`chip-delta ${getDeltaChipClass(totalDelta)}`}>
              {formatDelta(totalDelta)}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
              расхождение: {formatRub(totalActual - totalPlanned)}
            </span>
            {shoppingExcluded.size > 0 && (
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>без {shoppingExcluded.size} искл.</span>
            )}
          </div>
        </div>
      )}

      {/* Вкладка: По дням */}
      {activeTab === 'days' && (
        <div className="rounded-xl overflow-hidden max-w-3xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>День</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>План ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Факт ₽</th>
                <th className="text-right px-4 py-3 font-bold" style={{ color: 'var(--muted)', fontSize: '11px' }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {dayShopping.map(day => {
                const delta = calculateDelta(day.plannedCost, day.actualCost);
                return (
                  <tr key={day.dayDate} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="px-4 py-3">
                      <b style={{ color: 'var(--text)' }}>
                        {new Date(day.dayDate).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                      </b>
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatRub(day.plannedCost)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatRub(day.actualCost)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`chip-delta ${getDeltaChipClass(delta)}`}>
                        {formatDelta(delta)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Вкладка: На человека */}
      {activeTab === 'person' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На одного человека</b>
            {/* U34: никакой технической «кухни» — только результат и понятный контекст */}
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              {realPeopleLabel} чел. в походе
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>План</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalPlanned / realPeople)}
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Факт</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalActual / realPeople)}
              </b>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <b style={{ color: 'var(--text)' }}>На один человеко-приём</b>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
              {totalPersonMeals} {mealsWord(totalPersonMeals)} за поход
            </p>
            <div className="flex justify-between py-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>План</span>
              <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalPlanned / totalPersonMeals)}
              </b>
            </div>
            <div className="flex justify-between py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Факт</span>
              <b style={{ color: 'var(--w1)', fontVariantNumeric: 'tabular-nums' }}>
                {formatRub(totalActual / totalPersonMeals)}
              </b>
            </div>
          </div>
        </div>
      )}

      {/* Модалка "Ввести чек" */}
      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <div className="modal-sheet">
            {/* U21: единый крестик в шапке модалки */}
            <div className="flex items-start justify-between gap-3">
              <b style={{ fontFamily: 'Unbounded', fontSize: '15px', color: 'var(--text)' }}>Ввести чек</b>
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
            <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 'var(--sp-1) 0 var(--sp-4)' }}>
              {/* Fix-3 (п.5): сумма из чека за позицию — не цена за единицу */}
              Введите, сколько заплатили по чеку за каждую позицию (₽ за купленное количество).
              Пусто = «по плану». Цена за единицу и распределение на всех посчитаются сами.
            </p>
            {/* U41: чек разбит по категориям (алфавит), внутри категории — алфавит */}
            <div className="flex flex-col gap-4">
              {checkGroups.map(group => (
                <div key={group.category}>
                  <p className="text-xs font-bold mb-2 px-1 uppercase tracking-wide" style={{ color: 'var(--w1)' }}>
                    {group.category}
                  </p>
                  <div className="flex flex-col gap-3">
                    {group.items.map(item => (
                      <div key={item.ingredientId} className="flex gap-3 items-center">
                        <span style={{ flex: 1, fontSize: '13px', color: 'var(--text)' }}>
                          {item.ingredientName}
                          <span style={{ color: 'var(--muted)' }}> · {formatAmount(item.totalAmount, item.unit)}</span>
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
                          план {formatRub(item.plannedCost)}
                        </span>
                        <NumberField
                          size="sm"
                          value={roundMoney(totalFromUnit(
                            draftOverrides[item.ingredientId]?.price ?? item.actualUnitPrice ?? null,
                            item.totalAmount,
                          ))}
                          stepRef={item.plannedCost}
                          placeholder={`план ${formatRub(item.plannedCost)}`}
                          onCommit={v => commitActualTotal(item, v)}
                          testId={`modal-input-${item.ingredientId}`}
                          ariaLabel={`Фактическая сумма из чека (₽): ${item.ingredientName}, куплено ${formatAmount(item.totalAmount, item.unit)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <Button
                variant="primary"
                className="flex-1"
                onClick={() => {
                  setShowModal(false);
                  showSuccess('Чек сохранён');
                }}
              >
                Сохранить чек
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
