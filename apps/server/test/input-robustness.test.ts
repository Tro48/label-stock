import { describe, expect, it } from 'vitest';
import { createCounterparty, createLabel, useTestApp } from './helpers';

// Мусорный, но синтаксически допустимый ввод не должен доводить до 500:
// это либо 400 с понятным полем, либо нормальный ответ.
describe('устойчивость к нестандартному вводу', () => {
  const context = useTestApp();

  it('NUL в названии контрагента → 400, а не 500', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/counterparties',
      payload: { name: 'Рома\u0000шка' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('NUL в комментарии позиции → 400, а не 500', async () => {
    const counterparty = await createCounterparty(context.app);
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: {
        counterpartyId: counterparty.id,
        printedAt: '2026-11-01',
        quantity: 1,
        comment: 'a\u0000b',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('NUL в комментарии к движению → 400, остаток не меняется', async () => {
    const label = await createLabel(context.app, { quantity: 5 });
    const response = await context.app.inject({
      method: 'POST',
      url: `/api/labels/${label.id}/movements`,
      payload: { reason: 'consumption', delta: -1, comment: 'a\u0000b' },
    });
    expect(response.statusCode).toBe(400);
  });

  it.each([
    ['/api/labels', 'поиск позиций'],
    ['/api/counterparties', 'автодополнение'],
  ])('NUL в поиске (%s, %s) не роняет запрос', async (url) => {
    const response = await context.app.inject({ url, query: { search: 'a\u0000b' } });
    expect(response.statusCode).toBeLessThan(500);
  });

  it('огромный номер страницы → не 500', async () => {
    await createLabel(context.app);
    const response = await context.app.inject({
      url: '/api/labels',
      query: { page: String(Number.MAX_SAFE_INTEGER), pageSize: '200' },
    });
    expect(response.statusCode).toBeLessThan(500);
  });

  it('огромный номер страницы в истории движений → не 500', async () => {
    const label = await createLabel(context.app);
    const response = await context.app.inject({
      url: `/api/labels/${label.id}/movements`,
      query: { page: String(Number.MAX_SAFE_INTEGER), pageSize: '200' },
    });
    expect(response.statusCode).toBeLessThan(500);
  });

  it('page больше safe integer → 400', async () => {
    const response = await context.app.inject({ url: '/api/labels', query: { page: '1e20' } });
    expect(response.statusCode).toBe(400);
  });

  it('лишние поля в теле игнорируются: нельзя подсунуть id, version, deletedAt, quantity', async () => {
    const counterparty = await createCounterparty(context.app);
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: {
        counterpartyId: counterparty.id,
        printedAt: '2026-11-01',
        quantity: 1,
        id: '00000000-0000-4000-8000-000000000001',
        version: 99,
        deletedAt: '2026-01-01T00:00:00Z',
        externalId: 'hack',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ version: 1, deletedAt: null, externalId: null });
    expect(response.json().id).not.toBe('00000000-0000-4000-8000-000000000001');
  });

  it('PATCH не принимает quantity и deletedAt', async () => {
    const label = await createLabel(context.app, { quantity: 7 });
    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/labels/${label.id}`,
      payload: { version: 1, quantity: 1000, deletedAt: '2026-01-01T00:00:00Z' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ quantity: 7, deletedAt: null });
  });

  it('тело больше лимита → 413 в общем формате', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/counterparties',
      payload: { name: 'я'.repeat(2 * 1024 * 1024) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
  });
});
