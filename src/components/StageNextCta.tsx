/**
 * План plans/2026-10-31-ux-audit-navigation.md (п.2): явный CTA «Далее» в конце
 * каждого этапа воркфлоу — флоу проходится без ручного поиска следующего шага:
 * ① меню собрано → «К закупке ②»; ② есть позиции → «К списку в магазине ③»;
 * ③ всё взято → «Ввести чеки ④»; ④ чеки введены → «Отчёт и поделиться» (/report).
 * На незаполненном этапе вместо кнопки — короткая подсказка, чего не хватает
 (прозрачность: следующий шаг не спрятан, но и не обманывает готовностью).
 * Статусы — из единой готовности (utils/readiness), дублей состояния нет.
 */
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Share2 } from 'lucide-react';
import { Button } from './Button';
import type { StageId } from './StageTabBar';

export interface StageNextCtaProps {
  tripId: string;
  stage: StageId;
  /** этап завершён (тот же объект, что у StageTabBar/.seg) */
  done: Record<StageId, boolean>;
  /** смена ?stage= (тот же setActiveTab страницы похода) */
  onStage: (s: StageId) => void;
}

const NEXT_LABEL: Record<StageId, string> = {
  menu: 'К закупке ②',
  shopping: 'К списку в магазине ③',
  store: 'Ввести чеки ④',
  checks: 'Отчёт и поделиться',
};

const NEXT_STAGE: Record<StageId, StageId | null> = {
  menu: 'shopping',
  shopping: 'store',
  store: 'checks',
  checks: null, // финал — in-app отчёт /trips/:id/report
};

const HINT: Record<StageId, string> = {
  menu: 'Добавьте приёмы пищи в меню — тогда откроется следующий шаг: закупка ②.',
  shopping: 'Соберите закупку (нужна хотя бы одна позиция) — тогда откроется список в магазине ③.',
  store: 'Отметьте всё взятое по чеклисту — тогда откроется ввод чеков ④.',
  checks: 'Введите чеки по всем позициям — тогда откроется отчёт, которым можно поделиться.',
};

export function StageNextCta({ tripId, stage, done, onStage }: StageNextCtaProps) {
  const navigate = useNavigate();

  if (!done[stage]) {
    return (
      <p className="cap stage-next-hint" style={{ color: 'var(--text-2)' }} data-testid={`stage-next-hint-${stage}`}>
        {HINT[stage]}
      </p>
    );
  }

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
