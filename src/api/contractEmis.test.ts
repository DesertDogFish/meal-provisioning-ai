/**
 * CONTRACT-EMIS: новые поля ЕМИСС в контракте mock-сервера (BL-8 остаток + BL-23, frontend).
 *
 * Исполняемая спецификация двух расширений контракта, которые ввёл KB-5/KB-8:
 *  1. `GET /admin/emis/products` — форма `EmisProductDto` (7 полей) плюс параметры контекста
 *     продукта `unit`/`pieceWeightG`/`price`, на которые сервер отвечает пересчитанной ценой
 *     `pricePerUnit` и предупреждением `warning` о сомнительной паре. Предупреждение привязку
 *     НЕ блокирует: решение за админом (решение владельца 29.10.2026).
 *  2. `GET /admin/products` — поле `emisSharedCount` в `ProductResponse`: сколько ДРУГИХ
 *     глобальных продуктов привязано к той же позиции ЕМИСС (значок «привязка уже
 *     используется» в «Продуктах» показывает `emisSharedCount + 1`).
 *
 * Эталон поведения — бэкенд, а не мок: форму DTO и параметры фиксирует `EmisControllerTest`,
 * работу `LinkContext` — `EmisCatalogServiceTest`, правила пересчёта и тексты предупреждений —
 * `EmisUnitTest`, счётчик общей привязки — `EmisSharedCountIntegrationTest`. Мок обязан
 * говорить админу то же самое (паритет `emisPricePerUnit`/`emisLinkWarning` в `mockServer.ts`).
 *
 * Запуск: `npm run test:contract` (цель по умолчанию mock) или
 * `npx vitest run src/api/contractEmis.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { mockServer } from './mockServer';

const call = <T,>(method: string, path: string, body?: any): T =>
  mockServer.handleRequest<T>(method, path, body);

/** Позиции справочника ЕМИСС, на которых проверяются правила (реальные коды V26–V29). */
const CODE = {
  buckwheat: '2307',   // Крупа гречневая-ядрица, кг (MASS 1 KG, 79.59)
  salt: '2002',        // Соль поваренная пищевая, кг (MASS 1 KG, 22.63)
  powderedMilk: '1115', // Молоко сухое цельное, кг — цен в копии нет (NO_DATA)
  eggs: '1501',        // Яйца куриные, 10 шт. (COUNT 10 PCS, 113.85)
  coffee: '1902',      // Кофе натуральный растворимый, кг (MASS 1 KG, 4171.47)
  faceCream: '5311',   // Крем для лица, 100 г (100 мл) (MASS 100 G, 702.38)
  matches: '5701',     // Спички, коробок (COUNT 1 PCS, 4.18)
  paper: '6502',       // Бумага туалетная, рулон (COUNT 1 PCS, 26.49)
  antiseptic: '8016',  // Антисептик для рук, 100 мл (VOLUME 100 ML, 198.32)
  gasCylinder: '9453', // Газ сжиженный в баллонах, 50 л (VOLUME 50 L, цен нет)
  gasMonthly: '9454',  // Газ сжиженный, месяц с человека (OTHER, 391.48)
} as const;

const search = (params: Record<string, string | number | null>) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return call<any[]>('GET', `/admin/emis/products?${qs}`);
};

const one = (code: string, params: Record<string, string | number | null>) => {
  const found = search({ ...params, query: code }).filter(p => p.code === code);
  expect(found, `позиция ${code} обязана находиться в локальном справочнике`).toHaveLength(1);
  return found[0];
};

/** Форма `EmisProductDto` — ровно эти ключи (служебные unit_* наружу не уходят). */
const DTO_KEYS = ['code', 'name', 'unitLabel', 'latestPrice', 'latestPriceDate', 'pricePerUnit', 'warning'];

