import { describe, expect, it } from 'vitest';
import { INT32_MAX, type MovementResult } from '@label-stock/shared';
import { createLabel, postMovement, readJournal, readQuantity, useTestApp } from './helpers';

describe('движения остатка', () => {
  const context = useTestApp();

  const apply = async (labelId: string, payload: object, expectedStatus = 201) => {
    const response = await postMovement(context.app, labelId, payload);
    expect(response.statusCode, response.body).toBe(expectedStatus);
    return response.json<MovementResult>();
  };

  it('списание уменьшает остаток и пишет запись с quantityAfter и комментарием', async () => {
    const label = await createLabel(context.app, { quantity: 100 });
    const result = await apply(label.id, { reason: 'consumption', delta: -30, comment: ' заказ ' });
    expect(result.label.quantity).toBe(70);
    expect(result.movement).toMatchObject({
      labelId: label.id,
      delta: -30,
      quantityAfter: 70,
      reason: 'consumption',
      comment: 'заказ',
    });
  });

  it('списание до нуля разрешено', async () => {
    const label = await createLabel(context.app, { quantity: 5 });
    expect((await apply(label.id, { reason: 'consumption', delta: -5 })).label.quantity).toBe(0);
  });

  it('списание больше остатка → 422, остаток и журнал не меняются', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    const response = await postMovement(context.app, label.id, {
      reason: 'consumption',
      delta: -11,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('NEGATIVE_STOCK');
    expect(await readQuantity(context.pool, label.id)).toBe(10);
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('отрицательная correction больше остатка → 422', async () => {
    const label = await createLabel(context.app, { quantity: 1 });
    const response = await postMovement(context.app, label.id, { reason: 'correction', delta: -2 });
    expect(response.statusCode).toBe(422);
    expect(await readQuantity(context.pool, label.id)).toBe(1);
  });

  it('переполнение int32 через допечатку → 422 без 500, остаток прежний', async () => {
    const label = await createLabel(context.app, { quantity: INT32_MAX });
    const response = await postMovement(context.app, label.id, { reason: 'print', delta: 1 });
    expect(response.statusCode).toBe(422);
    expect(await readQuantity(context.pool, label.id)).toBe(INT32_MAX);
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('допечатка с printedAt меняет дату и поднимает version', async () => {
    const label = await createLabel(context.app, { quantity: 10, printedAt: '2026-01-01' });
    const result = await apply(label.id, { reason: 'print', delta: 90, printedAt: '2026-11-09' });
    expect(result.label).toMatchObject({ quantity: 100, printedAt: '2026-11-09', version: 2 });
    expect(result.movement).toMatchObject({ delta: 90, reason: 'print' });
  });

  it('допечатка без printedAt оставляет дату', async () => {
    const label = await createLabel(context.app, { quantity: 10, printedAt: '2026-01-01' });
    const result = await apply(label.id, { reason: 'print', delta: 5 });
    expect(result.label).toMatchObject({ quantity: 15, printedAt: '2026-01-01' });
  });

  it('после допечатки с датой старая version в PATCH → 409', async () => {
    const label = await createLabel(context.app);
    await apply(label.id, { reason: 'print', delta: 1, printedAt: '2026-11-09' });
    const response = await context.app.inject({
      method: 'PATCH',
      url: `/api/labels/${label.id}`,
      payload: { version: label.version, printedAt: '2026-01-01' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('VERSION_CONFLICT');
  });

  it('инвентаризация пишет пересчитанную дельту', async () => {
    const label = await createLabel(context.app, { quantity: 100 });
    const down = await apply(label.id, { reason: 'inventory', setQuantity: 37 });
    expect(down.movement).toMatchObject({ delta: -63, quantityAfter: 37, reason: 'inventory' });
    const up = await apply(label.id, { reason: 'inventory', setQuantity: 50 });
    expect(up.movement).toMatchObject({ delta: 13, quantityAfter: 50 });
    expect(up.label.quantity).toBe(50);
  });

  it('инвентаризация на то же значение → movement null, журнал не пополняется', async () => {
    const label = await createLabel(context.app, { quantity: 42 });
    const result = await apply(label.id, { reason: 'inventory', setQuantity: 42 });
    expect(result.movement).toBeNull();
    expect(result.label.quantity).toBe(42);
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('инвентаризация до нуля', async () => {
    const label = await createLabel(context.app, { quantity: 3 });
    expect((await apply(label.id, { reason: 'inventory', setQuantity: 0 })).label.quantity).toBe(0);
  });

  it.each([
    ['consumption', { reason: 'consumption', delta: -1 }],
    ['print', { reason: 'print', delta: 1 }],
    ['correction', { reason: 'correction', delta: 1 }],
    ['inventory', { reason: 'inventory', setQuantity: 1 }],
  ])('%s удалённой позиции → 409 LABEL_DELETED, остаток не меняется', async (_name, payload) => {
    const label = await createLabel(context.app, { quantity: 10 });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` });
    const response = await postMovement(context.app, label.id, payload);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('LABEL_DELETED');
    expect(await readQuantity(context.pool, label.id)).toBe(10);
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it.each([
    ['consumption с положительной дельтой', { reason: 'consumption', delta: 5 }],
    ['print с отрицательной дельтой', { reason: 'print', delta: -5 }],
    ['correction 0', { reason: 'correction', delta: 0 }],
    ['created через API', { reason: 'created', delta: 5 }],
    ['неизвестный reason', { reason: 'theft', delta: -1 }],
    ['без reason', { delta: -1 }],
    ['дельта строкой', { reason: 'consumption', delta: '-1' }],
    ['дробная дельта', { reason: 'consumption', delta: -0.5 }],
    ['inventory с отрицательным setQuantity', { reason: 'inventory', setQuantity: -1 }],
  ])('%s → 400, остаток не меняется', async (_name, payload) => {
    const label = await createLabel(context.app, { quantity: 10 });
    const response = await postMovement(context.app, label.id, payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    expect(await readQuantity(context.pool, label.id)).toBe(10);
  });

  it('история: новые сверху, с пагинацией', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    await apply(label.id, { reason: 'consumption', delta: -1 });
    await apply(label.id, { reason: 'print', delta: 5 });

    const all = await context.app.inject({ url: `/api/labels/${label.id}/movements` });
    expect(all.json().items.map((item: { delta: number }) => item.delta)).toEqual([5, -1, 10]);
    expect(all.json().total).toBe(3);

    const second = await context.app.inject({
      url: `/api/labels/${label.id}/movements`,
      query: { page: '2', pageSize: '2' },
    });
    expect(second.json()).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(second.json().items.map((item: { delta: number }) => item.delta)).toEqual([10]);
  });

  it('история удалённой позиции доступна', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` });
    const response = await context.app.inject({ url: `/api/labels/${label.id}/movements` });
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(1);
  });
});
