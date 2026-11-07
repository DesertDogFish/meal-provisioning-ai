import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

import { api } from '../api/client';
import { PASSWORD_MIN_LENGTH, passwordTooShort } from '../utils/validationMessages';
import { useAuth } from '../components/AuthProvider'; // cleanup-п.7
import BrandMark from '../components/BrandMark';
// design-п.3 (tasks/design-atmosphere-art.md, утверждено 03.11.2026): фон-арт
import seaLogin from '../assets/atmosphere/sea-login.webp';
import { useOffline } from '../hooks/useOffline';
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
  // п.3 (список владельца): первый запуск — только онлайн. Логин и регистрация
  // требуют бэкенда (токен выдаёт сервер), поэтому без сети форма не отправляется,
  // а под заголовком видно объяснение.
  const { online } = useOffline();
  // cleanup-п.7: проверка сессии при монтировании — в AuthProvider (один /auth/me);
  // страница просто уходит на канон, когда контекст сообщает о валидной сессии.
  const { user, refresh } = useAuth();

  // Просьба владельца 07.11.2026: если токен уже выдан (сессия жива), форму не показываем —
  // только приветствие и кнопка «Войти». Раньше страница молча редиректила на /trips.
  if (user) {
    const hi = user.firstName || user.lastName || user.email;
    return (
      <div className="relative overflow-hidden min-h-screen flex items-center justify-center p-4" style={{
        background: 'radial-gradient(1100px 500px at 85% -10%, color-mix(in srgb, var(--wave-400) 9%, transparent), transparent), radial-gradient(900px 500px at -10% 30%, color-mix(in srgb, var(--wave-400) 7%, transparent), transparent), var(--bg-0)'
      }}>
        <div className="login-art" aria-hidden style={{ backgroundImage: `url(${seaLogin})` }} />
        <div className="login-art-veil" aria-hidden />
        <div className="login-content w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center rounded-[var(--r-lg)] mb-4" style={{
              width: 88, height: 88, background: 'var(--bg-1)',
              border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow-glow)'
            }}>
              <BrandMark size={64} />
            </div>
            <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Провиант</h1>
          </div>
          <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
            <p className="text-lg font-semibold mb-6" style={{ color: 'var(--text-1)' }} data-testid="login-greeting">
              Здравствуйте, {hi}
            </p>
            <Button variant="primary" className="w-full" onClick={() => navigate('/trips')} data-testid="login-enter">
              Войти
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // п.3: без сети вход/регистрация невозможны — токен выдаёт бэкенд.
    if (!online) {
      setError('Нет соединения. Первый вход и регистрация требуют интернета.');
      return;
    }
    setLoading(true);

    try {
      if (isRegister) {
        if (!firstName || !lastName || !email || !password) {
          setError('Заполните все поля');
          return;
        }
        // Подзадача 4.5 аудита: парольная политика NIST SP 800-63B (минимум 8) —
        // клиентская проверка до запроса; бэкенд и mock enforced'ят ту же границу.
        if (password.length < PASSWORD_MIN_LENGTH) {
          setError(passwordTooShort());
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
        await refresh(); // cleanup-п.7: контекст узнаёт пользователя ОДНИМ запросом
        navigate('/trips');
      } else {
        if (!email || !password) {
          setError('Введите email и пароль');
          return;
        }
        
        // Вход
        const response = await api.post<AuthResponse>('/auth/login', { email, password });
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        await refresh(); // cleanup-п.7: контекст узнаёт пользователя ОДНИМ запросом
        navigate('/trips');
      }
    } catch (err: any) {
      setError(err.detail || err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden min-h-screen flex items-center justify-center p-4" style={{
      background: 'radial-gradient(1100px 500px at 85% -10%, color-mix(in srgb, var(--wave-400) 9%, transparent), transparent), radial-gradient(900px 500px at -10% 30%, color-mix(in srgb, var(--wave-400) 7%, transparent), transparent), var(--bg-0)'
    }}>
      {/* design-п.3 «море целиком»: арт на весь экран + тёмная вуаль снизу;
          лёгкий Ken Burns (CSS) отключается prefers-reduced-motion. Слои
          декоративные — aria-hidden, форма остаётся непрозрачной (контраст). */}
      <div className="login-art" aria-hidden style={{ backgroundImage: `url(${seaLogin})` }} />
      <div className="login-art-veil" aria-hidden />
      <div className="login-content w-full max-w-md">
        <div className="text-center mb-8">
          {/* Fix-7 (п.11): «оранжевое лого на оранжевом фоне» — подложка знака стала
              ТЁМНОЙ (ink) с обводкой; брендовый градиент остался свечением вокруг.
              Сам знак крупнее (64px в плашке 88px) — заметная точка входа. */}
          <div className="inline-flex items-center justify-center rounded-[var(--r-lg)] mb-4" style={{
            width: 88,
            height: 88,
            background: 'var(--bg-1)',
            border: '1px solid var(--line-strong)',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <BrandMark size={64} />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)' }}>Провиант</h1>
          <p style={{ color: 'var(--text-2)' }}>Планировщик питания для походов и яхт</p>
        </div>

        <div className="rounded-2xl p-8" style={{ background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
          {/* Заголовок «Вход в систему» убран (просьба владельца 07.11.2026). */}

          {!online && (
            <div role="status" data-testid="login-offline"
              className="px-4 py-3 rounded-lg mb-4 text-sm"
              style={{
                background: 'color-mix(in srgb, var(--amber-500) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--amber-500) 35%, transparent)',
                color: 'var(--text-1)',
              }}>
              Нет соединения. Вход и регистрация работают только онлайн.
            </div>
          )}

          {/* Подзадача 8 (аудит 02.11.2026): role="alert" (неявный aria-live=
              assertive) — скринридер объявляет ошибку входа сразу при появлении
              блока, а не только при фокусе на форме. */}
          {error && (
            <div id="login-error" role="alert"
              className="px-4 py-3 rounded-lg mb-4 text-sm"
              style={{
                background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                color: 'var(--danger)',
              }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="login-first-name" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Имя</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--text-2)' }} />
                    <input
                      id="login-first-name"
                      name="firstName"
                      autoComplete="given-name"
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)' }}
                      placeholder="Иван"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="login-last-name" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Фамилия</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--text-2)' }} />
                    <input
                      id="login-last-name"
                      name="lastName"
                      autoComplete="family-name"
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                      style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)' }}
                      placeholder="Петров"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--text-2)' }} />
                <input
                  id="login-email"
                  name="email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)' }}
                  placeholder="ivan@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium mb-1" style={{ color: 'var(--text-2)' }}>Пароль</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" style={{ color: 'var(--text-2)' }} />
                <input
                  id="login-password"
                  name="password"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg outline-none"
                  style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--text-1)' }}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                  style={{ color: 'var(--text-2)' }}
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
              style={{ color: 'var(--wave-400)' }}
            >
              {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
