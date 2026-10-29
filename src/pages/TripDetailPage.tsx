/**
 * Страница похода: меню по дням, закупка (на поход / по дням / на человека),
 * чеклист и ввод чеков.
 *
 * Подзадача 26 аудита (2026-10-29, R8/R9): страница декомпозирована —
 * - состояние, загрузка и мутации — хук `useTripDetail` (единственный владелец
 *   state, компоненты им не владеют — «нет дублирования state»);
 * - производные view-модели (меню, закупка, дни, «на человека», чеклист,
 *   готовность) — чистый модуль `utils/tripDerived.ts`;
 * - презентация — компоненты `TripActions` (шапка), `TripSummaryPanel`
 *   (KPI + готовность), `TripDaysList`/`TripMealCard` (меню),
 *   `TripShoppingTab`, `TripDayShoppingTab`, `TripPersonTab`, `ExclusionCheckbox`;
 * - здесь остались только layout, переключатель вкладок и модалки.
 *
 * История инвариантов (Фаза 13, Fix-2..8, U26–U40) — в комментариях модулей.
 */
import { useNavigate } from 'react-router-dom';
import { Users, ShoppingCart, BookOpen, TrendingUp, Calendar, ClipboardCheck } from 'lucide-react';
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
import { Button } from '../components/Button';
import { manualForDay, manualForTrip } from '../utils/manualItems'; // U40
import { useTripDetail } from './useTripDetail';
import type { TabType } from '../types/tripDetail';

export default function TripDetailPage() {
  const navigate = useNavigate();
  const d = useTripDetail();
  const { trip, loading, error, activeTab, setActiveTab, view } = d;

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

  const tabs = [
    { id: 'menu' as TabType, label: 'Меню по дням', icon: <BookOpen size={16} /> },
    { id: 'shopping' as TabType, label: 'Закупка на поход', icon: <ShoppingCart size={16} /> },
    { id: 'dayShopping' as TabType, label: 'Закупка по дням', icon: <Calendar size={16} /> },
    { id: 'person' as TabType, label: 'На человека', icon: <Users size={16} /> },
    // Fix-3 (п.3): чеклист (список покупок) идёт РАНЬШЕ «Закупка и чеки» —
    // сначала подтверждаем покупку, потом вводим чек
    { id: 'checklist' as TabType, label: 'Чеклист', icon: <ClipboardCheck size={16} /> },
    { id: 'overrides' as TabType, label: 'Закупка и чеки', icon: <TrendingUp size={16} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header — подзадача 26: TripActions */}
      <TripActions trip={trip} onBack={() => navigate('/trips')} />

      {/* KPI-карточки + сквозная готовность — подзадача 26: TripSummaryPanel */}
      <TripSummaryPanel
        trip={trip}
        tripSummary={view.tripSummary}
        realPeople={view.realPeople}
        readiness={view.readiness}
        boughtInList={view.boughtInList}
        checklistTotal={view.checklistRowIds.length}
        factCount={view.factCount}
        factsTotal={view.factsTotal}
      />

      {/* Tabs — сегментированный контрол (.seg) из брендбука */}
      <div className="seg seg-scroll w-full overflow-x-auto" role="tablist" aria-label="Вкладки похода">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={(e) => {
              setActiveTab(tab.id);
              // Ревизия скриншотов 29.10: активная вкладка центрируется в
              // scroll-контейнере, вместо того чтобы торчать обрезанной у края.
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
            className={`seg-btn flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — подзадача 26: вкладки-компоненты (данные из deriveTripView) */}
      {activeTab === 'menu' && (
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

      {activeTab === 'shopping' && (
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

      {activeTab === 'dayShopping' && (
        <TripDayShoppingTab
          dayShopping={view.dayShopping}
          manualItems={d.manualItems}
          priceOf={view.manualPriceOf}
          excluded={d.shoppingExcluded}
          onToggleExcluded={d.toggleShoppingExcluded}
        />
      )}

      {activeTab === 'person' && (
        <TripPersonTab
          trip={trip}
          realPeople={view.realPeople}
          tripSummary={view.tripSummary}
          personSummary={view.personSummary}
        />
      )}

      {activeTab === 'overrides' && (
        <PriceOverridesTab tripId={trip.id} />
      )}

      {/* U38: «Чеклист» — что брать в магазине: ЦЕЛЫЕ упаковки (округление вверх),
          группы по категориям, алфавит. Исключённые позиции не попадают (их не берём).
          Подзадача 6 (plans/done/2026-10-29-ui-nowrap-and-mobile.md): вкладка вынесена в
          ChecklistTab.tsx (R8/R9) — страница отдаёт данные и колбэки, компонент
          владеет только мобильным UI чеклиста (фильтр, сворачивание групп, прогресс)
          и подтверждением массовых действий (подзадача 7). */}
      {activeTab === 'checklist' && (
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
