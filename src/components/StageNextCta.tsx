/**
 * План plans/done/2026-10-31-ux-audit-navigation.md (п.2): явный CTA «Далее» в конце
 * каждого этапа воркфлоу — флоу проходится без ручного поиска следующего шага:
 * ① меню собрано → «К закупке ②»; ② есть позиции → «К списку в магазине ③»;
 * ③ всё взято → «Ввести чеки ④»; ④ чеки введены → «Отчёт и поделиться» (/report).
 * На незаполненном этапе вместо кнопки — короткая подсказка, чего не хватает
 (прозрачность: следующий шаг не спрятан, но и не обманывает готовностью).
 * Статусы — из единой готовности (utils/readiness), дублей состояния нет.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Share2, CheckCircle2 } from 'lucide-react'; // CheckCircle2 — redesign п.4
import { Button } from './Button';
import type { StageId } from './StageTabBar';

export interface StageNextCtaProps {
  tripId: string;
  stage: StageId;
  /** этап завершён (тот же объект, что у StageTabBar/.seg) */
  done: Record<StageId, boolean>;
  /** смена ?stage= (тот же setActiveTab страницы похода) */
  onStage: (s: StageId) => void;
  /**
   * redesign п.4: мутация утверждения меню ① (POST /trips/{id}/menu-approval).
   * CTA этапа ① до утверждения — кнопка «Утвердить меню» вместо подсказки.
   */
  onApproveMenu?: () => void;
}

const NEXT_LABEL: Record<StageId, string> = {
  menu: 'К проверке ②', // redesign п.1
  shopping: 'К списку в магазине ③',
  store: 'Ввести чеки ④',
  checks: 'К отчёту ⑤', // redesign п.5: отчёт — этап ⑤, не отдельная страница
  ready: 'Поделиться итогом', // redesign п.5: CTA на ⑤ скрыт, label — для полноты Record
};

const NEXT_STAGE: Record<StageId, StageId | null> = {
  menu: 'shopping',
  shopping: 'store',
  store: 'checks',
  checks: 'ready', // redesign п.5: финал — этап ⑤ внутри страницы
  ready: null,
};

const HINT: Record<StageId, string> = {
  menu: 'Добавьте приёмы пищи в меню — тогда откроется следующий шаг: проверка ②.',
  shopping: 'Соберите список позиций (нужна хотя бы одна) — тогда откроется список в магазине ③.',
  store: 'Отметьте всё взятое по чеклисту — тогда откроется ввод чеков ④.',
  checks: 'Введите чеки по всем позициям — тогда откроется этап ⑤ «Поход готов» с отчётом.',
  ready: 'Поход готов: отчёт, делёж и печать — на этом экране.',
};

export function StageNextCta({ tripId, stage, done, onStage, onApproveMenu }: StageNextCtaProps) {
  const navigate = useNavigate();

  // redesign п.4: ① до утверждения меню — заметная кнопка утверждения (мутация),
  // а не подсказка: воркфлоу не двигается дальше без явного «меню утверждено».
  if (stage === 'menu' && !done.menu) {
    return (
      <Button
        variant="primary"
        className="stage-next-cta"
        icon={<CheckCircle2 size={16} />}
        data-testid="stage-next-cta"
        onClick={() => onApproveMenu?.()}
      >
        Утвердить меню
      </Button>
    );
  }

  if (!done[stage]) {
    return (
      <p className="cap stage-next-hint" style={{ color: 'var(--text-2)' }} data-testid={`stage-next-hint-${stage}`}>
        {HINT[stage]}
      </p>
    );
  }

  // redesign п.5: на ⑤ CTA не нужен — отчёт сам содержит «Поделиться» и «PDF»
  if (stage === 'ready') return null;

  const next = NEXT_STAGE[stage];
  return (
    <Button
      variant="primary"
      className="stage-next-cta"
      icon={stage === 'checks' ? <Share2 size={16} /> : <ArrowRight size={16} />}
      data-testid="stage-next-cta"
      onClick={() => {
        if (next) onStage(next);
        else navigate(`/trips/${tripId}/report`);
      }}
    >
      {NEXT_LABEL[stage]}
    </Button>
  );
}

export default StageNextCta;
