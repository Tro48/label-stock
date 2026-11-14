import { describe, expect, it } from 'vitest';
import { createCounterparty, createLabel, useTestApp } from './helpers';

describe('позиции: уникальность номера макета и штрихкода', () => {
  const context = useTestApp();

  const post = async (payload: object) => {
    const counterparty = await createCounterparty(context.app);
    return context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: {
        counterpartyId: counterparty.id,
        printedAt: '2026-11-01',
        quantity: 1,
        ...payload,
      },
    });
  };
  const remove = (id: string) => context.app.inject({ method: 'DELETE', url: `/api/labels/${id}` });
  const restore = (id: string) =>
    context.app.inject({ method: 'POST', url: `/api/labels/${id}/restore` });

  it('дубль штрихкода → 409 с field и conflictingId', async () => {
    const existing = await createLabel(context.app, { barcode: 'ФИС 123' });
    const response = await post({ barcode: 'ABC123' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'DUPLICATE',
      details: { field: 'barcode', conflictingId: existing.id },
    });
  });

  it('дубль номера макета → не 409, а слияние с занявшей позицией', async () => {
    const existing = await createLabel(context.app, { layoutNumber: '123' });
    const response = await post({ layoutNumber: ' 123 ' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      merged: true,
      label: { id: existing.id, layoutNumber: '123', quantity: 101 },
      movement: { delta: 1, reason: 'print' },
    });
  });

  it('00123 и 123 — разные номера, не дубль', async () => {
    await createLabel(context.app, { layoutNumber: '00123' });
    expect((await post({ layoutNumber: '123' })).statusCode).toBe(201);
  });

  it('штрихкоды в разном регистре — разные', async () => {
    await createLabel(context.app, { barcode: 'abc' });
    expect((await post({ barcode: 'ABC' })).statusCode).toBe(201);
  });

  it('несколько позиций без номера и штрихкода не конфликтуют', async () => {
    await createLabel(context.app, { layoutNumber: null, barcode: null });
    expect((await post({ layoutNumber: '', barcode: '' })).statusCode).toBe(201);
  });

  it('после мягкого удаления номер и штрихкод свободны', async () => {
    const old = await createLabel(context.app, { layoutNumber: '777', barcode: 'X1' });
    await remove(old.id);
    expect((await post({ layoutNumber: '777', barcode: 'X1' })).statusCode).toBe(201);
  });

  it.each([
    ['номер', 'layoutNumber', { layoutNumber: '555' }],
    ['штрихкод', 'barcode', { barcode: 'DUP' }],
  ])(
    'восстановление с занятым полем (%s) → 409 и позиция остаётся удалённой',
    async (_name, field, values) => {
      const old = await createLabel(context.app, values);
      await remove(old.id);
      const fresh = await createLabel(context.app, values);

      const response = await restore(old.id);
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        code: 'DUPLICATE',
        details: { field, conflictingId: fresh.id },
      });
      const card = await context.app.inject({ url: `/api/labels/${old.id}` });
      expect(card.json().deletedAt).not.toBeNull();
    },
  );

  it('PATCH на занятый номер → 409 с conflictingId чужой позиции', async () => {
    const taken = await createLabel(context.app, { layoutNumber: '10' });
    const label = await createLabel(context.app, { layoutNumber: '11' });
    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/labels/${label.id}`,
      payload: { version: 1, layoutNumber: '10' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().details).toEqual({ field: 'layoutNumber', conflictingId: taken.id });
  });

  it('PATCH со своим же номером и штрихкодом — не дубль', async () => {
    const label = await createLabel(context.app, { layoutNumber: '10', barcode: 'SELF' });
    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/labels/${label.id}`,
      payload: { version: 1, layoutNumber: '10', barcode: 'SELF' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('параллельное создание с одним штрихкодом: ровно одна позиция, остальные 409', async () => {
    const counterparty = await createCounterparty(context.app);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        context.app.inject({
          method: 'POST',
          url: '/api/labels',
          payload: {
            counterpartyId: counterparty.id,
            printedAt: '2026-11-01',
            quantity: 1,
            barcode: 'RACE',
          },
        }),
      ),
    );
    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(9);
    const { rows } = await context.pool.query(
      "SELECT count(*)::int AS n FROM labels WHERE barcode = 'RACE'",
    );
    expect(rows[0].n).toBe(1);
    // Журнал не должен содержать записей от откаченных вставок.
    const journal = await context.pool.query('SELECT count(*)::int AS n FROM stock_movements');
    expect(journal.rows[0].n).toBe(1);
  });
});
