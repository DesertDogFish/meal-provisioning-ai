import { useState } from 'react';
import { ProblemDetail } from '../types/errors';
import { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError, InternalError, InvalidOperationError } from '../utils/errors';
import { validate, notBlank, email, positive, size } from '../utils/validation';
import { ProblemDetailAlert } from '../components/ProblemDetailAlert';
import { useToast } from '../components/ToastProvider';
import { AlertTriangle, Shield, Search, XCircle, Server, Ban, CheckCircle } from 'lucide-react';

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
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Демонстрация обработки ошибок</h1>
        <p className="text-slate-500 mt-1">GlobalExceptionHandler, ProblemDetail (RFC 7807), валидация</p>
      </div>

      {/* Error examples */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Типы ошибок</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {errorExamples.map((example, idx) => (
            <button
              key={idx}
              onClick={example.onClick}
              className={`flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow text-left`}
            >
              <div className={`w-10 h-10 bg-${example.color}-100 rounded-lg flex items-center justify-center text-${example.color}-600`}>
                {example.icon}
              </div>
              <div>
                <p className="font-semibold text-slate-900">{example.title}</p>
                <p className="text-xs text-slate-500">Нажмите для демонстрации</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Current error display */}
      {currentError && (
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-4">Текущая ошибка (ProblemDetail)</h2>
          <ProblemDetailAlert problemDetail={currentError} onClose={() => setCurrentError(null)} />
        </div>
      )}

      {/* Validation demo */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Демонстрация валидации</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="text"
                value={validationForm.email}
                onChange={e => setValidationForm({ ...validationForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="test@example.com"
              />
              {validationErrors.find(e => e.field === 'email') && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.find(e => e.field === 'email')?.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Имя</label>
              <input
                type="text"
                value={validationForm.name}
                onChange={e => setValidationForm({ ...validationForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Иван"
              />
              {validationErrors.find(e => e.field === 'name') && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.find(e => e.field === 'name')?.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Возраст</label>
              <input
                type="number"
                value={validationForm.age}
                onChange={e => setValidationForm({ ...validationForm, age: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="25"
              />
              {validationErrors.find(e => e.field === 'age') && (
                <p className="text-sm text-red-600 mt-1">{validationErrors.find(e => e.field === 'age')?.message}</p>
              )}
            </div>

            <button
              onClick={handleValidationTest}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Проверить валидацию
            </button>
          </div>
        </div>
      </div>

      {/* Documentation */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Документация</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">GlobalExceptionHandler</h3>
            <p className="text-sm text-slate-600">
              Централизованный обработчик ошибок, аналог @ControllerAdvice в Spring Boot.
              Перехватывает все ошибки приложения и маршрутизирует их к соответствующим обработчикам.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">ProblemDetail (RFC 7807)</h3>
            <p className="text-sm text-slate-600 mb-2">
              Единый формат ошибок с полями:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
              <li><code className="bg-slate-100 px-1 rounded">type</code> — URI идентификатор типа проблемы</li>
              <li><code className="bg-slate-100 px-1 rounded">title</code> — краткое описание</li>
              <li><code className="bg-slate-100 px-1 rounded">status</code> — HTTP статус код</li>
              <li><code className="bg-slate-100 px-1 rounded">detail</code> — подробное описание</li>
              <li><code className="bg-slate-100 px-1 rounded">instance</code> — URI конкретного экземпляра</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Классы ошибок</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <code className="font-mono text-amber-900">ValidationError</code>
                <p className="text-xs text-amber-700 mt-1">400 — ошибки валидации полей</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <code className="font-mono text-orange-900">UnauthorizedError</code>
                <p className="text-xs text-orange-700 mt-1">401 — требуется авторизация</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <code className="font-mono text-red-900">ForbiddenError</code>
                <p className="text-xs text-red-700 mt-1">403 — доступ запрещён</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <code className="font-mono text-blue-900">NotFoundError</code>
                <p className="text-xs text-blue-700 mt-1">404 — ресурс не найден</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <code className="font-mono text-purple-900">ConflictError</code>
                <p className="text-xs text-purple-700 mt-1">409 — конфликт данных</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <code className="font-mono text-red-900">InternalError</code>
                <p className="text-xs text-red-700 mt-1">500 — внутренняя ошибка</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Валидация</h3>
            <p className="text-sm text-slate-600 mb-2">
              Утилиты валидации, аналог Jakarta Bean Validation:
            </p>
            <div className="flex flex-wrap gap-2">
              {['@NotNull', '@NotBlank', '@Email', '@Size', '@Positive', '@Min', '@Max', '@Pattern', '@FutureOrPresent'].map(annotation => (
                <span key={annotation} className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded font-mono">
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
