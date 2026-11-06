import type { ReactNode } from 'react';

/**
 * Иконочная кнопка шапки страницы — единый размер и стиль для «меню» и «назад».
 *
 * UX-список владельца: в шапке похода кнопки вызова меню и возврата выглядели как
 * «из разных вселенных» (разные размеры/паддинги). Теперь обе рендерятся этим
 * компонентом: один класс `.ibtn`, один размер 36×36 (touch-target не страдает —
 * минимальная зона нажатия добирается `touch-hit`-отступами вокруг).
 */
export interface HeaderIconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}

export function HeaderIconButton({ label, onClick, children, testId }: HeaderIconButtonProps) {
  return (
    <button
      type="button"
      className="ibtn shrink-0"
      style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
