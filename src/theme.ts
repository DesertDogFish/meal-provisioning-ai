// Переключатель тем по design-pack (tokens.json → themeSwitch):
// атрибут data-theme на <html>, значения dark|light, дефолт dark,
// персист в localStorage['pv-theme'] в try/catch.
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'pv-theme';

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* localStorage недоступен — остаёмся на дефолте */
  }
  return 'dark';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

// Вызывается один раз при старте приложения (main.tsx), до отрисовки,
// чтобы не было вспышки неверной темы.
export function initTheme() {
  applyTheme(getStoredTheme());
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* игнорируем: персист — best-effort */
  }
}
