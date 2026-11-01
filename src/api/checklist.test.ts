/**
 * KB-15: контракт клиента серверных отметок «взято» чеклиста похода.
 * Ключ клиента — '<ingredientId>@<neededStamp>' (паритет с checklistRowKey).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), del: vi.fn() },
}));

import { api } from './client';
import {
  boughtKey, parseBoughtKey, isSendableBoughtKey, getServerBought, syncServerBought,
} from './checklist';

describe('checklist — ключи отметок «взято»', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('boughtKey: строка и число дают один и тот же ключ', () => {
    expect(boughtKey('12', 5000)).toBe('12@5000');
    expect(boughtKey(12, 5000)).toBe('12@5000');
    expect(boughtKey('ing7', 0)).toBe('ing7@0');
  });

  it('parseBoughtKey: round-trip с checklistRowKey', () => {
    const key = boughtKey('12', 5000);
    expect(parseBoughtKey(key)).toEqual({ ingredientId: '12', neededStamp: 5000 });
    const p = parseBoughtKey(key)!;
    expect(boughtKey(p.ingredientId, p.neededStamp)).toBe(key);
  });

  it('parseBoughtKey: split по ПЕРВОМУ @ — лишний @ делает ключ битым', () => {
    // штамп после первого '@' обязан быть числом: 'b@500' → не число → null
    expect(parseBoughtKey('a@b@500')).toBeNull();
  });

  it('parseBoughtKey: neededStamp=0 — валидный ключ (нулевая потребность)', () => {
    // Аудит KB-15 (MAJOR A): нулевая потребность легальна («взять всё» кладёт
    // '<id>@0'), backend принимает @PositiveOrZero — штамп 0 не отбрасываем.
    expect(parseBoughtKey('12@0')).toEqual({ ingredientId: '12', neededStamp: 0 });
    expect(parseBoughtKey('ing7@0')).toEqual({ ingredientId: 'ing7', neededStamp: 0 });
    expect(isSendableBoughtKey('12@0')).toBe(true);
  });

  it('parseBoughtKey: отрицательный/дробный штамп → null (неотправляемый ключ)', () => {
    // Решение по MAJOR A: такие штампы НЕ считаются валидными ключами вовсе —
    // один неотправляемый элемент валил бы весь идемпотентный PUT (400).
    expect(parseBoughtKey('12@-5000')).toBeNull();
    expect(parseBoughtKey('12@2000.5')).toBeNull();
    expect(parseBoughtKey('12@-0')).toBeNull();
    expect(isSendableBoughtKey('12@-5000')).toBe(false);
    expect(isSendableBoughtKey('12@2000.5')).toBe(false);
    expect(isSendableBoughtKey('12@5000')).toBe(true);
    expect(isSendableBoughtKey('broken')).toBe(false);
  });

  it('parseBoughtKey: битые ключи → null', () => {
    expect(parseBoughtKey('12')).toBeNull();       // нет '@'
    expect(parseBoughtKey('@5000')).toBeNull();    // пустой id
    expect(parseBoughtKey('12@')).toBeNull();      // пустой штамп
    expect(parseBoughtKey('12@abc')).toBeNull();   // не число
    expect(parseBoughtKey('12@NaN')).toBeNull();
    expect(parseBoughtKey('12@0x10')).toBeNull();  // не десятичная запись
    expect(parseBoughtKey('')).toBeNull();
    expect(parseBoughtKey(undefined as unknown as string)).toBeNull();
  });
});

describe('checklist — GET /trips/:id/checklist-bought', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('читает объектную форму [{ingredientId, neededStamp}] как ключи', async () => {
    (api.get as any).mockResolvedValue([
      { ingredientId: 12, neededStamp: 5000 },
      { ingredientId: '7', neededStamp: 2000 },
    ]);
    expect(await getServerBought('t1')).toEqual(['12@5000', '7@2000']);
    expect(api.get).toHaveBeenCalledWith('/trips/t1/checklist-bought');
  });

  it('пустой набор — это [] (не null): сервер доступен, отметок нет', async () => {
    (api.get as any).mockResolvedValue([]);
    expect(await getServerBought('t1')).toEqual([]);
  });

  it('пропускает битые элементы и читает legacy-строки-ключи', async () => {
    (api.get as any).mockResolvedValue([
      null,
      { ingredientId: null, neededStamp: 1 },
      { ingredientId: 1, neededStamp: 'xyz' },
      '5@1000',
      'broken',
    ]);
    expect(await getServerBought('t1')).toEqual(['5@1000']);
  });

  it('ошибка сети → null (НЕ пустой набор: офлайн-кэш нельзя затирать)', async () => {
    (api.get as any).mockRejectedValue(new Error('network'));
    expect(await getServerBought('t1')).toBeNull();
  });

  it('неожиданная форма ответа (не массив) → null: неизвестный формат = недоступность', async () => {
    // Пустой набор нельзя «выдумывать» из чужого формата: refresh принял бы []
    // за истину и стёр серверные отметки в локальном кэше (аудит KB-15, п.E).
    (api.get as any).mockResolvedValue({ items: [] });
    expect(await getServerBought('t1')).toBeNull();
    (api.get as any).mockResolvedValue(null);
    expect(await getServerBought('t1')).toBeNull();
    (api.get as any).mockResolvedValue('oops');
    expect(await getServerBought('t1')).toBeNull();
  });
});

describe('checklist — PUT /trips/:id/checklist-bought (идемпотентная замена)', () => {
  let warn: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // диагностика (R10) не должна засорять вывод прогона
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => { warn.mockRestore(); });

  it('числовые id уходят числом, строковые (mock-каталог) — строкой как есть', async () => {
    // Аудит KB-15 (MAJOR B): mock принимает 'ing7' (String(p.id) === String(id)),
    // поэтому набор из ручных позиций/замен теперь синхронизируется. На боевом
    // backend id числовые — форма payload для них не изменилась.
    (api.put as any).mockResolvedValue([]);
    const res = await syncServerBought('t1', ['12@5000', 'ing7@2000']);
    expect(res).toEqual({ ok: true, sent: 2, rejected: [] });
    expect(api.put).toHaveBeenCalledWith('/trips/t1/checklist-bought', {
      items: [
        { ingredientId: 12, neededStamp: 5000 },
        { ingredientId: 'ing7', neededStamp: 2000 },
      ],
    });
  });

  it('ключ <id>@0 не блокирует остальные и уходит в payload', async () => {
    // neededStamp=0 легален (нулевая потребность); backend — @PositiveOrZero.
    (api.put as any).mockResolvedValue([]);
    const res = await syncServerBought('t1', ['12@0', '13@2000']);
    expect(res.ok).toBe(true);
    expect(res.rejected).toEqual([]);
    expect(api.put).toHaveBeenCalledWith('/trips/t1/checklist-bought', {
      items: [
        { ingredientId: 12, neededStamp: 0 },
        { ingredientId: 13, neededStamp: 2000 },
      ],
    });
  });

  it('отрицательный/дробный штамп не уходит и не валит остальные', async () => {
    (api.put as any).mockResolvedValue([]);
    const res = await syncServerBought('t1', ['12@5000', '9@-100', '10@2000.5']);
    expect(res.ok).toBe(true);
    expect(res.sent).toBe(1);
    expect(res.rejected).toEqual(['9@-100', '10@2000.5']); // отдаём вызывающему для вычистки
    expect(api.put).toHaveBeenCalledWith('/trips/t1/checklist-bought', {
      items: [{ ingredientId: 12, neededStamp: 5000 }],
    });
    expect(warn).toHaveBeenCalled(); // диагностика вместо немой ошибки
  });

  it('битые ключи не попадают в payload', async () => {
    (api.put as any).mockResolvedValue([]);
    const res = await syncServerBought('t1', ['12@5000', 'broken', '9@x']);
    expect(res.ok).toBe(true);
    expect(res.rejected).toEqual(['broken', '9@x']);
    expect(api.put).toHaveBeenCalledWith('/trips/t1/checklist-bought', {
      items: [{ ingredientId: 12, neededStamp: 5000 }],
    });
  });

  it('идемпотентность: повторная отправка того же набора — тот же payload', async () => {
    (api.put as any).mockResolvedValue([]);
    const keys = new Set(['12@5000']);
    await syncServerBought('t1', keys);
    await syncServerBought('t1', keys);
    const calls = (api.put as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
  });

  it('вообще нет отправляемых ключей → PUT не отправляется (пустая замена стёрла бы всё)', async () => {
    // Пустой id и битые штампы — отправлять нечего: сервер не должен получить
    // пустой ПОЛНЫЙ набор, иначе серверные отметки были бы стёрты.
    (api.put as any).mockResolvedValue([]);
    const res = await syncServerBought('t1', ['@500', 'broken', '12@-1']);
    expect(res.ok).toBe(false);
    expect(res.sent).toBe(0);
    expect(api.put).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('пустой набор — это осознанная очистка: PUT с items: [] отправляется', async () => {
    (api.put as any).mockResolvedValue([]);
    expect((await syncServerBought('t1', [])).ok).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/trips/t1/checklist-bought', { items: [] });
  });

  it('ошибка сети → ok:false, не бросает, пишет диагностику (статус + tripId)', async () => {
    (api.put as any).mockRejectedValue({ status: 400, detail: 'Each item requires ingredientId' });
    const res = await syncServerBought('t1', ['12@5000']);
    expect(res.ok).toBe(false);
    const logged = warn.mock.calls.map((c: any[]) => c.join(' ')).join(' | ');
    expect(logged).toContain('t1');
    expect(logged).toContain('400');
  });
});
