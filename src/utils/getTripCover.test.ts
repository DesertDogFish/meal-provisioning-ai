import { describe, it, expect } from 'vitest';
import { getTripCover, getTripCoverKeyword } from './getTripCover';

/**
 * Список багов 25.10 («картинки для походов не грузятся»): обложки — локальные
 * ассеты, без внешних сервисов и без Date.now() в URL (перезагрузка на рендер).
 */
describe('getTripCover', () => {
  it('ключевые слова названия определяют обложку', () => {
    expect(getTripCoverKeyword('Море Ладожское')).toBe('sea');
    expect(getTripCoverKeyword('Алтай: горы и перевалы')).toBe('mountains');
    expect(getTripCoverKeyword('Карелия, тайга')).toBe('forest');
    expect(getTripCoverKeyword('Просто поход')).toBe('camping');
    expect(getTripCoverKeyword('')).toBe('camping');
  });

  it('URL детерминирован и не ссылается на внешние сервисы', () => {
    const a = getTripCover('Поход на Алтай');
    const b = getTripCover('Поход на Алтай');
    expect(a).toBe(b);
    expect(a).not.toMatch(/^https?:\/\//);
    expect(a).not.toContain('loremflickr');
  });

  it('разные темы дают разные обложки', () => {
    expect(getTripCover('Море')).not.toBe(getTripCover('Горы'));
    expect(getTripCover('Лес')).not.toBe(getTripCover('Море'));
  });
});
