/**
 * Navigation-п.3 (2026-10-31): единое пустое состояние этапа — иконка + текст +
 * рабочий CTA на этап-источник. Пустой этап больше не тупик: кнопка переключает
 * `?stage=` (колбэк приходит со страницы похода).
 */
import type { ReactNode } from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  /** CTA: при label+onCta рендерится кнопка (testid `${testId}-cta`, ≥44px) */
  ctaLabel?: string;
  onCta?: () => void;
  testId?: string;
}

export function EmptyState({ icon, title, hint, ctaLabel, onCta, testId = 'empty-state' }: EmptyStateProps) {
  return (
    <div
      className="rounded-xl p-8 text-center space-y-2"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      data-testid={testId}
    >
      {icon && (
        <div className="flex justify-center" style={{ color: 'var(--muted)' }} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="font-bold" style={{ color: 'var(--text)' }}>{title}</p>
      {hint && <p className="cap" style={{ color: 'var(--text-2)' }}>{hint}</p>}
      {ctaLabel && onCta && (
        <div className="pt-2">
          <Button variant="soft" className="min-h-[44px]" onClick={onCta} data-testid={`${testId}-cta`}>
            {ctaLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
