/**
 * Fix-3 (список 26.10, п.2 «сквозная понятность»): готовность похода по цепочке
 * этапов «① Меню → ② Закупка → ③ Магазин → ④ Чеки и итог». Чистая функция —
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
}

export type StepState = 'done' | 'partial' | 'none';

export interface TripReadiness {
  menu: StepState;
  /**
   * transparency-п.1: шаг readiness «shopping» переименован в `store` — он считает
   * «взято N из M» по чеклисту, а это этап ③ «Магазин», не этап ② «Закупка»
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
  const menu: StepState = f.mealsCount > 0 ? 'done' : 'none';
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
