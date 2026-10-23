import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Mountain, Calendar, Users, Trash2, Edit2 } from 'lucide-react';
import { useToast } from '../components/ToastProvider';
import { TripForm, type TripFormData } from '../components/TripForm';
import { api } from '../api/client';
import { getTripCover } from '../utils/getTripCover';

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
  const [showCreate, setShowCreate] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
  };

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

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить поход?')) return;
    
    try {
      await api.del(`/trips/${id}`);
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
          <p className="mt-1" style={{ color: 'var(--muted)' }}>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Походы</h1>
          <p className="mt-1" style={{ color: 'var(--fire)' }}>{error}</p>
          <button onClick={loadData} className="ghost-btn mt-4">Повторить</button>
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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-all"
          style={{ background: 'var(--grad-brand)', color: '#221204', boxShadow: '0 0 0 1px rgba(255,158,44,.3), 0 16px 44px rgba(242,122,18,.28)' }}
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Новый поход</span>
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <TripForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Trips list */}
      {myTrips.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Mountain size={48} className="mx-auto mb-4" style={{ color: 'var(--muted)' }} />
          <p className="mb-4" style={{ color: 'var(--muted)' }}>У вас пока нет походов</p>
          <button
            onClick={() => setShowCreate(true)}
            className="grad-btn"
          >
            Создать первый поход
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {myTrips.map(trip => (
            <div
              key={trip.id}
              className="glass lift p-5 relative overflow-hidden"
              style={{
                backgroundImage: `linear-gradient(rgba(11, 20, 27, 0.82), rgba(13, 23, 32, 0.88)), url(${getTripCover(trip.name)})`,
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
                      {trip.days?.length || 0} дней
                    </span>
                  </div>
                  {trip.notes && <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{trip.notes}</p>}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/trips/${trip.id}`)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--w1)';
                      e.currentTarget.style.background = 'rgba(87, 199, 184, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--muted)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trip.id)}
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--muted)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#FFB4A2';
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
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
    </div>
  );
}
