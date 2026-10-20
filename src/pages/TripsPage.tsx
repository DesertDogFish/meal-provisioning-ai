import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, generateId } from '../store/AppContext';
import { Plus, Mountain, Calendar, Users, Trash2, Edit2 } from 'lucide-react';

export default function TripsPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newTrip, setNewTrip] = useState({ name: '', startDate: '', endDate: '', defaultPeople: 4, notes: '' });

  const myTrips = state.trips.filter(t => t.userId === state.currentUser?.id);

  const handleCreate = () => {
    if (!newTrip.name || !newTrip.startDate || !newTrip.endDate) return;
    if (newTrip.endDate < newTrip.startDate) return;
    
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
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Походы</h1>
          <p className="text-slate-500 mt-1">Управление вашими походами и запасами</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Новый поход</span>
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Новый поход</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
                <input
                  type="text"
                  value={newTrip.name}
                  onChange={e => setNewTrip({ ...newTrip, name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="Поход на Алтай"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Дата начала</label>
                  <input
                    type="date"
                    value={newTrip.startDate}
                    onChange={e => setNewTrip({ ...newTrip, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Дата окончания</label>
                  <input
                    type="date"
                    value={newTrip.endDate}
                    onChange={e => setNewTrip({ ...newTrip, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Количество человек</label>
                <input
                  type="number"
                  min={1}
                  value={newTrip.defaultPeople}
                  onChange={e => setNewTrip({ ...newTrip, defaultPeople: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Заметки</label>
                <textarea
                  value={newTrip.notes}
                  onChange={e => setNewTrip({ ...newTrip, notes: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  rows={2}
                  placeholder="Особенности похода..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreate}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trips list */}
      {myTrips.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Mountain size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-4">У вас пока нет походов</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            Создать первый поход
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {myTrips.map(trip => (
            <div
              key={trip.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => navigate(`/trips/${trip.id}`)}>
                  <h3 className="font-bold text-slate-900 text-lg">{trip.name}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
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
                  {trip.notes && <p className="text-sm text-slate-400 mt-1">{trip.notes}</p>}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/trips/${trip.id}`)}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(trip.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
