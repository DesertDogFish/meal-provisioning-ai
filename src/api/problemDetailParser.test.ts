/**
 * Подзадача 24 (план plans/done/2026-10-29-full-audit.md): unit-тесты problemDetailParser —
 * ProblemDetail → ApiClientError, 204/пустое тело → null, фикс-фолбэки (Fix-15).
 */
import { describe, expect, it } from 'vitest';
import { ApiClientError, readEnvelope } from './problemDetailParser';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('readEnvelope', () => {
  it('2xx JSON → распарсенное тело', async () => {
    await expect(readEnvelope(json(200, { id: '42', name: 'x' })))
      .resolves.toEqual({ id: '42', name: 'x' });
  });

  it('204 → null', async () => {
    await expect(readEnvelope(new Response(null, { status: 204 }))).resolves.toBeNull();
  });

  it('200 с пустым телом → null (Fix-15: «Unexpected end of JSON input»)', async () => {
    await expect(readEnvelope(new Response('', { status: 200 }))).resolves.toBeNull();
    await expect(readEnvelope(new Response('   \n', { status: 200 }))).resolves.toBeNull();
  });

  it('ответ-фейк без text() → фолбэк на .json()', async () => {
    const fake = {
      ok: true,
      status: 200,
      json: async () => ({ legacy: true })
    } as unknown as Response;
    await expect(readEnvelope(fake)).resolves.toEqual({ legacy: true });
  });

  it('4xx c ProblemDetail → ApiClientError с полями (errors/usedIn сохранены)', async () => {
    const problem = {
      status: 409,
      type: 'about:blank',
      title: 'Conflict',
      detail: 'Resource in use',
      instance: '/admin/products/7',
      errors: [{ field: 'name', message: 'уже занято', rejectedValue: 'Соль' }],
      usedIn: [{ resourceType: 'RECIPE', resourceId: 3, resourceName: 'Каша' }]
    };
    const promise = readEnvelope(json(409, problem));
    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    try {
      await promise;
    } catch (e) {
      const err = e as ApiClientError;
      expect(err.name).toBe('ApiClientError');
      expect(err.message).toBe('Resource in use'); // detail приоритетнее title
      expect(err.error.usedIn?.[0]).toEqual({ resourceType: 'RECIPE', resourceId: 3, resourceName: 'Каша' });
      expect(err.error.errors?.[0].field).toBe('name');
    }
  });

  it('ошибка без detail → message = title', async () => {
    await expect(readEnvelope(json(404, { status: 404, title: 'Not Found' })))
      .rejects.toThrow('Not Found');
  });

  it('не-JSON тело ошибки → Unknown Error + statusText', async () => {
    const res = new Response('<html>boom</html>', { status: 502, statusText: 'Bad Gateway' });
    await expect(readEnvelope(res)).rejects.toMatchObject({
      name: 'ApiClientError',
      error: { status: 502, title: 'Unknown Error', detail: 'Bad Gateway' }
    });
  });
});
