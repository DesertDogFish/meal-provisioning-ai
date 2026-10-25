import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { Button } from '../components/Button';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Проверка авторизации при монтировании
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then(() => {
          setIsAuthenticated(true);
          navigate('/dashboard');
        })
        .catch(() => {
          // Токен невалиден, очищаем
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        });
    }
  }, [navigate]);

  if (isAuthenticated) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!firstName || !lastName || !email || !password) {
          setError('Заполните все поля');
          return;
        }
        
        // Регистрация: контракт расширён (AUTH-01) — ответ содержит пару токенов,
        // отдельный round-trip на /login после регистрации больше не нужен.
        const regResponse = await api.post<AuthResponse>('/auth/register', {
          email,
          password,
          firstName,
          lastName
        });

        localStorage.setItem('accessToken', regResponse.accessToken);
        localStorage.setItem('refreshToken', regResponse.refreshToken);
        setIsAuthenticated(true);
        navigate('/dashboard');
      } else {
        if (!email || !password) {
          setError('Введите email и пароль');
          return;
        }
        
        // Вход
        const response = await api.post<AuthResponse>('/auth/login', { email, password });
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        setIsAuthenticated(true);
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.detail || err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'radial-gradient(1100px 500px at 85% -10%, color-mix(in srgb, var(--wave-400) 9%, transparent), transparent), radial-gradient(900px 500px at -10% 30%, color-mix(in srgb, var(--wave-400) 7%, transparent), transparent), var(--bg)'
    }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* DESIGN_MIGRATION 4.1/4.3: знак только из design-pack assets/ (BrandMark),
              инлайн-перерисовка убрана; подложка — брендовый градиент пакета, без перекраски знака */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[var(--r-lg)] mb-4" style={{
            background: 'var(--grad-brand)',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <BrandMark size={40} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Unbounded', color: 'var(--text)' }}>Провиант</h1>
          <p style={{ color: 'var(--muted)' }}>Планировщик питания для походов и яхт</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text)' }}>
            {isRegister ? 'Регистрация' : 'Вход в систему'}
          </h2>

          {error && (
            <div className="px-4 py-3 rounded-lg mb-4 text-sm" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Имя</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder="Иван"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Фамилия</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      placeholder="Петров"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Пароль</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--muted)' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" variant="primary" loading={loading} className="w-full">
              {isRegister ? 'Зарегистрироваться' : 'Войти'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-sm font-medium"
              style={{ color: 'var(--w1)' }}
            >
              {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>

          <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs text-center mb-3" style={{ color: 'var(--muted)' }}>Демо-доступ:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg p-2" style={{ background: 'var(--elev)' }}>
                <p className="font-medium" style={{ color: 'var(--text)' }}>Админ</p>
                <p style={{ color: 'var(--muted)' }}>admin@provision.app</p>
              </div>
              <div className="rounded-lg p-2" style={{ background: 'var(--elev)' }}>
                <p className="font-medium" style={{ color: 'var(--text)' }}>Пользователь</p>
                <p style={{ color: 'var(--muted)' }}>user@provision.app</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
