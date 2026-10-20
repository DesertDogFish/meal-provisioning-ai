import { ProblemDetail } from '../types/errors';
import { getValidationErrors, getConflictInfo, getErrorMessage, getErrorColor, ErrorColor } from '../utils/errorHandler';
import { AlertCircle, X, AlertTriangle } from 'lucide-react';

interface Props {
  problemDetail: ProblemDetail;
  onClose?: () => void;
  compact?: boolean;
}

/**
 * ProblemDetailAlert - UI компонент для отображения ProblemDetail
 * Аналог ProblemDetail response в Spring Boot
 */
export function ProblemDetailAlert({ problemDetail, onClose, compact = false }: Props) {
  const color = getErrorColor(problemDetail.status);
  const validationErrors = getValidationErrors(problemDetail);
  const conflictInfo = getConflictInfo(problemDetail);
  const message = getErrorMessage(problemDetail);

  const colorClasses: Record<ErrorColor, string> = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
  };

  const iconColorClasses: Record<ErrorColor, string> = {
    amber: 'text-amber-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    slate: 'text-slate-600',
  };

  if (compact) {
    return (
      <div className={`flex items-start gap-2 p-3 rounded-lg border ${colorClasses[color]}`}>
        <AlertCircle size={16} className={iconColorClasses[color]} />
        <div className="flex-1 text-sm">{message}</div>
        {onClose && (
          <button onClick={onClose} className={iconColorClasses[color]}>
            <X size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border ${colorClasses[color]} p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className={iconColorClasses[color]} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{problemDetail.title}</h3>
            <span className="text-xs opacity-75">({problemDetail.status})</span>
          </div>
          
          {problemDetail.detail && (
            <p className="text-sm opacity-90 mb-2">{problemDetail.detail}</p>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium opacity-75">Ошибки валидации:</p>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{err.field}:</span> {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Conflict info */}
          {conflictInfo && conflictInfo.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium opacity-75">Используется в:</p>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {conflictInfo.map((item, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{item.resourceName}</span> ({item.resourceType})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical details */}
          <details className="mt-3">
            <summary className="text-xs opacity-75 cursor-pointer hover:opacity-100">
              Технические детали (RFC 7807)
            </summary>
            <div className="mt-2 p-2 bg-white/50 rounded text-xs font-mono overflow-x-auto">
              <pre>{JSON.stringify(problemDetail, null, 2)}</pre>
            </div>
          </details>
        </div>

        {onClose && (
          <button onClick={onClose} className={iconColorClasses[color]}>
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
