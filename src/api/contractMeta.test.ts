/**
 * CONTRACT-META: форма GET /meta — mock ↔ real (подзадача 10 аудита 02.11.2026, BL-65).
 *
 * Эталон — `MetaController.getMeta()`: LinkedHashMap {version, build, db, application},
 * все значения — строки; `build` — фиксированный момент старта приложения (startedAt),
 * а не now() на каждый запрос. Мок обязан держать ту же форму: version — строка 'mock'
 * (единственный источник правды о номере версии — backend/pom.xml → app.version;
 * дубль номера в моке дрейфовал: было '1.0.0' при 1.0.1 в pom), build — статичный
 * момент старта mock-сессии.
 *
 * Запуск: `npm run test:contract` или `npx vitest run src/api/contractMeta.test.ts`.
 */
import { describe, it, expect } from 'vitest';

import { mockServer } from './mockServer';

/** Ключи real-ответа в порядке MetaController (LinkedHashMap). */
const REAL_META_KEYS = ['version', 'build', 'db', 'application'];

const meta = () => mockServer.handleRequest<any>('GET', '/meta');

describe('CONTRACT-META: /meta mock ↔ real', () => {
  it('те же ключи в том же порядке, все значения — строки', () => {
    const m = meta();
    expect(Object.keys(m)).toEqual(REAL_META_KEYS);
    for (const k of REAL_META_KEYS) {
      expect(typeof m[k], `meta.${k}`).toBe('string');
    }
  });

  it("version — 'mock' (номер релиза живёт только в backend/pom.xml)", () => {
    expect(meta().version).toBe('mock');
  });

  it('build — статичный момент старта сессии (паритет с backend startedAt)', () => {
    const a = meta();
    const b = meta();
    expect(a.build).toBe(b.build);
    // валидная ISO-дата (real отдаёт LocalDateTime.toString() — тоже ISO-8601)
    expect(new Date(a.build).toISOString()).toBe(a.build);
  });
});
