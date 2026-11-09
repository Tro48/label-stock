import { describe, expect, it } from 'vitest';
import { createLabel, useTestApp } from './helpers';

describe('smoke', () => {
  const context = useTestApp();

  it('создаёт позицию, списывает и отдаёт историю', async () => {
    const label = await createLabel(context.app, { layoutNumber: '00123', barcode: 'ФИС123' });
    expect(label).toMatchObject({ layoutNumber: '00123', barcode: 'ABC123', quantity: 100 });

    const movement = await context.app.inject({
      method: 'POST',
      url: `/api/labels/${label.id}/movements`,
      payload: { reason: 'consumption', delta: -30 },
    });
    expect(movement.statusCode).toBe(201);
    expect(movement.json().label.quantity).toBe(70);

    const history = await context.app.inject({ url: `/api/labels/${label.id}/movements` });
    expect(history.json().items.map((item: { delta: number }) => item.delta)).toEqual([-30, 100]);

    const health = await context.app.inject({ url: '/api/health' });
    expect(health.statusCode).toBe(200);

    const docs = await context.app.inject({ url: '/api/docs/json' });
    expect(docs.statusCode).toBe(200);
  });
});
