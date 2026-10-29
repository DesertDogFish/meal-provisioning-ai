/**
 * Подзадача 25 аудита (2026-10-29): модуль выделен из `mockServer.ts` —
 * локальный справочник ЕМИСС, паритет пересчёта EmisUnit и роут /admin/emis/products.
 * Код маршрутов сохранён дословно; общее состояние — в `mockState.ts`.
 */

import {  } from './mockState';

// Локальный справочник ЕМИСС (форма EmisProductDto: code/name/unitLabel/latestPrice/
// latestPriceDate + вычисляемые pricePerUnit/warning). Названия, единицы и цены — реальные
// позиции классификатора (регион 643004.АГ, апрель 2026), чтобы демо показывало те же цифры,
// что боевая копия. unitKind/unitAmount/unitScale — те же машиночитаемые поля, что хранятся
// в emis_products (V26/V28); по ним мок повторяет пересчёт EmisUnit.pricePerUnit.
// Позиция 1115 намеренно без цены: демо состояния NO_DATA («привязан, но цен нет»).
// 9453/9454 — демо предупреждения о сомнительной привязке (KB-5): 50 л газа против
// резьбового баллона 220 г и «месяц с человека» (услуга, единица не распознана).
export const EMIS_CATALOG = [
  { code: '111', name: 'Говядина (кроме бескостного мяса), кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 734.88, latestPriceDate: '2026-04-01' },
  { code: '201', name: 'Колбаса вареная, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 580.02, latestPriceDate: '2026-04-01' },
  { code: '303', name: 'Консервы мясные, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 712.91, latestPriceDate: '2026-04-01' },
  { code: '604', name: 'Консервы рыбные натуральные и с добавлением масла, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 711.92, latestPriceDate: '2026-04-01' },
  { code: '803', name: 'Масло подсолнечное, л', unitLabel: 'л', unitKind: 'VOLUME', unitAmount: 1, unitScale: 'L', latestPrice: 153.3, latestPriceDate: '2026-04-01' },
  { code: '1115', name: 'Молоко сухое цельное, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: null, latestPriceDate: null },
  { code: '1127', name: 'Молоко сгущенное с сахаром, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 417.72, latestPriceDate: '2026-04-01' },
  { code: '1204', name: 'Сыры твердые, полутвердые и мягкие, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 967.92, latestPriceDate: '2026-04-01' },
  { code: '1501', name: 'Яйца куриные, 10 шт.', unitLabel: '10 шт.', unitKind: 'COUNT', unitAmount: 10, unitScale: 'PCS', latestPrice: 113.85, latestPriceDate: '2026-04-01' },
  { code: '1601', name: 'Сахар-песок, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 72.38, latestPriceDate: '2026-04-01' },
  { code: '1902', name: 'Кофе натуральный растворимый, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 4171.47, latestPriceDate: '2026-04-01' },
  { code: '1905', name: 'Чай черный байховый пакетированный, 25 пакетиков', unitLabel: '25 пакетиков', unitKind: 'COUNT', unitAmount: 25, unitScale: 'PCS', latestPrice: 84.14, latestPriceDate: '2026-04-01' },
  { code: '2002', name: 'Соль поваренная пищевая, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 22.63, latestPriceDate: '2026-04-01' },
  { code: '2207', name: 'Хлеб и булочные изделия из пшеничной муки различных сортов, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 122.01, latestPriceDate: '2026-04-01' },
  { code: '2301', name: 'Рис шлифованный, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 125.3, latestPriceDate: '2026-04-01' },
  { code: '2307', name: 'Крупа гречневая-ядрица, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 79.59, latestPriceDate: '2026-04-01' },
  { code: '2309', name: 'Овсяные хлопья "Геркулес", кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 112.27, latestPriceDate: '2026-04-01' },
  { code: '2403', name: 'Макаронные изделия из пшеничной муки высшего сорта, кг', unitLabel: 'кг', unitKind: 'MASS', unitAmount: 1, unitScale: 'KG', latestPrice: 121.01, latestPriceDate: '2026-04-01' },
  { code: '3306', name: 'Вода питьевая, л', unitLabel: 'л', unitKind: 'VOLUME', unitAmount: 1, unitScale: 'L', latestPrice: 44.07, latestPriceDate: '2026-04-01' },
  // V29: позиции, к которым перевязаны бытовая непищевка и косметика.
  { code: '5311', name: 'Крем для лица, 100 г (100 мл)', unitLabel: '100 г (100 мл)', unitKind: 'MASS', unitAmount: 100, unitScale: 'G', latestPrice: 702.38, latestPriceDate: '2026-04-01' },
  { code: '5701', name: 'Спички, коробок', unitLabel: 'коробок', unitKind: 'COUNT', unitAmount: 1, unitScale: 'PCS', latestPrice: 4.18, latestPriceDate: '2026-04-01' },
  { code: '6502', name: 'Бумага туалетная, рулон', unitLabel: 'рулон', unitKind: 'COUNT', unitAmount: 1, unitScale: 'PCS', latestPrice: 26.49, latestPriceDate: '2026-04-01' },
  { code: '6505', name: 'Салфетки влажные, упаковка 20 шт.', unitLabel: 'упаковка 20 шт.', unitKind: 'COUNT', unitAmount: 1, unitScale: 'PCS', latestPrice: 42.9, latestPriceDate: '2026-04-01' },
  { code: '8016', name: 'Антисептик для рук, 100 мл', unitLabel: '100 мл', unitKind: 'VOLUME', unitAmount: 100, unitScale: 'ML', latestPrice: 198.32, latestPriceDate: '2026-04-01' },
  // Цен в копии нет — предупреждение всё равно structural (паритет с EmisUnit.linkWarning).
  { code: '9453', name: 'Газ сжиженный в баллонах, 50 л', unitLabel: '50 л', unitKind: 'VOLUME', unitAmount: 50, unitScale: 'L', latestPrice: null, latestPriceDate: null },
  { code: '9454', name: 'Газ сжиженный, месяц с человека', unitLabel: 'месяц с человека', unitKind: 'OTHER', unitAmount: 1, unitScale: 'PCS', latestPrice: 391.48, latestPriceDate: '2026-04-01' },
];

export type EmisCatalogEntry = (typeof EMIS_CATALOG)[number];

export const emisByCode = (code?: string | null) =>
  code ? EMIS_CATALOG.find(c => c.code === code) ?? null : null;

/**
 * Статус синхронизации цены продукта (паритет с ProductService.toProductResponse):
 * нет привязки → NOT_LINKED; привязан и в копии есть цены → SYNCED; иначе NO_DATA.
 */
export const priceSyncStatusOf = (code?: string | null): string => {
  if (!code) return 'NOT_LINKED';
  return emisByCode(code)?.latestPrice != null ? 'SYNCED' : 'NO_DATA';
};

// ==================== Паритет с EmisUnit (backend) ====================
// Пороги и тексты предупреждений — один в один с EmisUnit.linkWarning/MAGNITUDE_LIMIT/
// DEVIATION_LIMIT, чтобы демо и боевой бэкенд говорили админу одно и то же (KB-5).
export const EMIS_MAGNITUDE_LIMIT = 100;

export const EMIS_DEVIATION_LIMIT = 10;

export const emisUnitWord = (unit: string): string =>
  ({ KG: 'кг', L: 'л', PCS: 'шт', PACK: 'уп' } as Record<string, string>)[unit.toUpperCase()] ?? unit;

export const emisKopecks = (v: number): string => v.toFixed(2).replace('.', ',');

export const emisPlain = (v: number): string => String(Number(v.toFixed(3)));

/** Приводится ли цена позиции к единице продукта в принципе (EmisUnit.convertsTo). */
export function emisConvertsTo(e: EmisCatalogEntry, unit?: string | null, pieceWeightG?: number | null): boolean {
  if (!unit || !(e.unitAmount > 0)) return false;
  const u = unit.toUpperCase();
  if (e.unitKind === 'MASS' || e.unitKind === 'VOLUME') {
    if (u === 'KG' || u === 'L') return true;
    if (u === 'PCS' || u === 'PACK') return pieceWeightG != null && pieceWeightG > 0;
    return false;
  }
  if (e.unitKind === 'COUNT') return u === 'PCS' || u === 'PACK';
  return false;
}

/** Цена позиции, пересчитанная на единицу продукта (EmisUnit.pricePerUnit + rounded); null — нельзя. */
export function emisPricePerUnit(
  e: EmisCatalogEntry,
  emisPrice: number | null,
  unit?: string | null,
  pieceWeightG?: number | null,
): number | null {
  if (emisPrice == null || emisPrice <= 0 || !emisConvertsTo(e, unit, pieceWeightG)) return null;
  const u = String(unit).toUpperCase();
  const piece = u === 'PCS' || u === 'PACK';
  if (e.unitKind === 'MASS' || e.unitKind === 'VOLUME') {
    const bulk = e.unitScale === 'KG' || e.unitScale === 'L' ? e.unitAmount * 1000 : e.unitAmount;
    const perBase = emisPrice / bulk; // за грамм (MASS) или за миллилитр (VOLUME)
    // Плотность ≈ 1: кг↔л пересчитываются один к одному, piece_weight_g штучного продукта
    // при цене за объём читается как миллилитры.
    if (!piece) return Math.round(perBase * 1000 * 100) / 100;
    return Math.round(perBase * (pieceWeightG as number) * 100) / 100;
  }
  // COUNT: цена ряда указана за amount штук («10 шт.») либо за упаковку целиком (amount = 1).
  return Math.round((emisPrice / e.unitAmount) * 100) / 100;
}

/** Текст для случая, когда пересчёт невозможен (EmisUnit.notConvertible). */
export function emisNotConvertible(e: EmisCatalogEntry, unit: string, pieceWeightG?: number | null): string {
  const suffix = e.unitLabel ? ` («${e.unitLabel}»)` : '';
  const ours = emisUnitWord(unit);
  if (e.unitKind === 'OTHER') {
    return `Единица позиции не распознана${suffix} — обычно это услуга или «прочее».`
      + ' Цена ряда на продукт не переносится, синхронизация её пропустит.';
  }
  if (e.unitKind === 'COUNT' && ours !== 'шт' && ours !== 'уп') {
    return `Позиция указана в штуках${suffix}, а продукт — в ${ours}: веса штуки в классификаторе нет,`
      + ' перенести цену нельзя (пример: «Яйца куриные, 10 шт.» против яичного порошка в кг).';
  }
  if ((ours === 'шт' || ours === 'уп') && !(pieceWeightG != null && pieceWeightG > 0)) {
    return 'Для пересчёта нужен вес одной штуки (piece_weight_g) — у продукта он не задан.'
      + ` Без него цена позиции${suffix} на штуку не переносится.`;
  }
  return `Единицы несовместимы: позиция${suffix}, продукт — в ${ours}.`
    + ' Цена ряда на продукт не переносится, синхронизация её пропустит.';
}

/** Предупреждение о сомнительной паре (EmisUnit.linkWarning); null — пара правдоподобна. */
export function emisLinkWarning(
  e: EmisCatalogEntry,
  emisPrice: number | null,
  unit?: string | null,
  pieceWeightG?: number | null,
  currentPrice?: number | null,
): string | null {
  if (!unit) return null;
  const notes: string[] = [];
  const u = unit.toUpperCase();
  const piece = u === 'PCS' || u === 'PACK';

  if (!emisConvertsTo(e, unit, pieceWeightG)) {
    notes.push(emisNotConvertible(e, unit, pieceWeightG));
  } else if ((e.unitKind === 'MASS' || e.unitKind === 'VOLUME') && piece && pieceWeightG != null && pieceWeightG > 0) {
    const size = e.unitScale === 'KG' || e.unitScale === 'L' ? e.unitAmount * 1000 : e.unitAmount;
    const times = Math.round(size / pieceWeightG);
    if (times >= EMIS_MAGNITUDE_LIMIT) {
      notes.push(`Масштаб не сопоставим: позиция указана за «${e.unitLabel}», а штука продукта —`
        + ` ${emisPlain(pieceWeightG)} г (разница в ${times} раз). Правило «плотность ≈ 1» на такой паре`
        + ' физически неверно (пример владельца: «Газ сжиженный в баллонах, 50 л» ≠ резьбовой баллон 220 г),'
        + ' поэтому цена будет занижена на порядки.');
    }
  }

  const perUnit = emisPricePerUnit(e, emisPrice, unit, pieceWeightG);
  if (perUnit != null) {
    if (perUnit.toFixed(2) === '0.00') {
      notes.push(`После пересчёта цена продукта округляется до 0,00 ₽ за ${emisUnitWord(unit)} —`
        + ` позиция «${e.unitLabel}» слишком крупная для такой фасовки.`);
    } else if (currentPrice != null && currentPrice > 0 && perUnit > 0) {
      const up = perUnit / currentPrice;
      const down = currentPrice / perUnit;
      if (up >= EMIS_DEVIATION_LIMIT || down >= EMIS_DEVIATION_LIMIT) {
        notes.push(`Цена после привязки — ${emisKopecks(perUnit)} ₽ за ${emisUnitWord(unit)} против`
          + ` текущей ${emisKopecks(currentPrice)} ₽: отличается в ${Math.round(Math.max(up, down))} раз.`
          + ' Проверьте, та ли это позиция и та ли фасовка.');
      }
    }
  }
  return notes.length ? notes.join(' ') : null;
}

  /**
   * Нормализация кода привязки к ЕМИСС (паритет с ProductService.normalizeEmisCode):
   * пусто → null (отвязать), неизвестный код → 400 VALIDATION_ERROR.
   */

export function normalizeEmisCodeImpl(raw: unknown): string | null {
  const code = String(raw ?? '').trim();
  if (!code) return null;
  if (!emisByCode(code)) {
    throw {
      status: 400,
      message: 'VALIDATION_ERROR',
      detail: `позиция ЕМИСС ${code} не найдена в локальном справочнике. Выберите позицию из поиска`,
    } as any;
  }
  return code;
}

export function tryEmisRoutes<T>(method: string, pathWithoutQuery: string, path: string): { hit: true; result: T } | { hit: false } {
  // Локальный справочник ЕМИСС — GET /admin/emis/products?query=&limit= (EmisController).
  // Поиск по подстрокe названия/кода; пустой query — первые limit позиций по алфавиту.
  if (pathWithoutQuery === '/admin/emis/products' && method === 'GET') {
    const url = new URL(`http://localhost${path}`);
    const query = (url.searchParams.get('query') || '').trim().toLowerCase();
    const limit = Number(url.searchParams.get('limit') ?? 20);
    // KB-5 (паритет с EmisController): контекст продукта — единица, вес штуки, текущая цена.
    const num = (v: string | null): number | null => {
      if (v == null || v.trim() === '') return null;
      const x = Number(v.replace(',', '.'));
      return Number.isFinite(x) ? x : null;
    };
    const unit = url.searchParams.get('unit');
    const pieceWeightG = num(url.searchParams.get('pieceWeightG'));
    const currentPrice = num(url.searchParams.get('price'));
    const found = EMIS_CATALOG
      .filter(c => !query || c.name.toLowerCase().includes(query) || c.code.includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 20);
    // Форма ответа — ровно EmisProductDto: служебные unitKind/unitAmount/unitScale наружу не уходят.
    return { hit: true, result: found.map(c => ({
      code: c.code,
      name: c.name,
      unitLabel: c.unitLabel,
      latestPrice: c.latestPrice,
      latestPriceDate: c.latestPriceDate,
      pricePerUnit: unit ? emisPricePerUnit(c, c.latestPrice, unit, pieceWeightG) : null,
      warning: unit ? emisLinkWarning(c, c.latestPrice, unit, pieceWeightG, currentPrice) : null,
    })) as T };
  }
  return { hit: false };
}