describe('CONTRACT-EMIS-01: форма EmisProductDto в поиске позиций', () => {
  it('ровно 7 полей DTO, машиночитаемые unitKind/unitAmount/unitScale не уходят', () => {
    const items = search({ query: 'антисептик' });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual([...DTO_KEYS].sort());
      expect(item).not.toHaveProperty('unitKind');
      expect(item).not.toHaveProperty('unitAmount');
      expect(item).not.toHaveProperty('unitScale');
    }
  });

  it('без контекста продукта pricePerUnit и warning — null (ключи присутствуют)', () => {
    for (const item of search({ query: '', limit: 50 })) {
      expect(item).toHaveProperty('pricePerUnit');
      expect(item).toHaveProperty('warning');
      expect(item.pricePerUnit).toBeNull();
      expect(item.warning).toBeNull();
    }
  });

  it('цена и период согласованы: у позиции без цен оба поля null', () => {
    for (const item of search({ query: '', limit: 50 })) {
      if (item.latestPrice == null) {
        expect(item.latestPriceDate).toBeNull();
      } else {
        expect(typeof item.latestPrice).toBe('number');
        expect(item.latestPriceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
    // Демо-состояния NO_DATA: 1115 (сухое молоко) и 9453 (газ в баллонах) — цен в копии нет.
    expect(one(CODE.powderedMilk, { query: null }).latestPrice).toBeNull();
    expect(one(CODE.gasCylinder, { query: null }).latestPrice).toBeNull();
  });
});

describe('CONTRACT-EMIS-02: контекст продукта — pricePerUnit и warning', () => {
  it('сопоставимая пара: антисептик 100 мл ↔ продукт шт. 100 г — цена переносится, молчим', () => {
    const item = one(CODE.antiseptic, { unit: 'PCS', pieceWeightG: 100, price: 210 });
    expect(item.pricePerUnit).toBeCloseTo(198.32, 2);
    expect(item.warning).toBeNull();
  });

  it('штуки против «ряд за штуку»: бумага, рулон ↔ продукт шт. — цена ряда как есть', () => {
    const item = one(CODE.paper, { unit: 'PCS' });
    expect(item.pricePerUnit).toBeCloseTo(26.49, 2);
    expect(item.warning).toBeNull();
  });

  it('газ 50 л ↔ резьбовой баллон 220 г: масштаб не сопоставим (227 раз), цена не переносится', () => {
    const item = one(CODE.gasCylinder, { unit: 'PCS', pieceWeightG: 220 });
    expect(item.pricePerUnit).toBeNull();
    expect(item.warning).toContain('Масштаб не сопоставим');
    expect(item.warning).toContain('227 раз');
    expect(item.warning).toContain('220');
  });

  it('структурное предупреждение звучит и БЕЗ цены позиции (у 9453 цен в копии нет)', () => {
    // Паритет с EmisCatalogServiceTest: «Без цены у позиции: pricePerUnit null, но СТРУКТУРНОЕ
    // предупреждение звучит» — иначе «Газ 50 л» ↔ баллон 220 г молчал бы до первого синка.
    const noPrice = one(CODE.gasCylinder, { unit: 'PCS', pieceWeightG: 220 });
    expect(noPrice.latestPrice).toBeNull();
    expect(noPrice.warning).not.toBeNull();
  });

  it('единица позиции не распознана («месяц с человека»): цена ряда на продукт не переносится', () => {
    const item = one(CODE.gasMonthly, { unit: 'KG' });
    expect(item.pricePerUnit).toBeNull();
    expect(item.warning).toContain('Единица позиции не распознана');
    expect(item.warning).toContain('месяц с человека');
  });

  it('позиция в штуках против продукта в кг: веса штуки в классификаторе нет', () => {
    const item = one(CODE.eggs, { unit: 'KG' });
    expect(item.pricePerUnit).toBeNull();
    expect(item.warning).toContain('Позиция указана в штуках');
    expect(item.warning).toContain('10 шт.');
  });

  it('штучный продукт без piece_weight_g: пересчёт невозможен, предупреждение требует вес штуки', () => {
    const item = one(CODE.faceCream, { unit: 'PCS' });
    expect(item.pricePerUnit).toBeNull();
    expect(item.warning).toContain('Для пересчёта нужен вес одной штуки (piece_weight_g)');
  });

  it('тот же крем с весом штуки 50 г: цена пересчитана, предупреждения нет', () => {
    const item = one(CODE.faceCream, { unit: 'PCS', pieceWeightG: 50 });
    expect(item.pricePerUnit).toBeCloseTo(351.19, 2); // 702.38 ₽ за 100 г → за 50 г
    expect(item.warning).toBeNull();
  });

  it('позиция без цен, но пересчёт возможен: warning null, pricePerUnit null (NO_DATA без шума)', () => {
    const item = one(CODE.powderedMilk, { unit: 'KG' });
    expect(item.warning).toBeNull();
    expect(item.pricePerUnit).toBeNull();
  });

  it('цена уехала на порядок: кофе, кг ↔ пакетик 20 г при текущей цене 5 ₽ — 17 раз', () => {
    const item = one(CODE.coffee, { unit: 'PCS', pieceWeightG: 20, price: 5 });
    expect(item.pricePerUnit).toBeCloseTo(83.43, 2); // 4171.47 ₽/кг → 83.43 ₽ за пакетик 20 г
    expect(item.warning).toContain('Цена после привязки');
    expect(item.warning).toContain('83,43');
    expect(item.warning).toContain('отличается в 17 раз');
  });

  it('принятая «цена категории» (×4,2) молчит: тот же кофе при текущей цене 20 ₽', () => {
    const item = one(CODE.coffee, { unit: 'PCS', pieceWeightG: 20, price: 20 });
    expect(item.pricePerUnit).toBeCloseTo(83.43, 2);
    expect(item.warning).toBeNull();
  });

  it('дробный вес штуки доезжает и с запятой, и с точкой (12,5 г ≡ 12.5 г)', () => {
    const comma = one(CODE.coffee, { unit: 'PCS', pieceWeightG: '12,5' });
    const dot = one(CODE.coffee, { unit: 'PCS', pieceWeightG: '12.5' });
    expect(comma.pricePerUnit).toBeCloseTo(52.14, 2); // 4.17147 ₽/г × 12.5 г
    expect(dot.pricePerUnit).toBe(comma.pricePerUnit);
    expect(comma.warning).toBeNull();
  });

  it('контекст без единицы продукта игнорируется: пересчитывать не на что', () => {
    const item = one(CODE.antiseptic, { pieceWeightG: 100, price: 210 });
    expect(item.pricePerUnit).toBeNull();
    expect(item.warning).toBeNull();
  });

  it('limit: пустой/нулевой → 20 позиций, явный limit режет выдачу', () => {
    expect(search({ query: null }).length).toBeLessThanOrEqual(20);
    expect(search({ query: null, limit: 0 }).length).toBeLessThanOrEqual(20);
    expect(search({ query: null, limit: 3 })).toHaveLength(3);
  });
});

describe('CONTRACT-EMIS-03: emisSharedCount в форме ProductResponse', () => {
  const listProducts = () => call<any>('GET', '/admin/products?size=500', null).content as any[];

  it('поле есть у каждого продукта, статус синхронизации — из трёх значений', () => {
    const items = listProducts();
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) {
      expect(typeof p.emisSharedCount).toBe('number');
      expect(['NOT_LINKED', 'NO_DATA', 'SYNCED']).toContain(p.priceSyncStatus);
      // Список продуктов — глобальный каталог: снимки походов сюда не попадают.
      expect(p.tripId).toBeUndefined();
    }
  });

  it('привязка и статус согласованы: нет кода → 0 и NOT_LINKED, 1115 → NO_DATA, 2307 → SYNCED', () => {
    const items = listProducts();
    for (const p of items) {
      if (!p.emisCode) {
        expect(p.emisSharedCount).toBe(0);
        expect(p.priceSyncStatus).toBe('NOT_LINKED');
        expect(p.emisName).toBeNull();
      } else {
        expect(p.priceSyncStatus).toBe(p.emisCode === CODE.powderedMilk ? 'NO_DATA' : 'SYNCED');
        expect(typeof p.emisName).toBe('string');
      }
    }
    expect(items.find(p => p.emisCode === CODE.powderedMilk)?.priceSyncStatus).toBe('NO_DATA');
    expect(items.find(p => p.emisCode === CODE.buckwheat)?.priceSyncStatus).toBe('SYNCED');
  });

  it('в сиде каждая позиция занята одним продуктом: счётчик 0', () => {
    for (const p of listProducts()) expect(p.emisSharedCount).toBe(0);
  });

  it('второй продукт на том же коде: счётчик симметричен и равен числу ДРУГИХ продуктов', async () => {
    const twin = call<any>('POST', '/admin/ingredients', {
      name: 'Гречка фасованная (контракт-тест)',
      unit: 'KG',
      categoryId: 'cat1',
      emisCode: CODE.buckwheat,
    });
    try {
      const items = listProducts();
      const buckwheat = items.find(p => p.name === 'Гречка');
      expect(items.find(p => p.id === twin.id)?.emisSharedCount).toBe(1);
      expect(buckwheat?.emisSharedCount).toBe(1);
      // Незатронутые продукты счётчик не меняют.
      expect(items.find(p => p.emisCode === CODE.salt)?.emisSharedCount).toBe(0);

      // Третий продукт на той же позиции → у всех троих по 2 (считаются ДРУГИЕ).
      await new Promise(resolve => setTimeout(resolve, 2)); // id в моке — от времени, не сталкиваем
      const third = call<any>('POST', '/admin/ingredients', {
        name: 'Гречневые хлопья (контракт-тест)',
        unit: 'KG',
        categoryId: 'cat1',
        emisCode: CODE.buckwheat,
      });
      try {
        const after = listProducts().filter(p => p.emisCode === CODE.buckwheat);
        expect(after).toHaveLength(3);
        for (const p of after) expect(p.emisSharedCount).toBe(2);
      } finally {
        call('DELETE', `/admin/ingredients/${third.id}`, null);
      }

      // Отвязка соседа гасит счётчик у оставшегося.
      call('PUT', `/admin/ingredients/${twin.id}`, { name: twin.name, unit: 'KG', emisCode: '' });
      expect(listProducts().find(p => p.name === 'Гречка')?.emisSharedCount).toBe(0);
    } finally {
      call('DELETE', `/admin/ingredients/${twin.id}`, null);
    }
    // За собой убрали: сид снова без общих привязок.
    expect(listProducts().every(p => p.emisSharedCount === 0)).toBe(true);
  });
});
