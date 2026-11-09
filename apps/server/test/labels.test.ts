import { describe, expect, it } from 'vitest';
import type { Label } from '@label-stock/shared';
import { MISSING_ID, createCounterparty, createLabel, readJournal, useTestApp } from './helpers';

describe('позиции: CRUD', () => {
  const context = useTestApp();

  const patch = (id: string, payload: object) =>
    context.app.inject({ method: 'PATCH', url: `/api/labels/${id}`, payload });
  const remove = (id: string) => context.app.inject({ method: 'DELETE', url: `/api/labels/${id}` });
  const restore = (id: string) =>
    context.app.inject({ method: 'POST', url: `/api/labels/${id}/restore` });

  it('создаёт позицию, пишет начальный остаток в журнал как created и отдаёт карточку', async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const label = await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: ' 007 ',
      barcode: ' 4600000000015\n',
      comment: '  первая партия ',
      quantity: 50,
    });
    expect(label).toMatchObject({
      counterparty: { id: counterparty.id, name: 'Ромашка' },
      layoutNumber: '007',
      barcode: '4600000000015',
      printedAt: '2026-11-01',
      quantity: 50,
      comment: 'первая партия',
      version: 1,
      deletedAt: null,
    });
    expect(await readJournal(context.pool, label.id)).toEqual([
      { delta: 50, quantity_after: 50, reason: 'created' },
    ]);

    const card = await context.app.inject({ url: `/api/labels/${label.id}` });
    expect(card.statusCode).toBe(200);
    expect(card.json()).toEqual(label);
  });

  it('позиция с нулевым остатком создаётся без записи в журнале', async () => {
    const label = await createLabel(context.app, { quantity: 0 });
    expect(await readJournal(context.pool, label.id)).toEqual([]);
  });

  it('позиция без номера и штрихкода допустима', async () => {
    const label = await createLabel(context.app, { layoutNumber: '', barcode: '' });
    expect(label).toMatchObject({ layoutNumber: null, barcode: null });
  });

  it('создание с несуществующим counterpartyId → 400 с полем counterpartyId', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: { counterpartyId: MISSING_ID, printedAt: '2026-11-01', quantity: 1 },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { counterpartyId: expect.any(String) },
    });
  });

  it.each([
    ['номер с буквами', { layoutNumber: '12a' }, 'layoutNumber'],
    ['отрицательный остаток', { quantity: -1 }, 'quantity'],
    ['дробный остаток', { quantity: 1.5 }, 'quantity'],
    ['остаток больше int32', { quantity: 2_147_483_648 }, 'quantity'],
    ['несуществующая дата', { printedAt: '2026-02-29' }, 'printedAt'],
    ['длинный штрихкод', { barcode: '1'.repeat(65) }, 'barcode'],
  ])('создание: %s → 400 с полем в details', async (_name, override, field) => {
    const counterparty = await createCounterparty(context.app);
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: {
        counterpartyId: counterparty.id,
        printedAt: '2026-11-01',
        quantity: 1,
        ...override,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(Object.keys(response.json().details)).toContain(field);
  });

  it('PATCH меняет поля, поднимает version и не трогает остаток', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    const other = await createCounterparty(context.app, 'Лютик');
    const response = await patch(label.id, {
      version: 1,
      counterpartyId: other.id,
      layoutNumber: '42',
      barcode: 'фис',
      printedAt: '2028-02-29',
      comment: 'новый',
      quantity: 999,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      counterparty: { id: other.id, name: 'Лютик' },
      layoutNumber: '42',
      barcode: 'abc',
      printedAt: '2028-02-29',
      comment: 'новый',
      quantity: 10,
      version: 2,
    });
  });

  it('PATCH с устаревшей version → 409 VERSION_CONFLICT, данные не меняются', async () => {
    const label = await createLabel(context.app, { comment: 'исходный' });
    expect((await patch(label.id, { version: 1, comment: 'первый' })).statusCode).toBe(200);

    const stale = await patch(label.id, { version: 1, comment: 'второй' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('VERSION_CONFLICT');
    const card = await context.app.inject({ url: `/api/labels/${label.id}` });
    expect(card.json<Label>()).toMatchObject({ comment: 'первый', version: 2 });
  });

  it('PATCH с несуществующим counterpartyId → 400', async () => {
    const label = await createLabel(context.app);
    const response = await patch(label.id, { version: 1, counterpartyId: MISSING_ID });
    expect(response.statusCode).toBe(400);
    expect(response.json().details).toHaveProperty('counterpartyId');
  });

  it('PATCH удалённой позиции → 409 LABEL_DELETED', async () => {
    const label = await createLabel(context.app);
    expect((await remove(label.id)).statusCode).toBe(204);
    const response = await patch(label.id, { version: 2, comment: 'x' });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('LABEL_DELETED');
  });

  it('удаление мягкое: карточка остаётся с deletedAt, повторное удаление не ошибка', async () => {
    const label = await createLabel(context.app);
    expect((await remove(label.id)).statusCode).toBe(204);
    expect((await remove(label.id)).statusCode).toBe(204);
    const card = await context.app.inject({ url: `/api/labels/${label.id}` });
    expect(card.json<Label>().deletedAt).not.toBeNull();
  });

  it('восстановление возвращает позицию в активные', async () => {
    const label = await createLabel(context.app);
    await remove(label.id);
    const response = await restore(label.id);
    expect(response.statusCode).toBe(200);
    expect(response.json<Label>().deletedAt).toBeNull();
  });

  it('восстановление активной позиции ничего не ломает', async () => {
    const label = await createLabel(context.app);
    const response = await restore(label.id);
    expect(response.statusCode).toBe(200);
    expect(response.json<Label>().version).toBe(label.version);
  });

  describe.each([
    ['GET', (id: string) => ({ method: 'GET' as const, url: `/api/labels/${id}` })],
    [
      'PATCH',
      (id: string) => ({
        method: 'PATCH' as const,
        url: `/api/labels/${id}`,
        payload: { version: 1 },
      }),
    ],
    ['DELETE', (id: string) => ({ method: 'DELETE' as const, url: `/api/labels/${id}` })],
    ['restore', (id: string) => ({ method: 'POST' as const, url: `/api/labels/${id}/restore` })],
    [
      'movements GET',
      (id: string) => ({ method: 'GET' as const, url: `/api/labels/${id}/movements` }),
    ],
    [
      'movements POST',
      (id: string) => ({
        method: 'POST' as const,
        url: `/api/labels/${id}/movements`,
        payload: { reason: 'consumption', delta: -1 },
      }),
    ],
  ])('%s по ID', (_name, request) => {
    it.each(['abc', '123', "1'%20OR%20'1'='1", '00000000-0000-0000-0000-00000000000g'])(
      'невалидный UUID %s → 400',
      async (id) => {
        const response = await context.app.inject(request(id));
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('VALIDATION_ERROR');
      },
    );

    it('несуществующий ID → 404', async () => {
      const response = await context.app.inject(request(MISSING_ID));
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });
  });
});
