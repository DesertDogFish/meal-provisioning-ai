/**
 * План plans/done/2026-10-31-ux-audit-visual-inspection.md (подзадача 1):
 * «N приёмов пищи» на карточках дней и в печати было хардкодом — «2 приёмов пищи».
 * Тест фиксирует контракт единственного источника формы слова (text.ts) и
 * готовой подписи-счётчика, которой пользуются TripDaysList / TripPrintPage /
 * TripsPage (R2: слой теста = слой изменения — утилита текста).
 */
import { describe, expect, it } from 'vitest';

import { mealsWord, mealsCountLabel, daysCountLabel } from './text';

describe('mealsWord — форма слова «приём пищи»', () => {
  it('0 → «приёмов»', () => expect(mealsWord(0)).toBe('приёмов'));
  it('1 → «приём»', () => expect(mealsWord(1)).toBe('приём'));
  it('2–4 → «приёма»', () => {
    expect(mealsWord(2)).toBe('приёма');
    expect(mealsWord(3)).toBe('приёма');
    expect(mealsWord(4)).toBe('приёма');
  });
  it('5+ → «приёмов»', () => {
    expect(mealsWord(5)).toBe('приёмов');
    expect(mealsWord(11)).toBe('приёмов');
    expect(mealsWord(14)).toBe('приёмов');
  });
  it('21 → «приём», 22 → «приёма»', () => {
    expect(mealsWord(21)).toBe('приём');
    expect(mealsWord(22)).toBe('приёма');
  });
});

describe('mealsCountLabel — подпись счётчика приёмов (подзадача 1)', () => {
  it('0/1/2/5 дают согласованную форму', () => {
    expect(mealsCountLabel(0)).toBe('0 приёмов пищи');
    expect(mealsCountLabel(1)).toBe('1 приём пищи');
    expect(mealsCountLabel(2)).toBe('2 приёма пищи');
    expect(mealsCountLabel(3)).toBe('3 приёма пищи');
    expect(mealsCountLabel(5)).toBe('5 приёмов пищи');
    expect(mealsCountLabel(21)).toBe('21 приём пищи');
  });
  it('короткая форма без «пищи» — для плотных строк печати', () => {
    expect(mealsCountLabel(2, { short: true })).toBe('2 приёма');
    expect(mealsCountLabel(1, { short: true })).toBe('1 приём');
    expect(mealsCountLabel(5, { short: true })).toBe('5 приёмов');
  });
});

describe('daysCountLabel — sweep хардкодов формы слова', () => {
  it('дни: 1 день / 2 дня / 5 дней / 21 день', () => {
    expect(daysCountLabel(1)).toBe('1 день');
    expect(daysCountLabel(2)).toBe('2 дня');
    expect(daysCountLabel(5)).toBe('5 дней');
    expect(daysCountLabel(21)).toBe('21 день');
  });
  it('сокращённая форма «дн.» — для плотных строк (список походов, печать)', () => {
    expect(daysCountLabel(2, { short: true })).toBe('2 дн.');
    expect(daysCountLabel(1, { short: true })).toBe('1 дн.');
  });
});
