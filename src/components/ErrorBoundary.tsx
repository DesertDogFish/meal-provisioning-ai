import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ProblemDetail } from '../types/errors';
import { globalExceptionHandler } from '../utils/errorHandler';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: ProblemDetail, reset: () => void) => ReactNode);
}

interface State {
  hasError: boolean;
  error: ProblemDetail | null;
}

/**
 * ErrorBoundary - React компонент для перехвата ошибок рендеринга
 * Аналог @ExceptionHandler в Spring Boot
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true, error: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Handle error through GlobalExceptionHandler
    const problemDetail = globalExceptionHandler.handle(error);
    
    // Add component stack info
    problemDetail.instance = errorInfo.componentStack || undefined;
    
    this.setState({ error: problemDetail });
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Custom fallback
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.reset);
        }
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg)' }}>
          <div className="rounded-2xl shadow-lg p-8 max-w-md w-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-center w-16 h-16 rounded-full mx-auto mb-4" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
              <AlertTriangle size={32} style={{ color: '#FCA5A5' }} />
            </div>
            <h2 className="text-xl font-bold text-center mb-2" style={{ color: 'var(--text)' }}>
              Что-то пошло не так
            </h2>
            <p className="text-center mb-6" style={{ color: 'var(--muted)' }}>
              {this.state.error.detail || this.state.error.title}
            </p>
            
            <details className="mb-6">
              <summary className="text-sm cursor-pointer" style={{ color: 'var(--muted)' }}>
                Технические детали
              </summary>
              <div className="mt-2 p-3 rounded-lg text-xs overflow-x-auto" style={{ background: 'var(--elev)', color: 'var(--muted)' }}>
                <pre>{JSON.stringify(this.state.error, null, 2)}</pre>
              </div>
            </details>

            <button
              onClick={this.reset}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-full transition-colors"
              style={{ background: 'linear-gradient(90deg, var(--w1), var(--w2))', color: '#04121A' }}
            >
              <RefreshCw size={18} />
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
