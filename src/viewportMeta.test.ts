import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * bugs-trip-menu-stage п.6: нижняя панель этапов (.stage-bar) «вроде внизу,
 * но с зазором» на реальном устройстве.
 *
 * Статический разбор кандидатов из задачи:
 *  - containing block от ancestor с backdrop-filter/transform — ОТВЕДЁН:
 *    StageTabBar рендерится ВНЕ glass-обёртки (комментарий в TripDetailPage),
 *    у body/#root/.app-frame/main нет transform/filter/will-change/contain;
 *  - .stage-page { padding-bottom: 72px } — ОТВЕДЁН: это отступ КОНТЕНТА под
 *    фиксированным баром, зазор ПОД баром создать не может;
 *  - 100vh vs dvh — влияет на высоту документа, не на fixed bottom:0;
 *  - env(safe-area-inset-bottom) — ПРИЧИНА: CSS приложения в 14 местах
 *    рассчитывает на safe-area (padding бара, модалок, топбара, scroll-top),
 *    но viewport meta БЕЗ `viewport-fit=cover` → на iOS webview не extends под
 *    home-indicator, env() всегда 0, и в PWA-standalone под fixed-баром
 *    остаётся непокрытая полоса системного фона — тот самый «зазор».
 *
 * Инвариант: viewport meta обязан содержать viewport-fit=cover, иначе вся
 * safe-area-механика index.css мертва. Тест читает index.html как текст —
 * это единственная проверяемая в jsdom/happy-dom часть фикса (геометрия
 * fixed-бара проверяется e2e: mobile.spec.ts M-14, прогон в CI).
 */
// vitest запускается из корня репозитория (npm test); import.meta.url в
// happy-dom не file:// — поэтому путь от process.cwd().
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');

describe('index.html — viewport meta (bugs-trip-menu-stage п.6)', () => {
  it('содержит viewport-fit=cover — safe-area env() не мёртв, .stage-bar перекрывает home-indicator', () => {
    const meta = html.match(/<meta\s+name="viewport"[^>]*>/i);
    expect(meta, 'viewport meta отсутствует').not.toBeNull();
    expect(meta![0]).toMatch(/viewport-fit=cover/);
  });

  it('сохраняет width=device-width и initial-scale=1', () => {
    const meta = html.match(/<meta\s+name="viewport"[^>]*>/i)![0];
    expect(meta).toMatch(/width=device-width/);
    expect(meta).toMatch(/initial-scale=1/);
  });
});
