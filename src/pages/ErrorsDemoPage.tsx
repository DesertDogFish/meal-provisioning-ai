import { useState } from 'react';
import { ProblemDetail } from '../types/errors';
import { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, InternalError } from '../utils/errors';
import { validate, notBlank, email, positive, size } from '../utils/validation';
import { ProblemDetailAlert } from '../components/ProblemDetailAlert';
import { useToast } from '../components/ToastProvider';
import { AlertTriangle, Shield, Search, XCircle, Server, Ban } from 'lucide-react';

export default function ErrorsDemoPage() {
  const { showError, showSuccess } = useToast();
  const [currentError, setCurrentError] = useState<ProblemDetail | null>(null);
  const [validationForm, setValidationForm] = useState({ email: '', name: '', age: '' });
  const [validationErrors, setValidationErrors] = useState<{ field: string; message: string }[]>([]);

  const triggerValidationError = () => {
    const error = new ValidationError([
      { field: 'email', message: 'must be a valid email address', rejectedValue: 'invalid-email' },
      { field: 'name', message: 'must not be blank', rejectedValue: '' },
      { field: 'age', message: 'must be positive', rejectedValue: -5 },
    ], 'Request validation failed');
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const triggerUnauthorizedError = () => {
    const error = new UnauthorizedError('Access token expired');
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const triggerForbiddenError = () => {
    const error = new ForbiddenError('You do not have permission to access admin resources');
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const triggerNotFoundError = () => {
    const error = new NotFoundError('Trip', 'trip-123');
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const triggerConflictError = () => {
    const error = new ConflictError(
      'Ingredient "Гречка" is used in recipes and cannot be deleted',
      [
        { resourceType: 'recipe', resourceId: 'rec1', resourceName: 'Гречка с тушёнкой' },
        { resourceType: 'recipe', resourceId: 'rec8', resourceName: 'Гречка с овощами' },
      ]
    );
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const triggerInternalError = () => {
    const error = new InternalError('Database connection failed');
    setCurrentError(error.toProblemDetail());
    showError(error.toProblemDetail());
  };

  const handleValidationTest = () => {
    try {
      validate([
        { field: 'email', value: validationForm.email, validators: [(v, f) => notBlank(v as string, f), (v, f) => email(v as string, f)] },
        { field: 'name', value: validationForm.name, validators: [(v, f) => notBlank(v as string, f), (v, f) => size(v as string, f, 2, 50)] },
        { field: 'age', value: validationForm.age ? parseInt(validationForm.age) : undefined, validators: [(v, f) => positive(v as number, f)] },
      ]);
      setValidationErrors([]);
      showSuccess('Валидация пройдена!');
    } catch (err) {
      if (err instanceof ValidationError) {
        setValidationErrors(err.errors.map(e => ({ field: e.field, message: e.message })));
      }
    }
  };

  const errorExamples = [
    { title: 'Validation Error (400)', icon: <AlertTriangle size={20} />, onClick: triggerValidationError, color: 'amber' },
    { title: 'Unauthorized (401)', icon: <Shield size={20} />, onClick: triggerUnauthorizedError, color: 'orange' },
    { title: 'Forbidden (403)', icon: <Ban size={20} />, onClick: triggerForbiddenError, color: 'red' },
    { title: 'Not Found (404)', icon: <Search size={20} />, onClick: triggerNotFoundError, color: 'blue' },
    { title: 'Conflict (409)', icon: <XCircle size={20} />, onClick: triggerConflictError, color: 'purple' },
    { title: 'Internal Error (500)', icon: <Server size={20} />, onClick: triggerInternalError, color: 'red' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text)' }}>Демонстрация обработки ошибок</h1>
        <p className="mt-1" style={{ color: 'var(--muted)' }}>GlobalExceptionHandler, ProblemDetail (RFC 7807), валидация</p>
      </div>

      {/* Error examples */}
      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Типы ошибок</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {errorExamples.map((example, idx) => (
            <button
              key={idx}
              onClick={example.onClick}
              className="flex items-center gap-3 p-4 rounded-xl lift text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--elev)' }}>
                {example.icon}
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>{example.title}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Нажмите для демонстрации</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current error display */}
      {currentError && (
        <div>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Текущая ошибка (ProblemDetail)</h2>
          <ProblemDetailAlert problemDetail={currentError} onClose={() => setCurrentError(null)} />
        </div>
      )}

      {/* Validation demo */}
      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Демонстрация валидации</h2>
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Email</label>
              <input
                type="text"
                value={validationForm.email}
                onChange={e => setValidationForm({ ...validationForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="test@example.com"
              />
              {validationErrors.find(e => e.field === 'email') && (
                <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>{validationErrors.find(e => e.field === 'email')?.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Имя</label>
              <input
                type="text"
                value={validationForm.name}
                onChange={e => setValidationForm({ ...validationForm, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="Иван"
              />
              {validationErrors.find(e => e.field === 'name') && (
                <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>{validationErrors.find(e => e.field === 'name')?.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--muted)' }}>Возраст</label>
              <input
                type="number"
                value={validationForm.age}
                onChange={e => setValidationForm({ ...validationForm, age: e.target.value })}
                className="w-full px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--text)' }}
                placeholder="25"
              />
              {validationErrors.find(e => e.field === 'age') && (
                <p className="text-sm mt-1" style={{ color: 'var(--danger)' }}>{validationErrors.find(e => e.field === 'age')?.message}</p>
              )}
            </div>

            <button
              onClick={handleValidationTest}
              className="px-4 py-2 rounded-full transition-colors"
                          >
              Проверить валидацию
            </button>
          </div>
        </div>
      </div>

      {/* Documentation */}
      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Документация</h2>
        <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div>
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>GlobalExceptionHandler</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Централизованный обработчик ошибок, аналог @ControllerAdvice в Spring Boot.
              Перехватывает все ошибки приложения и маршрутизирует их к соответствующим обработчикам.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>ProblemDetail (RFC 7807)</h3>
            <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
              Единый формат ошибок с полями:
            </p>
            <ul className="list-disc list-inside text-sm space-y-1" style={{ color: 'var(--muted)' }}>
              <li><code className="px-1 rounded" style={{ background: 'var(--elev)' }}>type</code> — URI идентификатор типа проблемы</li>
              <li><code className="px-1 rounded" style={{ background: 'var(--elev)' }}>title</code> — краткое описание</li>
              <li><code className="px-1 rounded" style={{ background: 'var(--elev)' }}>status</code> — HTTP статус код</li>
              <li><code className="px-1 rounded" style={{ background: 'var(--elev)' }}>detail</code> — подробное описание</li>
              <li><code className="px-1 rounded" style={{ background: 'var(--elev)' }}>instance</code> — URI конкретного экземпляра</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Классы ошибок</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--amber-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--amber-500) 30%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--amber-300)' }}>ValidationError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--amber-300)' }}>400 — ошибки валидации полей</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--amber-600) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--amber-600) 30%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--amber-200)' }}>UnauthorizedError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--amber-200)' }}>401 — требуется авторизация</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--danger)' }}>ForbiddenError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>403 — доступ запрещён</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--wave-400) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--wave-400) 40%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--wave-300)' }}>NotFoundError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--wave-300)' }}>404 — ресурс не найден</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--flame-600) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--flame-600) 40%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--amber-200)' }}>ConflictError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--amber-200)' }}>409 — конфликт данных</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)' }}>
                <code className="font-mono" style={{ color: 'var(--danger)' }}>InternalError</code>
                <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>500 — внутренняя ошибка</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2" style={{ color: 'var(--text)' }}>Валидация</h3>
            <p className="text-sm mb-2" style={{ color: 'var(--muted)' }}>
              Утилиты валидации, аналог Jakarta Bean Validation:
            </p>
            <div className="flex flex-wrap gap-2">
              {['@NotNull', '@NotBlank', '@Email', '@Size', '@Positive', '@Min', '@Max', '@Pattern', '@FutureOrPresent'].map(annotation => (
                <span key={annotation} className="px-2 py-1 text-xs rounded font-mono" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                  {annotation}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
