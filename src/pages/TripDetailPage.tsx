/**
 * Страница похода: 4 этапа воркфлоу «Меню → Закупка → Магазин → Чеки и итог»
 * (plan plans/2026-10-30-mobile-workflow-ux.md, подзадачи 2/3).
 *
 * Подзадача 26 аудита (2026-10-29, R8/R9): страница декомпозирована —
 * - состояние, загрузка и мутации — хук `useTripDetail` (единственный владелец
 *   state, компоненты им не владеют — «нет дублирования state»);
 * - производные view-модели (меню, закупка, дни, «на человека», чеклист,
 *   готовность) — чистый модуль `utils/tripDerived.ts`;
 * - презентация — компоненты `TripActions` (шапка), `TripSummaryPanel`
 *   (KPI + готовность), `TripDaysList`/`TripMealCard` (меню),
 *   `TripShoppingTab`, `TripDayShoppingTab`, `TripPersonTab`, `ExclusionCheckbox`;
 * - здесь остались только layout, переключатель этапов и модалки.
 *
 * Мобильный воркфлоу (30.10.2026): прежние 6 равноправных вкладок стали
 * 4 этапами; «Закупка по дням» и «На человека» — виды списка внутри этапа
 * «Закупка» (локальный state `shopView`); этап живёт в URL (?stage=);
 * на мобильном навигация — нижний таб-бар + степпер (`StageTabBar`).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, BookOpen, Receipt, ClipboardCheck } from 'lucide-react';
import PageLoader from '../components/PageLoader';
import ChecklistTab from '../components/ChecklistTab'; // подзадача 6: вкладка «Чеклист» вынесена из страницы (R8)
import PriceOverridesTab from '../components/PriceOverridesTab';
import AddMealModal from '../components/AddMealModal';
import MealCompositionModal from '../components/MealCompositionModal';
import ManualItemsModal from '../components/ManualItemsModal';
import TripActions from '../components/TripActions';
import TripSummaryPanel from '../components/TripSummaryPanel';
import TripDaysList from '../components/TripDaysList';
import TripShoppingTab from '../components/TripShoppingTab';
import TripDayShoppingTab from '../components/TripDayShoppingTab';
import TripPersonTab from '../components/TripPersonTab';
import StageTabBar, { type StageId } from '../components/StageTabBar';
import { Button } from '../components/Button';
import { manualForDay, manualForTrip } from '../utils/manualItems'; // U40
import { useTripDetail } from './useTripDetail';
import type { TabType, ShoppingView } from '../types/tripDetail';

export default function TripDetailPage() {
  const navigate = useNavigate();
  const d = useTripDetail();
  const { trip, loading, error, activeTab, setActiveTab, view } = d;
  // Подзадача 3: вид списка закупки — локальное состояние этапа ②
  const [shopView, setShopView] = useState<ShoppingView>('total');

  if (loading) {
    return (
      <PageLoader />
    );
  }

  if (error || !trip || !view) {
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--fire)' }}>{error || 'Поход не найден'}</p>
        <Button variant="ghost" onClick={() => navigate('/trips')} className="mt-4">← Назад к походам</Button>
      </div>
    );
  }

  const stage = activeTab as StageId;
  // Статусы этапов — из единой готовности (utils/readiness): дублей нет
  const done: Record<StageId, boolean> = {
    menu: view.readiness.menu === 'done',
    shopping: view.checklistRowIds.length > 0,
    store: view.readiness.shopping === 'done',
    checks: view.readiness.checks === 'done',
  };

  const stageTabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'menu', label: 'Меню', icon: <BookOpen size={16} /> },
    { id: 'shopping', label: 'Закупка', icon: <ShoppingCart size={16} /> },
    { id: 'store', label: 'Магазин', icon: <ClipboardCheck size={16} /> },
    { id: 'checks', label: 'Чеки и итог', icon: <Receipt size={16} /> },
  ];

  const shopViews: { id: ShoppingView; label: string }[] = [
    { id: 'total', label: 'На поход' },
    { id: 'days', label: 'По дням' },
    { id: 'person', label: 'На человека' },
  ];

  return (
    <div className="space-y-4 md:space-y-6 stage-page">
      {/* Header — подзадача 26: TripActions (+ kebab с отчётом, подзадача 7) */}
      <TripActions trip={trip} onBack={() => navigate('/trips')} onOpenReport={() => navigate(`/trips/${trip.id}/report`)} />

      {/* Мобильная sticky-полоса похода (подзадача 1); на десктопе — прежние KPI */}
      <TripSummaryPanel
        trip={trip}
        tripSummary={view.tripSummary}
        realPeople={view.realPeople}
        readiness={view.readiness}
        boughtInList={view.boughtInList}
        checklistTotal={view.checklistRowIds.length}
        factCount={view.factCount}
        factsTotal={view.factsTotal}
        stage={stage}
        done={done}
        onOpenReport={() => navigate(`/trips/${trip.id}/report`)}
      />

      {/* Мобильный степпер-прогресс (подзадача 2); десктоп — .seg ниже */}
      <StageTabBar stage={stage} onStage={setActiveTab} done={done} />

      {/* Десктоп: сегментированный контрол (.seg) из брендбука, 4 этапа */}
      <div className="seg seg-scroll w-full overflow-x-auto hidden md:flex" role="tablist" aria-label="Этапы похода">
        {stageTabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={stage === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`seg-btn flex items-center gap-2 whitespace-nowrap ${stage === tab.id ? 'active' : ''}`}
            data-testid={`desktop-tab-${tab.id}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Этап ①: меню по дням */}
      {stage === 'menu' && (
        <TripDaysList
          menuByDays={view.menuByDays}
          trip={trip}
          manualItems={d.manualItems}
          expandedDays={d.expandedDays}
          editingDay={d.editingDay}
          dayPeopleOverride={d.dayPeopleOverride}
          onToggleDay={d.toggleDay}
          onStartEditDay={(dayId, current) => { d.setEditingDay(dayId); d.setDayPeopleOverride(current); }}
          onDayPeopleChange={d.setDayPeopleOverride}
          onSaveDayPeople={(dayId) => void d.handleUpdateDayPeople(dayId)}
          onCancelEditDay={() => d.setEditingDay(null)}
          onAddDayProduct={(dayId, dayLabel) => d.setManualCtx({ dayId, dayLabel })}
          onAddMeal={(ctx) => d.setAddMealCtx(ctx)}
          onOpenComposition={(dayId, mealId) => d.setCompositionMeal({ dayId, mealId })}
          onDeleteMeal={(dayId, mealId, mealName, dayDate) => void d.handleDeleteMeal(dayId, mealId, mealName, dayDate)}
          onDeleteManual={(itemId, itemName) => void d.handleDeleteManual(itemId, itemName)}
          onAddTripProduct={() => d.setManualCtx({ dayId: null })}
        />
      )}

      {/* Этап ②: закупка — три вида одного списка (подзадача 3) */}
      {stage === 'shopping' && (
        <div className="space-y-3">
          <div className="seg seg-scroll max-w-full overflow-x-auto" role="tablist" aria-label="Вид списка закупки">
            {shopViews.map(v => (
              <button
                key={v.id}
                role="tab"
                aria-selected={shopView === v.id}
                onClick={() => setShopView(v.id)}
                className={`seg-btn whitespace-nowrap ${shopView === v.id ? 'active' : ''}`}
                data-testid={`shopping-view-${v.id}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          {shopView === 'total' && (
            <TripShoppingTab
              rows={view.sortedShopping}
              sortSpec={d.sortSpec}
              onSortField={d.handleSortField}
              total={view.shoppingTotalFinal}
              excludedCount={d.shoppingExcluded.size}
              hasMissingPrices={view.tripSummary.hasMissingPrices}
              missingIngredients={view.tripSummary.missingIngredients}
              excluded={d.shoppingExcluded}
              onToggleExcluded={d.toggleShoppingExcluded}
            />
          )}
          {shopView === 'days' && (
            <TripDayShoppingTab
              dayShopping={view.dayShopping}
              manualItems={d.manualItems}
              priceOf={view.manualPriceOf}
              excluded={d.shoppingExcluded}
              onToggleExcluded={d.toggleShoppingExcluded}
            />
          )}
          {shopView === 'person' && (
            <TripPersonTab
              trip={trip}
              realPeople={view.realPeople}
              tripSummary={view.tripSummary}
              personSummary={view.personSummary}
            />
          )}
        </div>
      )}

      {/* Этап ④: чеки и итог */}
      {stage === 'checks' && (
        <PriceOverridesTab tripId={trip.id} />
      )}

      {/* Этап ③: магазин — чеклист «что беру» (U38: ЦЕЛЫЕ упаковки, группы по
          категориям; подзадача 5: мобильный сценарий «одной рукой») */}
      {stage === 'store' && (
        <ChecklistTab
          groups={view.checklist}
          bought={d.checklistBought}
          actualQty={d.actualQty}
          onToggleRow={d.toggleBought}
          onCommitActualQty={d.commitActualQty}
          onSetAll={(on) => d.setAllBought(on, view.checklistRowIds)}
        />
      )}

      {/* Модалка A — «Добавить приём пищи» (FORM-spec §2.1): одна commit-кнопка,
          контекст дня, превью блюда; состав здесь НЕ редактируется.
          Fix-7 (п.7): люди приёма = люди дня (override дня ?? defaultPeople) */}
      {d.addMealCtx && (
        <AddMealModal
          tripId={trip.id}
          tripName={trip.name}
          defaultPeople={trip.defaultPeople}
          dayPeople={
            trip.days?.find(dd => dd.id === d.addMealCtx?.dayId)?.peopleOverride ?? trip.defaultPeople
          }
          day={{ dayId: d.addMealCtx.dayId, dayDate: d.addMealCtx.dayDate, dayIndex: d.addMealCtx.dayIndex }}
          initialMealType={d.addMealCtx.mealType ?? 'LUNCH'}
          onClose={() => d.setAddMealCtx(null)}
          onAdded={d.handleMealAdded}
        />
      )}

      {/* Модалка B — «Состав приёма» (FORM-spec §2.2): только для существующего приёма,
          batch PUT composition + refetch summary после сохранения */}
      {d.compositionMeal && (
        <MealCompositionModal
          tripId={trip.id}
          mealId={d.compositionMeal.mealId}
          isAdmin={d.isEditorAdmin === true}
          onClose={() => d.setCompositionMeal(null)}
          onSaved={() => { void d.loadData(); }}
          onEditCatalogRecipe={(recipeId) => {
            // Fix-2 (п.7): recipeId может быть trip-scoped снепшотом — резолвим
            // в глобальный каталог (mock: суффикс '::t…'; real: snapshotOf копии),
            // иначе /recipes?edit= не находит блюдо и редактор не открывается.
            const snap = d.tripRecipes.find(r => String(r.id) === String(recipeId)) as any;
            let globalId = String(recipeId);
            if (snap?.snapshotOf != null) globalId = String(snap.snapshotOf);
            else if (globalId.includes('::t')) globalId = globalId.split('::t')[0];
            navigate(`/recipes?edit=${globalId}`);
          }}
        />
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {d.confirmDialog}

      {/* Модалка ручных позиций (U40): продукты к дню (dayId) или ко всему походу (null) */}
      {d.manualCtx && (
        <ManualItemsModal
          tripId={trip.id}
          dayId={d.manualCtx.dayId}
          dayLabel={d.manualCtx.dayLabel}
          isAdmin={d.isEditorAdmin === true}
          items={d.manualCtx.dayId == null
            ? manualForTrip(d.manualItems)
            : manualForDay(d.manualItems, d.manualCtx.dayId)}
          products={view.manualProductOptions}
          onClose={() => d.setManualCtx(null)}
          onChanged={() => { void d.refreshManual(); }}
        />
      )}
    </div>
  );
}
