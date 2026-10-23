import { Moon, Sun } from 'lucide-react';
import { getStoredTheme, setTheme, type Theme } from '../theme';

// Кнопка-переключатель тем по AGENTS.md design-pack:
// «Переключатель: кнопка с aria-label, персист в localStorage['pv-theme'] в try/catch».
export default function ThemeToggle() {
  const toggle = () => {
    const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="ibtn theme-toggle"
      onClick={toggle}
      aria-label="Переключить светлую/тёмную тему"
      title="Переключить тему"
    >
      <Sun size={18} className="theme-icon-dark" />
      <Moon size={18} className="theme-icon-light" />
    </button>
  );
}
