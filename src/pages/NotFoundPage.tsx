/**
 * BL-66 (аудит 02.11.2026, usability): явный 404 вместо молчаливого редиректа.
 *
 * Раньше catch-all `path="*"` в `App.tsx` вёл всех на `/login`: аутентифицированный
 * пользователь с опечаткой в URL проходил через LoginPage и оказывался на `/trips`
 * без единого объяснения («куда меня перебросило?»).
 *
 * Теперь catch-all = ProtectedRoute → Layout → эта страница:
 *  - вне сессии — прежний редирект на `/login` (ProtectedRoute), логин работает как раньше;
 *  - в сессии — «Страница не найдена» + CTA «К списку походов» (EmptyState-паттерн:
 *    иконка + заголовок + подсказка + один рабочий выход, без тупика).
 *
 * Копи и вариант поведения — решение владельца по карточке BL-66; выбран явный 404
 * (а не тост с редиректом): пользователь видит адрес, по которому промахнулся.
 */
import { useNavigate } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';

import { Button } from '../components/Button';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-lg mx-auto p-6" data-testid="not-found-page">
      <div
        className="rounded-xl p-8 text-center space-y-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex justify-center" style={{ color: 'var(--muted)' }} aria-hidden="true">
          <MapPinOff size={32} />
        </div>
        <h1 className="font-bold" style={{ color: 'var(--text)' }}>Страница не найдена</h1>
        <p className="cap" style={{ color: 'var(--text-2)' }}>
          Такого адреса нет — возможно, в ссылке опечатка или страница переехала.
        </p>
        <div className="pt-2">
          <Button
            variant="soft"
            className="min-h-[44px]"
            onClick={() => navigate('/trips')}
            data-testid="not-found-cta"
          >
            К списку походов
          </Button>
        </div>
      </div>
    </div>
  );
}
