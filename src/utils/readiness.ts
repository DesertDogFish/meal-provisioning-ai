/**
 * Fix-3 (список 26.10, п.2 «сквозная понятность»): готовность похода по цепочке
 * этапов «① Меню → ② Проверка → ③ Магазин → ④ Чеки и итог» (redesign п.1).
 * Чистая функция —
 * страницу читает только факты:
 * есть ли приёмы, сколько позиций чеклиста отмечено «взято», сколько фактических
 * цен введено. Никаких денег/ккал здесь не считается (AGENTS §9).
 */

export interface ReadinessFacts {
  /** число приёмов пищи во всём походе */
  mealsCount: number;
  /** позиций в чеклисте закупки (без исключённых) */
  checklistTotal: number;
  /** из них отмечено «взято» */
  boughtCount: number;
  /** сколько позиций получили фактическую цену (чек) */
  factCount: number;
  /**
   * Fix-4 (п.11): сколько позиций НУЖНО оплатить, чтобы чек считался введённым —
   * знаменатель «введено X из Y». По умолчанию = checklistTotal.
   */
  checksTotal?: number;
  /**
   * trip-workflow-redesign п.4: меню этапа ① утверждено владельцем
   * (backend TripResponse.menuApproved / mock-паритет). done.menu = это поле.
   */
  menuApproved?: boolean;
}

export type StepState = 'done' | 'partial' | 'none';

export interface TripReadiness {
  menu: StepState;
  /**
   * transparency-п.1: шаг readiness «shopping» переименован в `store` — он считает
   * «взято N из M» по чеклисту, а это этап ③ «Магазин», не этап ② «Проверка»
   * (этап ② готов, когда в списке есть позиции — `checklistTotal > 0`).
   */
  store: StepState;
  checks: StepState;
  /** вся цепочка закрыта — поход «готов» */
  ready: boolean;
  /** можно ли вводить чек (Fix-3: не раньше, чем что-то куплено по чеклисту) */
  canEnterCheck: boolean;
}

export function tripReadiness(f: ReadinessFacts): TripReadiness {
  // redesign п.4: ① готов ТОЛЬКО после утверждения меню; блюда без утверждения —
  // «partial» (этап ① открыт, CTA зовёт утвердить).
  const menu: StepState = f.menuApproved ? 'done' : f.mealsCount > 0 ? 'partial' : 'none';
  const store: StepState =
    f.checklistTotal === 0 ? 'none'
    : f.boughtCount >= f.checklistTotal ? 'done'
    : f.boughtCount > 0 ? 'partial'
    : 'none';
  const checksTotal = f.checksTotal ?? f.checklistTotal;
  const checks: StepState =
    f.factCount === 0 ? 'none'
    : checksTotal > 0 && f.factCount >= checksTotal ? 'done'
    : 'partial';
  return {
    menu,
    store,
    checks,
    ready: menu === 'done' && store === 'done' && checks === 'done',
    // чек вводим, только когда закупка подтверждена хоть чем-то (п.2)
    canEnterCheck: f.boughtCount > 0,
  };
}

/**
 * bugs-trip-list п.3: id этапов воркфлоу (совпадает со StageId StageTabBar).
 */
export type WorkflowStage = 'menu' | 'shopping' | 'store' | 'checks' | 'ready'; // ready — redesign п.5

/**
 * Текущий этап похода = САМАЯ РАННЯЯ незакрытая часть воркфлоу (R8: единый
 * источник для списка походов и страницы похода, чтобы не разъезжались).
 * Раньше TripsPage выбирал этап «по нарастающей» (самому продвинутому признаку),
 * из-за чего введённые чеки при незакрытой закупке рисовали заполненную полосу.
 *
 * menu не готов → ①; иначе чеклист пуст → ②; иначе не всё взято → ③;
 * иначе → ④ (и «вводятся», и «готово» — финальный этап).
 */
export function earliestOpenStage(r: TripReadiness, f: Pick<ReadinessFacts, 'checklistTotal'>): WorkflowStage {
  if (r.menu !== 'done') return 'menu';
  if (f.checklistTotal === 0) return 'shopping';
  if (r.store !== 'done') return 'store';
  if (r.checks !== 'done') return 'checks';
  return 'ready'; // redesign п.5: вся цепочка закрыта → этап ⑤
}

/**
 * trip-workflow-redesign п.4: прогресс-бар воркфлоу = 5 РАВНЫХ сегментов
 * (① Меню → ② Проверка → ③ Магазин → ④ Чеки → ⑤ Готов), заполненность каждого 0..1:
 * ① min(meals,10)/10 (1 блюдо = 1/50 длины, 10+ блюд = 1/5);
 * ② позиции есть/нет; ③ bought/total; ④ facts/total; ⑤ готов/нет.
 * Единый источник для карточки списка и страницы похода (R8).
 */
export interface ProgressSegment {
  id: WorkflowStage | 'ready';
  fill: number;
}

export function workflowProgress(r: TripReadiness, f: ReadinessFacts): ProgressSegment[] {
  const checksTotal = f.checksTotal ?? f.checklistTotal;
  return [
    { id: 'menu', fill: Math.min(f.mealsCount, 10) / 10 },
    { id: 'shopping', fill: f.checklistTotal > 0 ? 1 : 0 },
    { id: 'store', fill: f.checklistTotal === 0 ? 0 : Math.min(1, f.boughtCount / f.checklistTotal) },
    { id: 'checks', fill: checksTotal === 0 ? 0 : Math.min(1, f.factCount / checksTotal) },
    { id: 'ready', fill: r.ready ? 1 : 0 },
  ];
}

/** Итоговая заполненность полосы = среднее по 5 равным сегментам (0..1). */
export function workflowProgressFill(segments: ProgressSegment[]): number {
  return segments.reduce((a, s) => a + s.fill, 0) / segments.length;
}
