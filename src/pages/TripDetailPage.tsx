/**
 * Страница похода: 4 этапа воркфлоу «Меню → Проверка → Магазин → Чеки и итог»
 * (plan plans/2026-10-30-mobile-workflow-ux.md, подзадачи 2/3).
 *
 * Подзадача 26 аудита (2026-10-29, R8/R9): страница декомпозирована —
 * - состояние, загрузка и мутации — хук `useTripDetail` (единственный владелец
 *   state, компоненты им не владеют — «нет дублирования state»);
 * - производные view-модели (меню, закупка, дни, «на человека», чеклист,
 *   готовность) — чистый модуль `utils/tripDerived.ts`;
 * - презентация — компоненты `TripActions` (шапка), `TripSummaryPanel`
 *   (KPI + готовность), `TripDaysList`/`TripMealCard` (меню),
 *   `TripShoppingTab`, `TripDayShoppingTab`, `ExclusionCheckbox`;
 * - здесь остались только layout, переключатель этапов и модалки.
 *
 * Мобильный воркфлоу (30.10.2026): прежние 6 равноправных вкладок стали
 * 4 этапами; «По дням» — вид списка внутри этапа ② «Проверка» (локальный
 * state `shopView`; вид «На человека» вырезан — bugs-trip-shopping-stage п.5);
 * этап живёт в URL (?stage=);
 * на мобильном навигация — нижний таб-бар + степпер (`StageTabBar`).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageLoader from '../components/PageLoader';
import ChecklistTab from '../components/ChecklistTab'; // подзадача 6: вкладка «Чеклист» вынесена из страницы (R8)
import PriceOverridesTab from '../components/PriceOverridesTab';
import AddMealModal from '../components/AddMealModal';
import MealCompositionModal from '../components/MealCompositionModal';
import ManualItemsModal from '../components/ManualItemsModal';
import TripActions from '../components/TripActions';
// design-п.5: растровый арт под стеклом шапки (утверждён 03.11.2026; после
// отката фото-обложек SVG-заглушки под blur не читались — владелец: «пропала»)
import headerArt from '../assets/atmosphere/camp-ready.webp';
import TripSummaryPanel from '../components/TripSummaryPanel';
import TripDaysList from '../components/TripDaysList';
import TripShoppingTab from '../components/TripShoppingTab';
import TripDayShoppingTab from '../components/TripDayShoppingTab';
import StageTabBar, { type StageId } from '../components/StageTabBar';
import TripReportView from '../components/TripReportView'; // redesign п.5: отчёт этапом ⑤
import { StageNextCta } from '../components/StageNextCta';
import { RecipeViewSheet } from '../components/RecipeViewSheet';
import { ConflictDialog } from '../components/ConflictDialog'; // BL-41: 409 «данные изменились»
import { globalCatalogRecipeId } from '../utils/recipeRef'; // navigation-п.2: CTA «Далее»
import { Button } from '../components/Button';
import { manualForDay, manualForTrip } from '../utils/manualItems'; // U40
import type { ShoppingView } from '../types/tripDetail'; // TabType убран вместе с seg-дублем (redesign п.6)

import { useTripDetail } from './useTripDetail';

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
    // navigation-п.4: у ошибки загрузки ОБЯЗАНА быть рабочая «Повторить»
    // (баг: мёртвая кнопка в error-state этапа ④ — PriceOverridesTab.tsx:446
    // до cleanup-п.5) и путь назад к списку походов.
    return (
      <div className="text-center py-12">
        <p style={{ color: 'var(--fire)' }}>{error || 'Поход не найден'}</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="primary" onClick={() => void d.loadData()} data-testid="trip-error-retry">Повторить</Button>
          <Button variant="ghost" onClick={() => navigate('/trips')}>← Назад к походам</Button>
        </div>
      </div>
    );
  }

  const stage = activeTab as StageId;
  // Статусы этапов — из единой готовности (utils/readiness): дублей нет
  // transparency-п.1: readiness-шаг «shopping» переименован в `store` (семантика
  // «взято N из M» = этап ③ Магазин) — маппинг выпрямлен, без перекрёстных имён.
  const done: Record<StageId, boolean> = {
    menu: view.readiness.menu === 'done',
    shopping: view.checklistRowIds.length > 0,
    store: view.readiness.store === 'done',
    checks: view.readiness.checks === 'done',
    ready: view.readiness.ready, // redesign п.5
  };


  // bugs-trip-shopping-stage п.5: вид «На человека» вырезан (владелец: больше не нужен)
  const shopViews: { id: ShoppingView; label: string }[] = [
    { id: 'total', label: 'На поход' },
    { id: 'days', label: 'По дням' },
  ];

  return (
    <div className="space-y-4 md:space-y-6 stage-page">
      {/* design-п.5 «стекло поверх арта» (tasks/design-atmosphere-art.md):
          TripActions + сводка — ОДНА glass-карточка с арт-слоем обложки похода
          (redesign п.6: десктопные сегменты из карточки удалены). На mobile
          обёртка уходит в display:contents (CSS), чтобы sticky .trip-strip
          не терял липкость. */}
      <div className="trip-header-glass" data-testid="trip-header-glass">
      <div className="trip-header-glass__art" aria-hidden style={{ backgroundImage: `url(${headerArt})` }} />
      <div className="trip-header-glass__in space-y-4 md:space-y-6">
      {/* Header — подзадача 26: TripActions (+ kebab с отчётом, подзадача 7) */}
      <TripActions trip={trip} />

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
        onStage={(s) => { setActiveTab(s); }}
        onOpenReport={() => setActiveTab('ready')} // redesign п.5/п.6: отчёт — этап ⑤
      />
      </div>
      </div>
      {/* redesign п.6: десктопный .seg-дубль этапов удалён — этапы переключаются
          чипами сводки (desktop) и нижним таб-баром (mobile); ⑤ доступен обоими */}
      {/* Единственная мобильная навигация этапов — нижний таб-бар (5 этапов) */}
      <StageTabBar stage={stage} onStage={setActiveTab} done={done} />

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
          onViewRecipe={(recipeId) => d.setViewRecipeId(recipeId)}
          onDeleteMeal={(dayId, mealId, mealName, dayDate) => void d.handleDeleteMeal(dayId, mealId, mealName, dayDate)}
          onDeleteManual={(itemId, itemName) => void d.handleDeleteManual(itemId, itemName)}
          onAddTripProduct={() => d.setManualCtx({ dayId: null })}
        />
      )}

      {/* Этап ②: закупка — три вида одного списка (подзадача 3) */}
      {stage === 'shopping' && (
        <div className="space-y-3">
          <div className="seg seg--subtle seg-scroll max-w-full overflow-x-auto" role="tablist" aria-label="Вид списка закупки">
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
              excluded={d.shoppingExcluded}
              onToggleExcluded={d.toggleShoppingExcluded}
              onGoToMenu={() => setActiveTab('menu')}
            />
          )}
          {shopView === 'days' && (
            <TripDayShoppingTab
              dayShopping={view.dayShopping}
              manualItems={d.manualItems}
              priceOf={view.manualPriceOf}
              excluded={d.shoppingExcluded}
              onToggleExcluded={d.toggleShoppingExcluded}
              onGoToMenu={() => setActiveTab('menu')}
            />
          )}
        </div>
      )}

      {/* Этап ④: чеки и итог — данные и view-модели из общего пайплайна
          страницы (cleanup-п.5): переход на этап НЕ делает сетевых запросов,
          суммы ② и ④ идентичны по построению */}
      {stage === 'checks' && (
        <PriceOverridesTab
          trip={trip}
          view={view}
          draftOverrides={d.draftOverrides}
          excluded={d.shoppingExcluded}
          boughtSet={d.checklistBought}
          actualQty={d.actualQty}
          onCommitActualTotal={d.commitCheckTotal}
          onToggleExcluded={d.toggleShoppingExcluded}
          onToggleBought={d.toggleBought}
          onCommitTook={d.commitActualQty}
          onGoToShopping={() => setActiveTab('shopping')}
          onGoToStore={() => setActiveTab('store')}
        />
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
          onGoToMenu={() => setActiveTab('menu')}
        />
      )}

      {/* redesign п.5: этап ⑤ «Поход готов» — отчёт ВНУТРИ воркфлоу (R8: TripReportView);
          оформление утверждено 03.11.2026: арт camp-ready.webp под вуалью .66→.88 + blur 3px */}
      {stage === 'ready' && (
        <div className="stage-ready" data-testid="stage-ready-wrap">
          <div className="stage-ready__art" aria-hidden style={{ backgroundImage: `url(${headerArt})` }} />
          <div className="stage-ready__veil" aria-hidden />
          <div className="stage-ready__in">
            <TripReportView trip={trip} view={view} />
          </div>
        </div>
      )}

      {/* navigation-п.2: явный CTA «Далее» в конце каждого этапа — следующий шаг
          одним кликом; на незаполненном этапе — подсказка, чего не хватает */}
      <div className="stage-next-wrap">
        {/* redesign п.4: CTA ① до утверждения — кнопка «Утвердить меню» (мутация) */}
        <StageNextCta tripId={String(trip.id)} stage={stage} done={done} onStage={setActiveTab}
                      onApproveMenu={d.approveMenu} />
      </div>

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
          initialRecipeId={d.addMealCtx.recipeId}
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
          onSaved={() => { d.reloadInBackground(); }}
          onEditCatalogRecipe={(recipeId) => {
            // Fix-2 (п.7) + navigation-п.5: резолв снепшота в глобальный каталог —
            // общая утилита recipeRef (иначе /recipes?edit= не находит блюдо).
            navigate(`/recipes?edit=${globalCatalogRecipeId(recipeId, d.tripRecipes)}`);
          }}
        />
      )}

      {/* navigation-п.5: sheet read-only просмотра блюда из меню — данные снепшота
          (состав на людей приёма + ккал) и выход в каталог /recipes?view=<globalId>;
          удалённое из каталога блюдо — нота вместо битой ссылки */}
      {d.viewRecipeId && (() => {
        const recipe = d.recipesMap.get(String(d.viewRecipeId));
        if (!recipe) return null;
        const mealRow = view.menuByDays
          .flatMap(day => day.meals)
          .find(m => String(m.recipeId) === String(d.viewRecipeId));
        const globalId = globalCatalogRecipeId(d.viewRecipeId, d.tripRecipes);
        const inCatalog = d.recipes.some(r => String(r.id) === globalId);
        const ingredients = mealRow
          ? mealRow.ingredients.map(i => ({ name: i.name, amount: i.amount, unit: i.unit }))
          : (recipe.ingredients ?? []).map((ri: any) => ({
              name: ri.ingredient?.name ?? 'Неизвестный',
              amount: Number(ri.amount),
              unit: ri.ingredient?.unit ?? 'PCS',
            }));
        return (
          <RecipeViewSheet
            recipe={recipe}
            servings={mealRow?.servings ?? null}
            ingredients={ingredients}
            catalogRecipeId={inCatalog ? globalId : null}
            onClose={() => d.setViewRecipeId(null)}
            onOpenInCatalog={inCatalog ? () => navigate(`/recipes?view=${globalId}`) : undefined}
          />
        );
      })()}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {d.confirmDialog}

      {/* BL-41 (AU-13): конфликт оптимистичной блокировки — диалог «данные изменились»
          с повторной загрузкой. Слушает сигнал из api/client, поэтому срабатывает
          на любой мутации похода, не только на этой вкладке. */}
      <ConflictDialog onReload={d.reloadAfterConflict} />

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
