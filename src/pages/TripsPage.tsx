import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mountain, Calendar, Users, Trash2, Edit2, Check } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { TripForm, type TripFormData } from '../components/TripForm';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7): красивые подтверждения
import { KebabMenu } from '../components/KebabMenu';
import { api, getRecipes } from '../api/client';
import { getTripRecipes } from '../api/client';
import { getManualItems, type TripManualItem } from '../api/tripManualItems';
import { getTripEdits, type TripIngredientEdit } from '../api/tripEdits';
import { loadActualPrices, loadExcluded, loadBought } from '../utils/tripStaging';
import { deriveTripView } from '../utils/tripDerived';
import { STAGES, type StageId } from '../components/StageTabBar';
import { getTripCover } from '../utils/getTripCover';
import { pluralize } from '../utils/pluralize'; // ревизия скриншотов 29.10: «4 дней» → «4 дня»
import { formatRub } from '../utils/format';
import { Button } from '../components/Button';

import PageLoader from '../components/PageLoader';
interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  notes?: string;
  days?: any[];
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 4): карточка похода
 * в списке — ЦЕЛИКОМ тап (открывает поход на текущем этапе), правка и удаление —
 * в kebab-меню (случайное удаление исключено); на карточке — строка прогресса
 * «этап · взято N/M · сумма» из единой готовности (utils/readiness через
 * deriveTripView — те же цифры, что на странице похода, дублей расчёта нет).
 */
interface TripProgress {
  stage: StageId;
  ready: boolean;
  /** числитель прогресса этапа (взято / приёмы / чеки) */
  done: number;
  /** знаменатель прогресса этапа */
  total: number;
  totalCost: number;
  costPerPerson: number;
  meals: number;
  bought: number;
  checklistTotal: number;
  facts: number;
}

function stageOf(p: TripProgress): { label: string; num: number } {
  const meta = STAGES.find(s => s.id === p.stage)!;
  return { label: meta.label, num: meta.num };
}

