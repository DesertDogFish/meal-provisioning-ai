import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, generateId } from '../store/AppContext';
import { Plus, Mountain, Calendar, Users, Trash2, Edit2 } from 'lucide-react';
import { validateTrip } from '../utils/validation';
import { ValidationError } from '../utils/errors';
import { useToast } from '../components/ToastProvider';
import { DateRange } from '../components/DateRange';

export default function TripsPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newTrip, setNewTrip] = useState({ name: '', startDate: '', endDate: '', defaultPeople: 4, notes: '' });
  const [formErrors, setFormErrors] = useState<{ field: string; message: string }[]>([]);

  const myTrips = state.trips.filter(t => t.userId === state.currentUser?.id);

  const handleCreate = () => {
    // Validate trip data
    const errors = validateTrip(newTrip);
    if (errors.length > 0) {
      setFormErrors(errors);
      const validationError = new ValidationError(errors, 'Не удалось создать поход');
      showError(validationError.toProblemDetail());
      return;
    }
    setFormErrors([]);
    
    const trip = {
      id: generateId(),
      userId: state.currentUser!.id,
      name: newTrip.name,
      startDate: newTrip.startDate,
      endDate: newTrip.endDate,
      defaultPeople: newTrip.defaultPeople,
      notes: newTrip.notes || undefined,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_TRIP', payload: trip });
    setShowCreate(false);
    setNewTrip({ name: '', startDate: '', endDate: '', defaultPeople: 4, notes: '' });
    showSuccess('Поход успешно создан');
  };

  const handleDelete = (id: string) => {
    if (confirm('Удалить поход?')) {
      dispatch({ type: 'DELETE_TRIP', payload: id });
    }
  };

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
          style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Новый поход</span>
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl shadow-xl w-full max-w-md p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Новый поход</h2>
            
            {formErrors.length > 0 && (
              <div className="mb-4 space-y-1">
                {formErrors.map((err, idx) => (
                  <p key={idx} className="text-sm" style={{ color: '#FCA5A5' }}>
                    <span className="font-medium">{err.field}:</span> {err.message}
                  </p>
                ))}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Название</label>
                <input
                  type="text"
                  value={newTrip.name}
                  onChange={e => { setNewTrip({ ...newTrip, name: e.target.value }); setFormErrors([]); }}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ 
                    background: 'var(--elev)', 
                    border: formErrors.find(e => e.field === 'name') ? '1px solid #FCA5A5' : '1px solid var(--border)',
                    color: 'var(--text)'
                  }}
                  placeholder="Поход на Алтай"
                />
              </div>
              <DateRange
                startDate={newTrip.startDate}
                endDate={newTrip.endDate}
                onStartDateChange={date => { setNewTrip({ ...newTrip, startDate: date }); setFormErrors([]); }}
                onEndDateChange={date => { setNewTrip({ ...newTrip, endDate: date }); setFormErrors([]); }}
                startLabel="Дата начала"
                endLabel="Дата окончания"
              />
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Количество человек</label>
                <input
                  type="number"
                  min={1}
                  value={newTrip.defaultPeople}
                  onChange={e => { setNewTrip({ ...newTrip, defaultPeople: parseInt(e.target.value) || 1 }); setFormErrors([]); }}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ 
                    background: 'var(--elev)', 
                    border: formErrors.find(e => e.field === 'defaultPeople') ? '1px solid #FCA5A5' : '1px solid var(--border)',
                    color: 'var(--text)'
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Заметки</label>
                <textarea
                  value={newTrip.notes}
                  onChange={e => setNewTrip({ ...newTrip, notes: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg outline-none"
                  style={{ 
                    background: 'var(--elev)', 
                    border: '1px solid var(--border)',
                    color: 'var(--text)'
                  }}
                  rows={2}
                  placeholder="Особенности похода..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 rounded-full transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 px-4 py-2.5 rounded-full transition-colors"
                style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}
              >
                Создать
              </button>
            </div>
          </div>
        </div>
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
              className="rounded-xl p-5 transition-all hover:scale-[1.01]"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
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
                      e.currentTarget.style.background = 'rgba(45, 212, 191, 0.1)';
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
                      e.currentTarget.style.color = '#FCA5A5';
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
