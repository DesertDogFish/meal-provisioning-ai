import { forwardRef, type ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  size?: 'sm' | 'md';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading,
  children,
  className,
  disabled,
  style,
  ...props
}, ref) => {
  return (
    <button
      ref={ref}

      className={`${styles['btn']} ${styles[variant]} ${styles[size]} ${isLoading ? ` ${styles['spin']}` : ''} ${className}`}
      disabled={disabled || isLoading}
      style={style}
      {...props}
    >
      {isLoading ? null : children}
    </button>
  );
});

export default Button;
export { Button };
