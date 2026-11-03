import { BookOpen, ShoppingCart, ClipboardCheck, Receipt, Flag } from 'lucide-react'; // Flag — redesign п.5 (⑤)

/**
 * Plan plans/2026-10-30-mobile-workflow-ux.md (подзадача 2): продуктовый
 * сценарий похода линейный — ① Меню → ② Проверка → ③ Магазин → ④ Чеки и итог
 * (trip-workflow-redesign п.1: переименовано 03.11.2026; id/URL `shopping` прежние).
 * На мобильном — фиксированный нижний таб-бар (иконка + подпись + номер/
 * галочка, тач ≥56px, safe-area-inset-bottom). На десктопе блок скрыт —
 * там прежний .seg из 4 пунктов (рендерит TripDetailPage).
 *
 * UX-осмотр 31.10 (подзадача 5, KB-33): верхний степпер-прогресс УДАЛЁН.
 * На 390px он давал второй кликабельный переключатель этапов (третьим был
 * протёкший из-под `hidden` десктопный .seg) и обрезался справа на 21px.
 * Единственная мобильная навигация этапов — нижний таб-бар; прогресс показывают
 * mini-steps липкой полосы сводки (TripSummaryPanel) и бейджи таб-бара.
 * Решение — в DESIGN_MIGRATION.md (R11).
 *
 * Компонент презентационный: статусы этапов приходят props'ами из
 * готовности похода (utils/readiness) — дублей состояния нет.
 */
export type StageId = 'menu' | 'shopping' | 'store' | 'checks' | 'ready'; // ready — redesign п.5

export interface StageMeta {
  id: StageId;
  num: number;
  label: string;
  icon: React.ReactNode;
}

export const STAGES: StageMeta[] = [
  { id: 'menu', num: 1, label: 'Меню', icon: <BookOpen size={18} aria-hidden /> },
  { id: 'shopping', num: 2, label: 'Проверка', icon: <ShoppingCart size={18} aria-hidden /> }, // redesign п.1
  { id: 'store', num: 3, label: 'Магазин', icon: <ClipboardCheck size={18} aria-hidden /> },
  { id: 'checks', num: 4, label: 'Чеки', icon: <Receipt size={18} aria-hidden /> },
  // redesign п.5: ⑤ «Поход готов» — отчёт стал этапом воркфлоу (?stage=ready)
  { id: 'ready', num: 5, label: 'Поход готов', icon: <Flag size={18} aria-hidden /> },
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
    case 'ready': // redesign п.5
      return 'ready';
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
      {/* Нижний таб-бар (мобильный) — ЕДИНСТВЕННЫЙ переключатель этапов на mobile */}
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
            <span>{s.id === 'checks' ? 'Чеки · итог' : s.id === 'ready' ? 'Готов' : s.label}</span>
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
