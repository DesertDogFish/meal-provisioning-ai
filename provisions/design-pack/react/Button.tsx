import React from 'react';
import s from './Button.module.css';

type Variant = 'primary' | 'ghost' | 'soft' | 'danger';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: React.ReactNode;
};

/** Кнопка Провианта. loading блокирует клики и показывает спиннер. */
export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={[s.btn, s[variant], size === 'sm' ? s.sm : '', className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spin} aria-hidden /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/** Квадратная кнопка-иконка: обязателен aria-label. */
export const IconButton = ({ label, className, children, ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
  <button aria-label={label} title={label} className={[s.ibtn, className].filter(Boolean).join(' ')} {...rest}>
    {children}
  </button>
);
