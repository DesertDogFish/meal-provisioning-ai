import { AlertCircle, X, AlertTriangle } from 'lucide-react';

import { ProblemDetail } from '../types/errors';
import { getValidationErrors, getConflictInfo, getErrorMessage, getErrorColor, ErrorColor } from '../utils/errorHandler';
// UX-осмотр 31.10 (п.2): список ошибок — человеческая RU-копи; техническое имя
// поля остаётся в «Технических деталях (RFC 7807)» ниже (логи/отладка).
import { humanizeFieldError } from '../utils/validationMessages';

interface Props {
  problemDetail: ProblemDetail;
  onClose?: () => void;
  compact?: boolean;
}

// BL-63 (аудит 02.11.2026, подзадача 7): цвета — только токенами дизайн-пака
// через классы .alert--* (src/index.css). Сырая палитра Tailwind (классы
// *-50/*-900) была только светлой — в тёмной теме алерт рисовался белёсой коробкой.
// Компонент маппит семантику статуса (getErrorColor) на имя класса и не знает
// ни о теме, ни о конкретных цветах (provisions/design-pack/AGENTS.md).
const alertModifier: Record<ErrorColor, string> = {
  amber: 'alert--warn',
  orange: 'alert--warn',
  red: 'alert--danger',
  blue: 'alert--info',
  purple: 'alert--info',
  slate: 'alert--neutral',
};

/**
 * ProblemDetailAlert - UI компонент для отображения ProblemDetail
 * Аналог ProblemDetail response в Spring Boot
 */
export function ProblemDetailAlert({ problemDetail, onClose, compact = false }: Props) {
  const modifier = alertModifier[getErrorColor(problemDetail.status)];
  const validationErrors = getValidationErrors(problemDetail);
  const conflictInfo = getConflictInfo(problemDetail);
  const message = getErrorMessage(problemDetail);

  if (compact) {
    return (
      <div role="alert" className={`alert ${modifier} flex items-start gap-2 p-3`}>
        <AlertCircle size={16} className="alert__icon flex-none mt-0.5" aria-hidden="true" />
        <div className="flex-1 text-sm">{message}</div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Закрыть" className="alert__close flex-none">
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="alert" className={`alert ${modifier} p-4`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="alert__icon flex-none mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold">{problemDetail.title}</h3>
            <span className="alert__muted text-xs">({problemDetail.status})</span>
          </div>

          {problemDetail.detail && (
            <p className="text-sm opacity-90 mb-2">{problemDetail.detail}</p>
          )}

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="alert__muted text-xs font-medium">Ошибки валидации:</p>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{humanizeFieldError(err)}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Conflict info */}
          {conflictInfo && conflictInfo.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="alert__muted text-xs font-medium">Используется в:</p>
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
            <summary className="alert__muted text-xs cursor-pointer hover:opacity-100">
              Технические детали (RFC 7807)
            </summary>
            <div className="mt-2 p-2 rounded text-xs font-mono overflow-x-auto" style={{ background: 'color-mix(in srgb, var(--bg-0) 30%, transparent)' }}>
              <pre>{JSON.stringify(problemDetail, null, 2)}</pre>
            </div>
          </details>
        </div>

        {onClose && (
          <button type="button" onClick={onClose} aria-label="Закрыть" className="alert__close flex-none">
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
