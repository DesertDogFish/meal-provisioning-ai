import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  size?: 'sm' | 'md';
  /** Состояние загрузки: спиннер .spin вместо иконки, клики заблокированы (components.md §1). */
  isLoading?: boolean;
  /** Алиас пропса эталонного react/Button.tsx из design-pack. */
  loading?: boolean;
  icon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading,
  loading,
  icon,
  children,
  className,
  disabled,
  style,
  ...props
}, ref) => {
  const busy = isLoading || loading;
  return (
    <button
      ref={ref}
      className={[styles['btn'], styles[variant], size === 'sm' ? styles.sm : '', className].filter(Boolean).join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      style={style}
      {...props}
    >
      {busy ? <span className={styles['spin']} aria-hidden /> : icon}
      {children}
    </button>
  );
});

export default Button;
export { Button };