export default function TripsPage() {
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showCreate, setShowCreate] = useState(false);
  // U36 (список 26.10): карандаш открывает редактирование похода (имя/описание/даты/люди)
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // подзадача 4: прогресс этапа по каждой карточке (best effort, без блокировки списка)
  const [progress, setProgress] = useState<Record<string, TripProgress>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [user, tripsData] = await Promise.all([
        api.get<User>('/auth/me'),
        api.get<Trip[]>('/trips')
      ]);
      setCurrentUser(user);
      setTrips(tripsData);
    } catch (err: any) {
      console.error('Failed to load trips:', err);
      // ЗАДАЧА 3: тост + сброс устаревшего списка
      setTrips([]);
      setError('Не удалось загрузить данные');
      showError(err?.detail || 'Не удалось загрузить список походов');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Прогресс карточек: deriveTripView по каждому походу (чистая функция — те же
  // view-модели, что на странице похода). Ошибка расчёта прогресса НЕ роняет
  // список: карточка остаётся без строки этапа.
  useEffect(() => {
    let cancelled = false;
    if (trips.length === 0) {
      setProgress({});
      return;
    }
    (async () => {
      const recipes = await getRecipes().catch(() => [] as any[]);
      const next: Record<string, TripProgress> = {};
      await Promise.all(trips.map(async (trip) => {
        try {
          const [tripRecipes, prices, manualItems, tripEdits] = await Promise.all([
            getTripRecipes(trip.id).catch(() => [] as any[]),
            api.get<any[]>(`/trips/${trip.id}/prices`).catch(() => [] as any[]),
            getManualItems(trip.id).catch(() => [] as TripManualItem[]),
            getTripEdits(trip.id).catch(() => [] as TripIngredientEdit[]),
          ]);
          const recipesMap = new Map<string, any>([...recipes, ...tripRecipes].map((r: any) => [String(r.id), r]));
          const checklistBought = loadBought(trip.id);
          const view = deriveTripView({
            trip: trip as any,
            recipes: recipes as any,
            tripRecipes: tripRecipes as any,
            recipesMap: recipesMap as any,
            tripEdits,
            prices: prices as any,
            manualItems,
            products: [],
            draftOverrides: loadActualPrices(trip.id),
            shoppingExcluded: loadExcluded(trip.id),
            checklistBought,
            sortSpec: { field: 'ingredientName', dir: 'asc' },
          });
          const meals = trip.days?.reduce((a: number, d: any) => a + (d.meals?.length || 0), 0) || 0;
          const checklistTotal = view.checklistRowIds.length;
          const bought = view.boughtInList;
          const facts = view.factCount;
          const daysCount = trip.days?.length || 0;
          let stage: StageId;
          let done = 0;
          let total = 0;
          if (view.readiness.checks !== 'none' || facts > 0) {
            stage = 'checks'; done = facts; total = view.factsTotal;
          } else if (bought > 0) {
            stage = 'store'; done = bought; total = checklistTotal;
          } else if (checklistTotal > 0) {
            stage = 'shopping'; done = 0; total = checklistTotal;
          } else {
            stage = 'menu'; done = meals; total = daysCount * 3;
          }
          next[trip.id] = {
            stage,
            ready: view.readiness.ready,
            done, total,
            totalCost: view.tripSummary.totalCost,
            costPerPerson: view.tripSummary.costPerDefaultPerson,
            meals,
            bought,
            checklistTotal,
            facts,
          };
        } catch {
          /* прогресс — best effort */
        }
      }));
      if (!cancelled) setProgress(next);
    })();
    return () => { cancelled = true; };
  }, [trips]);

  // FIX: TripResponse бэкенда (/api/v1/trips) уже отфильтрован по текущему
  // пользователю и НЕ содержит поля userId — из-за строгого сравнения
  // undefined !== id список всегда оказывался пустым. Фильтруем только
  // когда userId реально присутствует в ответе (mock-режим).
  const myTrips = trips.some(t => t.userId != null)
    ? trips.filter(t => String(t.userId) === String(currentUser?.id))
    : trips;

  const handleCreate = async (formData: TripFormData) => {
    try {
      await api.post('/trips', {
        name: formData.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        defaultPeople: formData.defaultPeople,
        notes: formData.notes || undefined
      });
      setShowCreate(false);
      showSuccess('Поход успешно создан');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка создания похода');
    }
  };

  /** U36: сохранение правок похода. Смена дат стирает план по дням — спрашиваем
   * подтверждение с перечислением того, что будет потеряно (и всё равно даём
   * возможность удалить эти данные — «что поделать»). */
  const handleUpdate = async (formData: TripFormData) => {
    const trip = editingTrip;
    if (!trip) return;
    const datesChanged =
      formData.startDate !== trip.startDate || formData.endDate !== trip.endDate;
    if (datesChanged) {
      // Fix-2 (п.1) + Fix-6 (п.7): стираются данные ТОЛЬКО дней, уходящих за новые
      // границы; предупреждение — брендовым диалогом с перечнем потерь.
      const lostDays = (trip.days ?? []).filter(
        (d: any) => d.dayDate < formData.startDate || d.dayDate > formData.endDate);
      const lostMeals = lostDays.reduce((acc: number, d: any) => acc + (d.meals?.length ?? 0), 0);
      if (lostDays.length > 0) {
        const ok = await confirm({
          title: 'Даты меняются — часть плана будет стёрта',
          tone: 'warning',
          confirmLabel: 'Да, изменить даты',
          message: (
            <>
              Из похода уйдут {lostDays.length} дн. ({lostDays.map((d: any) =>
                new Date(d.dayDate).toLocaleDateString('ru-RU')).join(', ')}).
              {lostMeals > 0 && <> Вместе с ними удалятся <b>{lostMeals} приёмов пищи</b>, их правки состава и позиции этих дней.</>}
              <br />Остальные дни сохранятся без изменений.
            </>
          ),
        });
        if (!ok) return;
      }
    }
    try {
      await api.put(`/trips/${trip.id}`, {
        name: formData.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        defaultPeople: formData.defaultPeople,
        notes: formData.notes || undefined,
      });
      setEditingTrip(null);
      showSuccess('Поход обновлён');
      await loadData();
    } catch (err: any) {
      showError(err?.detail || err?.error?.detail || 'Не удалось обновить поход');
    }
  };

  const handleDelete = async (trip: Trip) => {
    // Fix-6 (п.7): важное удаление — красивое предупреждение с последствиями
    const daysCount = trip.days?.length ?? 0;
    const mealsCount = (trip.days ?? []).reduce((acc: number, d: any) => acc + (d.meals?.length ?? 0), 0);
    const ok = await confirm({
      title: `Удалить поход «${trip.name}»?`,
      confirmLabel: 'Удалить поход',
      message: (
        <>
          Поход будет удалён безвозвратно вместе со всем содержимым:
          {daysCount > 0 && <> {daysCount} дн., <b>{mealsCount} приёмов пищи</b>,</>} правки состава,
          чеки, ручные позиции и отметки чеклиста.
        </>
      ),
    });
    if (!ok) return;
    try {
      await api.del(`/trips/${trip.id}`);
      showSuccess('Поход удалён');
      await loadData();
    } catch (err: any) {
      showError(err.detail || 'Ошибка удаления похода');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Походы</h1>
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
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Походы</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <Button variant="ghost" onClick={loadData} className="mt-4">Повторить</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Походы</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Управление вашими походами и запасами</p>
        </div>
        {/* Fix-7 (п.5): иконочная кнопка создания — единый паттерн всех шапок.
            Подзадача 4: текстовый блок шапки с min-w-0 — FAB не перекрывает подзаголовок. */}
        <Button variant="primary" iconOnly onClick={() => setShowCreate(true)}
                aria-label="Создать поход" title="Создать поход" icon={<Plus size={18} />} />
      </div>

      {/* Create modal */}
      {showCreate && (
        <TripForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* U36: Edit modal — имя, описание, даты и люди; смена дат — через предупреждение */}
      {editingTrip && (
        <TripForm
          title="Редактирование похода"
          submitLabel="Сохранить"
          initial={{
            name: editingTrip.name,
            startDate: editingTrip.startDate,
            endDate: editingTrip.endDate,
            defaultPeople: editingTrip.defaultPeople,
            notes: editingTrip.notes ?? '',
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditingTrip(null)}
        />
      )}

      {/* Trips list */}
      {myTrips.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Mountain size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p className="mb-4" style={{ color: 'var(--muted)' }}>У вас пока нет походов</p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            Создать первый поход
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {myTrips.map(trip => {
            const p = progress[trip.id];
            const stageLabel = p ? stageOf(p) : null;
            const daysCount = trip.days?.length || 0;
            return (
              <div key={trip.id} className="trip-card glass lift"
                   style={{
                     /* Fix-6 (п.6): «на походах должна быть красивая графика, а её нет» —
                        обложки были, но задавлены градиентом 82–88%. Осветляем подложку
                        (35%→70%): рисунок (море/горы/лес/кемпинг) теперь виден фоном,
                        текст остаётся читаемым. Подзадача 4 (30.10.2026): на мобильном
                        градиент гасится (.trip-card background-image:none), а обложка
                        лежит слоем .trip-card__cover с opacity .45 — рисунок виден. */
                     backgroundImage: `linear-gradient(105deg, color-mix(in srgb, var(--bg-0) 70%, transparent) 0%, color-mix(in srgb, var(--bg-0) 35%, transparent) 55%, color-mix(in srgb, var(--bg-0) 55%, transparent) 100%), url(${getTripCover(trip.name)})`,
                     backgroundSize: 'cover',
                     backgroundPosition: 'center',
                   }}>
                <div className="trip-card__cover" style={{ backgroundImage: `url(${getTripCover(trip.name)})` }} aria-hidden />
                <div className="trip-card__kebab">
                  <KebabMenu
                    label={`Действия с походом: ${trip.name}`}
                    testId={`trip-card-kebab-${trip.id}`}
                    items={[
                      {
                        id: 'edit',
                        label: 'Редактировать',
                        icon: <Edit2 size={16} aria-hidden />,
                        testId: `trip-edit-${trip.id}`,
                        onSelect: () => setEditingTrip(trip),
                      },
                      {
                        id: 'delete',
                        label: 'Удалить',
                        icon: <Trash2 size={16} aria-hidden />,
                        danger: true,
                        testId: `trip-delete-${trip.id}`,
                        onSelect: () => { void handleDelete(trip); },
                      },
                    ]}
                  />
                </div>
                {/* Подзадача 4: ВСЯ карточка — тап: открывает поход на текущем этапе */}
                <button
                  type="button"
                  className="block w-full text-left"
                  data-testid={`trip-card-${trip.id}`}
                  aria-label={`Открыть поход: ${trip.name}${p ? ` — этап ${stageLabel?.num} ${stageLabel?.label}` : ''}`}
                  onClick={() => navigate(`/trips/${trip.id}${p ? `?stage=${p.stage}` : ''}`)}
                >
                  <h3 className="font-bold text-lg pr-8" style={{ color: 'var(--text)' }}>{trip.name}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1 keep-pair">
                      <Calendar size={14} />
                      {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')}
                    </span>
                    <span className="flex items-center gap-1 keep-pair">
                      <Users size={14} />
                      {trip.defaultPeople} чел.
                    </span>
                    {/* подзадача 4: число ОБЯЗАНО рендериться (баг «дня» без числа
                        был виден и на десктопе) */}
                    <span className="flex items-center gap-1 keep-pair">
                      <Mountain size={14} />
                      {daysCount} {pluralize(daysCount, ['день', 'дня', 'дней'])}
                    </span>
                  </div>
                  {trip.notes && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{trip.notes}</p>}
                  {p && (
                    <>
                      <div className="trip-card__progress" data-testid={`trip-progress-${trip.id}`}>
                        <span className="keep-pair" style={{ color: p.ready ? 'var(--success)' : 'var(--w1)' }}>
                          {p.ready ? <Check size={14} aria-hidden /> : <span aria-hidden>{stageLabel?.num}</span>}
                          {p.ready ? 'Готов' : stageLabel?.label}
                        </span>
                        <span className="trip-card__bar" aria-hidden>
                          <span className={p.stage === 'menu' ? 'stage-menu' : undefined}
                                style={{ width: `${p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0}%` }} />
                        </span>
                        <span className="keep-num" style={{ color: 'var(--text-2)' }}>
                          {p.stage === 'store' ? `${p.bought}/${p.checklistTotal}`
                            : p.stage === 'checks' ? `${p.facts}/${p.total}`
                            : p.stage === 'shopping' ? `${p.checklistTotal} поз.`
                            : `${p.done}/${p.total}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2">
                        <b className="keep-num text-lg" style={{ color: 'var(--amber-300)' }}>{formatRub(p.totalCost)}</b>
                        <span className="keep-num text-sm" style={{ color: 'var(--muted)' }}>
                          {formatRub(p.costPerPerson)}/чел · {p.meals} {pluralize(p.meals, ['приём', 'приёма', 'приёмов'])}
                        </span>
                      </div>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {confirmDialog}
    </div>
  );
}
