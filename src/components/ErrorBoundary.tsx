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

  static getDerivedStateFromError(error: Error): State {
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
            <div className="flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mx-auto mb-4">
              <AlertTriangle size={32} className="text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
              Что-то пошло не так
            </h2>
            <p className="text-slate-600 text-center mb-6">
              {this.state.error.detail || this.state.error.title}
            </p>
            
            <details className="mb-6">
              <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                Технические детали
              </summary>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 overflow-x-auto">
                <pre>{JSON.stringify(this.state.error, null, 2)}</pre>
              </div>
            </details>

            <button
              onClick={this.reset}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
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
