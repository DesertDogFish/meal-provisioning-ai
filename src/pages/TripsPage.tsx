import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mountain, Calendar, Users, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { TripForm, type TripFormData } from '../components/TripForm';
import { useConfirm } from '../components/ConfirmDialog'; // Fix-6 (п.7): красивые подтверждения
import { api } from '../api/client';
import { getTripCover } from '../utils/getTripCover';
import { pluralize } from '../utils/pluralize'; // ревизия скриншотов 29.10: «4 дней» → «4 дня»
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Походы</h1>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Управление вашими походами и запасами</p>
        </div>
        {/* Fix-7 (п.5): иконочная кнопка создания — единый паттерн всех шапок */}
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
          {myTrips.map(trip => (
            <div
              key={trip.id}
              className="glass lift p-5 relative overflow-hidden"
              style={{
                /* Fix-6 (п.6): «на походах должна быть красивая графика, а её нет» —
                   обложки были, но задавлены градиентом 82–88%. Осветляем подложку
                   (35%→70%): рисунок (море/горы/лес/кемпинг) теперь виден фоном,
                   текст остаётся читаемым. */
                backgroundImage: `linear-gradient(105deg, color-mix(in srgb, var(--bg-0) 70%, transparent) 0%, color-mix(in srgb, var(--bg-0) 35%, transparent) 55%, color-mix(in srgb, var(--bg-0) 55%, transparent) 100%), url(${getTripCover(trip.name)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className="flex items-center justify-between">
                <div data-testid={`trip-card-${trip.id}`} className="flex-1 cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
                  <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{trip.name}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm" style={{ color: 'var(--muted)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={14} />
                      {trip.defaultPeople} чел.
                    </span>
                    <span className="flex items-center gap-1">
                      <Mountain size={14} />
                      {pluralize(trip.days?.length || 0, ['день', 'дня', 'дней'])}
                    </span>
                  </div>
                  {trip.notes && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{trip.notes}</p>}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => setEditingTrip(trip)}
                    aria-label={`Редактировать поход: ${trip.name}`}
                    title="Редактировать название, описание, даты"
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--w1)';
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--wave-400) 10%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--muted)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trip)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--danger)';
                      e.currentTarget.style.background = 'color-mix(in srgb, var(--danger) 10%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--muted)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fix-6 (п.7): брендовый диалог подтверждений */}
      {confirmDialog}
    </div>
  );
}
