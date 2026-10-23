import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../components/ToastProvider';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

interface Trip {
  id: string;
  userId: string;
  name: string;
  startDate: string;
  endDate: string;
  defaultPeople: number;
  days?: any[];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, tripsData] = await Promise.all([
        api.get<User>('/auth/me'),
        api.get<Trip[]>('/trips')
      ]);
      setCurrentUser(user);
      setTrips(tripsData);
    } catch (error) {
      console.error('Failed to load ', error);
      // ЗАДАЧА 3: раньше ошибка только писалась в консоль — пользователь видел
      // пустой дашборд без объяснения.
      setTrips([]);
      showError('Не удалось загрузить данные дашборда');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--muted)' }}>Загрузка...</div>;
  }

  const myTrips = trips.filter(t => t.userId === currentUser?.id);
  
  // Упрощённая статистика без расчёта стоимости (пока нет API для summaries)
  const totalPeople = myTrips.reduce((acc, t) => acc + t.defaultPeople, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Мои походы</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Добро пожаловать, {currentUser?.firstName}!</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Активных походов</span>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{myTrips.length}</p>
          <div className="h-6 mt-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(45, 212, 191, 0.25))', clipPath: 'polygon(0 80%, 15% 60%, 30% 70%, 45% 40%, 60% 55%, 75% 25%, 100% 45%, 100% 100%, 0 100%)' }}></div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Всего людей</span>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{totalPeople}</p>
          <div className="h-6 mt-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.25))', clipPath: 'polygon(0 70%, 20% 50%, 40% 60%, 60% 30%, 80% 45%, 100% 35%, 100% 100%, 0 100%)' }}></div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>Всего дней</span>
          <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{myTrips.reduce((acc, t) => acc + (t.days?.length || 0), 0)}</p>
          <div className="h-6 mt-2" style={{ background: 'linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.25))', clipPath: 'polygon(0 60%, 25% 45%, 50% 55%, 75% 35%, 100% 50%, 100% 100%, 0 100%)' }}></div>
        </div>
      </div>

      {/* Trips */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Ваши походы</h2>
          <button
            onClick={() => navigate('/trips')}
            className="text-sm font-medium"
            style={{ color: 'var(--w1)' }}
          >
            Все походы →
          </button>
        </div>

        {myTrips.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <svg width="48" height="48" viewBox="0 0 96 96" className="mx-auto mb-4 opacity-30">
              <path d="M48 18 L70 70 H26 Z" fill="var(--muted)"/>
            </svg>
            <p className="mb-4" style={{ color: 'var(--muted)' }}>У вас пока нет походов</p>
            <button
              onClick={() => navigate('/trips')}
              className="grad-btn"
            >
              Создать поход
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTrips.map((trip: Trip) => {
              const totalDays = trip.days?.length || 0;
              const totalMeals = trip.days?.reduce((acc: number, d: any) => acc + (d.meals?.length || 0), 0) || 0;
              const completion = Math.min(100, Math.round((totalMeals) / (totalDays * 3) * 100));
              return (
                <div
                  key={trip.id}
                  onClick={() => navigate(`/trips/${trip.id}`)}
                  className="rounded-2xl p-5 cursor-pointer transition-all hover:scale-[1.02]"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <div className="h-24 rounded-xl mb-3" style={{
                    background: trip.id === 'trip1' 
                      ? 'radial-gradient(90px 40px at 70% 85%, rgba(245, 158, 11, 0.5), transparent), linear-gradient(180deg, #2B4A6F, #0B1626)'
                      : trip.id === 'trip2'
                      ? 'linear-gradient(180deg, #33465e, #101c2b 70%)'
                      : 'radial-gradient(60px 26px at 50% 80%, rgba(245, 158, 11, 0.55), transparent), linear-gradient(180deg, #1d3326, #0c1512)'
                  }}></div>
                  <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>{trip.name}</h3>
                  <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    {new Date(trip.startDate).toLocaleDateString('ru-RU')} — {new Date(trip.endDate).toLocaleDateString('ru-RU')}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                      {trip.defaultPeople} чел
                    </span>
                    <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#9BD8F5' }}>
                      {totalDays} дн
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>Меню {completion}%</span>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
                      background: `conic-gradient(var(--w1) 0 ${completion}%, rgba(255,255,255,0.1) 0)`,
                    }}>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                        {completion === 100 ? '✓' : completion}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
