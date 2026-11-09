import { describe, expect, it } from 'vitest';
import { createLabel, postMovement, readJournal, readQuantity, useTestApp } from './helpers';

describe('гонки при изменении остатка', () => {
  const context = useTestApp();

  const consumeInParallel = (labelId: string, deltas: number[]) =>
    Promise.all(
      deltas.map((delta) => postMovement(context.app, labelId, { reason: 'consumption', delta })),
    );

  it('20 параллельных списаний: итог строго равен сумме, журнал = числу успешных', async () => {
    const label = await createLabel(context.app, { quantity: 1000 });
    const deltas = Array.from({ length: 20 }, (_, index) => -(index + 1));
    const responses = await consumeInParallel(label.id, deltas);

    expect(responses.map((response) => response.statusCode)).toEqual(Array(20).fill(201));
    const consumed = deltas.reduce((sum, delta) => sum + delta, 0);
    expect(await readQuantity(context.pool, label.id)).toBe(1000 + consumed);

    const journal = await readJournal(context.pool, label.id);
    expect(journal.filter((row) => row.reason === 'consumption')).toHaveLength(20);
    expect(journal.reduce((sum, row) => sum + row.delta, 0)).toBe(1000 + consumed);
  });

  it('остаток 10, 20 списаний по 1: ровно 10 успешных, 10 × 422, остаток 0', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    const responses = await consumeInParallel(label.id, Array(20).fill(-1));

    const statuses = responses.map((response) => response.statusCode);
    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    expect(statuses.filter((status) => status === 422)).toHaveLength(10);
    for (const response of responses.filter((item) => item.statusCode === 422)) {
      expect(response.json().code).toBe('NEGATIVE_STOCK');
    }
    expect(await readQuantity(context.pool, label.id)).toBe(0);

    const journal = await readJournal(context.pool, label.id);
    expect(journal.filter((row) => row.reason === 'consumption')).toHaveLength(10);
    // quantity_after у успешных списаний — каждое значение от 9 до 0 ровно по разу.
    const after = journal
      .filter((row) => row.reason === 'consumption')
      .map((row) => row.quantity_after)
      .sort((a, b) => a - b);
    expect(after).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('инвентаризация посреди параллельных списаний: сумма дельт журнала = остатку', async () => {
    const label = await createLabel(context.app, { quantity: 500 });
    const consumptions = Array.from({ length: 15 }, () =>
      postMovement(context.app, label.id, { reason: 'consumption', delta: -3 }),
    );
    const inventory = postMovement(context.app, label.id, {
      reason: 'inventory',
      setQuantity: 200,
    });
    const moreConsumptions = Array.from({ length: 5 }, () =>
      postMovement(context.app, label.id, { reason: 'consumption', delta: -2 }),
    );
    const responses = await Promise.all([...consumptions, inventory, ...moreConsumptions]);
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);

    const quantity = await readQuantity(context.pool, label.id);
    const journal = await readJournal(context.pool, label.id);
    expect(journal.reduce((sum, row) => sum + row.delta, 0)).toBe(quantity);
    expect(journal).toHaveLength(1 + 15 + 5 + 1);
  });

  it('параллельные инвентаризации и допечатки сходятся с журналом', async () => {
    const label = await createLabel(context.app, { quantity: 0 });
    const responses = await Promise.all([
      ...Array.from({ length: 5 }, (_, index) =>
        postMovement(context.app, label.id, { reason: 'inventory', setQuantity: (index + 1) * 10 }),
      ),
      ...Array.from({ length: 10 }, () =>
        postMovement(context.app, label.id, { reason: 'print', delta: 7 }),
      ),
    ]);
    expect(responses.every((response) => response.statusCode === 201)).toBe(true);

    const quantity = await readQuantity(context.pool, label.id);
    const journal = await readJournal(context.pool, label.id);
    expect(journal.reduce((sum, row) => sum + row.delta, 0)).toBe(quantity);
    expect(journal.every((row) => row.delta !== 0)).toBe(true);
  });

  it('удаление во время списаний: после удаления остаток не меняется', async () => {
    const label = await createLabel(context.app, { quantity: 100 });
    const consume = () => postMovement(context.app, label.id, { reason: 'consumption', delta: -1 });
    const [before, , after] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, consume)),
      context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` }),
      Promise.all(Array.from({ length: 10 }, consume)),
    ]);
    const movementStatuses = [...before, ...after].map((response) => response.statusCode);
    expect(movementStatuses.every((status) => status === 201 || status === 409)).toBe(true);

    const succeeded = movementStatuses.filter((status) => status === 201).length;
    expect(await readQuantity(context.pool, label.id)).toBe(100 - succeeded);
    const journal = await readJournal(context.pool, label.id);
    expect(journal).toHaveLength(1 + succeeded);
  });
});
