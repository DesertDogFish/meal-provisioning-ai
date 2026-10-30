import { BookOpen, ShoppingCart, ClipboardCheck, Receipt, ChevronRight, Check } from 'lucide-react';

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 2): продуктовый
 * сценарий похода линейный — ① Меню → ② Закупка → ③ Магазин → ④ Чеки и итог.
 * На мобильном — фиксированный нижний таб-бар (иконка + подпись + номер/
 * галочка, тач ≥56px, safe-area-inset-bottom) и горизонтальный степпер
 * со стрелками сверху (nowrap, не рвётся в столбик). На десктопе оба блока
 * скрыты — там прежний .seg из 4 пунктов (рендерит TripDetailPage).
 *
 * Компонент презентационный: статусы этапов приходят props'ами из
 * готовности похода (utils/readiness) — дублей состояния нет.
 */
export type StageId = 'menu' | 'shopping' | 'store' | 'checks';

export interface StageMeta {
  id: StageId;
  num: number;
  label: string;
  icon: React.ReactNode;
}

export const STAGES: StageMeta[] = [
  { id: 'menu', num: 1, label: 'Меню', icon: <BookOpen size={18} aria-hidden /> },
  { id: 'shopping', num: 2, label: 'Закупка', icon: <ShoppingCart size={18} aria-hidden /> },
  { id: 'store', num: 3, label: 'Магазин', icon: <ClipboardCheck size={18} aria-hidden /> },
  { id: 'checks', num: 4, label: 'Чеки', icon: <Receipt size={18} aria-hidden /> },
];

/** Старые id вкладок и значения ?stage= до введения этапов → этап. */
export function parseStage(raw: string | null | undefined): StageId {
  switch (raw) {
    case 'menu':
    case 'shopping':
    case 'dayShopping':
    case 'person':
      return raw === 'menu' ? 'menu' : 'shopping';
    case 'checklist':
    case 'store':
      return 'store';
    case 'overrides':
    case 'checks':
      return 'checks';
    default:
      return 'menu';
  }
}

export interface StageTabBarProps {
  stage: StageId;
  onStage: (s: StageId) => void;
  /** этап завершён: меню собрано / список сформирован / всё взято / чеки введены */
  done: Record<StageId, boolean>;
  testId?: string;
}

export function StageTabBar({ stage, onStage, done, testId }: StageTabBarProps) {
  return (
    <>
      {/* Верхний степпер-прогресс со стрелками (мобильный) */}
      <nav className="stage-stepper" aria-label="Этапы похода" data-testid={testId ? `${testId}-stepper` : 'stage-stepper'}>
        {STAGES.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1 flex-none">
            {i > 0 && <ChevronRight size={14} className="stage-stepper__arrow" aria-hidden />}
            <button
              type="button"
              className={`stage-stepper__item ${done[s.id] ? 'done' : ''} ${stage === s.id ? 'active' : ''}`}
              aria-current={stage === s.id ? 'step' : undefined}
              data-testid={`stage-step-${s.id}`}
              onClick={() => onStage(s.id)}
            >
              <span className="stage-stepper__num" aria-hidden>
                {done[s.id] ? <Check size={13} /> : s.num}
              </span>
              {s.label}
            </button>
          </span>
        ))}
      </nav>

      {/* Нижний таб-бар (мобильный) */}
      <nav className="stage-bar" aria-label="Этапы похода" data-testid={testId ?? 'stage-bar'}>
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`stage-bar__btn ${stage === s.id ? 'active' : ''} ${done[s.id] ? 'done' : ''}`}
            aria-current={stage === s.id ? 'page' : undefined}
            aria-label={`Этап ${s.num}: ${s.label}${done[s.id] ? ' — готово' : ''}`}
            data-testid={`stage-bar-${s.id}`}
            onClick={() => onStage(s.id)}
          >
            {s.icon}
            <span>{s.id === 'checks' ? 'Чеки · итог' : s.label}</span>
            {done[s.id] ? (
              <span className="stage-bar__badge ok" aria-hidden>✓</span>
            ) : (
              <span className="stage-bar__badge" aria-hidden>{s.num}</span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}

export default StageTabBar;
