import { describe, expect, it } from 'vitest';
import { STOCK_REQUEST_MAX_ITEMS, type Label, type StockRequestResult } from '@label-stock/shared';
import {
  createCounterparty,
  createLabel,
  createLabelWithObsolete,
  MISSING_ID,
  postStockRequest,
  readJournal,
  readStock,
  useTestApp,
  type TestContext,
} from './helpers';

/** Позиции, упорядоченные по id: сервис обрабатывает их именно в таком порядке. */
async function createSortedLabels(
  context: TestContext,
  count: number,
  stock: { usable: number; obsolete: number } = { usable: 100, obsolete: 0 },
): Promise<Label[]> {
  const counterparty = await createCounterparty(context.app, 'Ромашка');
  const labels: Label[] = [];
  for (let index = 0; index < count; index += 1) {
    labels.push(
      await createLabelWithObsolete(context.app, stock, { counterpartyId: counterparty.id }),
    );
  }
  return labels.sort((a, b) => a.id.localeCompare(b.id));
}

/** Снимок остатков и журналов: после отклонённой заявки он не должен меняться. */
async function snapshot(context: TestContext, labels: readonly Label[]) {
  return Promise.all(
    labels.map(async (label) => ({
      stock: await readStock(context.pool, label.id),
      journal: await readJournal(context.pool, label.id),
    })),
  );
}

describe('заявка на перемещение', () => {
  const context = useTestApp();

  const transfer = (items: { labelId: string; quantity: number }[]) =>
    postStockRequest(context.app, { kind: 'transfer', items });

  it('списывает количество по каждой позиции, пишет transfer в журнал', async () => {
    const [first, second] = await createSortedLabels(context, 2);
    const response = await transfer([
      { labelId: first!.id, quantity: 30 },
      { labelId: second!.id, quantity: 1 },
    ]);
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.kind).toBe('transfer');
    expect(result.items.map((item) => item.label.quantity)).toEqual([70, 99]);
    expect(result.items[0]!.movement).toMatchObject({
      labelId: first!.id,
      delta: -30,
      quantityAfter: 70,
      reason: 'transfer',
      comment: null,
    });
    expect((await readJournal(context.pool, first!.id)).at(-1)).toEqual({
      delta: -30,
      quantity_after: 70,
      reason: 'transfer',
    });
    expect(await readStock(context.pool, second!.id)).toEqual({
      quantity: 99,
      obsoleteQuantity: 0,
    });
  });

  it('createdAt — текущее время в ISO', async () => {
    const [label] = await createSortedLabels(context, 1);
    const before = Date.now();
    const response = await transfer([{ labelId: label!.id, quantity: 1 }]);
    const createdAt = Date.parse(response.json<StockRequestResult>().createdAt);
    expect(createdAt).toBeGreaterThanOrEqual(before - 1000);
    expect(createdAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('ответ в порядке запроса, даже если он обратен порядку id', async () => {
    const labels = await createSortedLabels(context, 3);
    const reversed = [...labels].reverse();
    const response = await transfer(reversed.map((label) => ({ labelId: label.id, quantity: 1 })));
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.items.map((item) => item.label.id)).toEqual(reversed.map((label) => label.id));
    expect(result.items.map((item) => item.movement.labelId)).toEqual(
      reversed.map((label) => label.id),
    );
  });

  it('ровно весь годный остаток — можно, старый макет не тронут', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 15, obsolete: 10 });
    const response = await transfer([{ labelId: label!.id, quantity: 15 }]);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<StockRequestResult>().items[0]!.label).toMatchObject({
      quantity: 10,
      obsoleteQuantity: 10,
    });
  });

  it('на 1 шт. больше годного → 422 OBSOLETE_STOCK с labelId, ничего не списано', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 15, obsolete: 10 });
    const before = await snapshot(context, [label!]);
    const response = await transfer([{ labelId: label!.id, quantity: 16 }]);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'OBSOLETE_STOCK',
      details: { labelId: label!.id },
    });
    expect(await snapshot(context, [label!])).toEqual(before);
  });

  it('больше остатка без старого макета → 422 NEGATIVE_STOCK с labelId', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 5, obsolete: 0 });
    const response = await transfer([{ labelId: label!.id, quantity: 6 }]);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'NEGATIVE_STOCK',
      details: { labelId: label!.id },
    });
  });

  it('несуществующая позиция → 404 с labelId', async () => {
    const response = await transfer([{ labelId: MISSING_ID, quantity: 1 }]);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND', details: { labelId: MISSING_ID } });
  });

  it('удалённая позиция → 409 LABEL_DELETED с labelId, остаток прежний', async () => {
    const [label] = await createSortedLabels(context, 1);
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${label!.id}` });
    const response = await transfer([{ labelId: label!.id, quantity: 1 }]);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'LABEL_DELETED',
      details: { labelId: label!.id },
    });
    expect((await readStock(context.pool, label!.id)).quantity).toBe(100);
  });

  it(`${STOCK_REQUEST_MAX_ITEMS} позиций одной заявкой — граница проходит`, async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const labels = await Promise.all(
      Array.from({ length: STOCK_REQUEST_MAX_ITEMS }, () =>
        createLabel(context.app, { counterpartyId: counterparty.id, quantity: 2 }),
      ),
    );
    const response = await transfer(labels.map((label) => ({ labelId: label.id, quantity: 1 })));
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.items).toHaveLength(STOCK_REQUEST_MAX_ITEMS);
    expect(result.items.every((item) => item.label.quantity === 1)).toBe(true);
  });
});

describe('заявка на утилизацию', () => {
  const context = useTestApp();

  const dispose = (labelIds: string[]) =>
    postStockRequest(context.app, {
      kind: 'disposal',
      items: labelIds.map((labelId) => ({ labelId })),
    });

  it('списывает весь старый макет и обнуляет его, годный остаток остаётся', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 15, obsolete: 10 });
    const response = await dispose([label!.id]);
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.kind).toBe('disposal');
    expect(result.items[0]).toMatchObject({
      label: { id: label!.id, quantity: 15, obsoleteQuantity: 0 },
      movement: { delta: -10, quantityAfter: 15, reason: 'disposal', comment: null },
    });
    expect(await readStock(context.pool, label!.id)).toEqual({
      quantity: 15,
      obsoleteQuantity: 0,
    });
    expect((await readJournal(context.pool, label!.id)).at(-1)).toEqual({
      delta: -10,
      quantity_after: 15,
      reason: 'disposal',
    });
  });

  it('весь остаток — старый макет: после утилизации остаток 0', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 0, obsolete: 8 });
    const response = await dispose([label!.id]);
    expect(response.statusCode, response.body).toBe(201);
    expect(await readStock(context.pool, label!.id)).toEqual({ quantity: 0, obsoleteQuantity: 0 });
  });

  it('после утилизации годный остаток списывается целиком', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 15, obsolete: 10 });
    await dispose([label!.id]);
    const response = await context.app.inject({
      method: 'POST',
      url: `/api/labels/${label!.id}/movements`,
      payload: { reason: 'consumption', delta: -15 },
    });
    expect(response.statusCode, response.body).toBe(201);
  });

  it('нечего утилизировать → 422 VALIDATION_ERROR «Утилизировать нечего» с labelId', async () => {
    const [label] = await createSortedLabels(context, 1);
    const response = await dispose([label!.id]);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Утилизировать нечего',
      details: { labelId: label!.id },
    });
  });

  it('повторная утилизация той же позиции → 422, журнал с одной записью disposal', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 1, obsolete: 4 });
    expect((await dispose([label!.id])).statusCode).toBe(201);
    const again = await dispose([label!.id]);
    expect(again.statusCode).toBe(422);
    const journal = await readJournal(context.pool, label!.id);
    expect(journal.filter((row) => row.reason === 'disposal')).toHaveLength(1);
  });

  it('несуществующая позиция → 404 с labelId', async () => {
    const response = await dispose([MISSING_ID]);
    expect(response.statusCode).toBe(404);
    expect(response.json().details).toEqual({ labelId: MISSING_ID });
  });

  it('удалённая позиция со старым макетом → 409 LABEL_DELETED, старый макет на месте', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 1, obsolete: 4 });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${label!.id}` });
    const response = await dispose([label!.id]);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'LABEL_DELETED',
      details: { labelId: label!.id },
    });
    expect(await readStock(context.pool, label!.id)).toEqual({ quantity: 5, obsoleteQuantity: 4 });
  });

  it('несколько позиций: каждая теряет ровно свой старый макет', async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const small = await createLabelWithObsolete(
      context.app,
      { usable: 1, obsolete: 2 },
      { counterpartyId: counterparty.id },
    );
    const big = await createLabelWithObsolete(
      context.app,
      { usable: 3, obsolete: 50 },
      { counterpartyId: counterparty.id },
    );
    const response = await dispose([big.id, small.id]);
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.items.map((item) => [item.label.id, item.movement.delta])).toEqual([
      [big.id, -50],
      [small.id, -2],
    ]);
  });
});

describe('заявка: некорректный запрос → 400 без изменений', () => {
  const context = useTestApp();

  it.each([
    ['пустой список перемещения', () => ({ kind: 'transfer', items: [] })],
    ['пустой список утилизации', () => ({ kind: 'disposal', items: [] })],
    ['без kind', (id: string) => ({ items: [{ labelId: id, quantity: 1 }] })],
    ['неизвестный kind', (id: string) => ({ kind: 'theft', items: [{ labelId: id }] })],
    ['без items', () => ({ kind: 'transfer' })],
    ['quantity = 0', (id: string) => ({ kind: 'transfer', items: [{ labelId: id, quantity: 0 }] })],
    [
      'отрицательное quantity',
      (id: string) => ({ kind: 'transfer', items: [{ labelId: id, quantity: -5 }] }),
    ],
    [
      'дробное quantity',
      (id: string) => ({ kind: 'transfer', items: [{ labelId: id, quantity: 1.5 }] }),
    ],
    [
      'quantity строкой',
      (id: string) => ({ kind: 'transfer', items: [{ labelId: id, quantity: '1' }] }),
    ],
    ['перемещение без quantity', (id: string) => ({ kind: 'transfer', items: [{ labelId: id }] })],
    ['некорректный uuid', () => ({ kind: 'disposal', items: [{ labelId: 'abc' }] })],
    [
      'дубли labelId',
      (id: string) => ({
        kind: 'transfer',
        items: [
          { labelId: id, quantity: 1 },
          { labelId: id, quantity: 2 },
        ],
      }),
    ],
    [
      `${STOCK_REQUEST_MAX_ITEMS + 1} позиция`,
      (id: string) => ({
        kind: 'transfer',
        items: [
          { labelId: id, quantity: 1 },
          ...Array.from({ length: STOCK_REQUEST_MAX_ITEMS }, (_, index) => ({
            labelId: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
            quantity: 1,
          })),
        ],
      }),
    ],
  ])('%s', async (_name, buildPayload) => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 5 });
    const response = await postStockRequest(context.app, buildPayload(label.id));
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    expect(await readStock(context.pool, label.id)).toEqual({ quantity: 10, obsoleteQuantity: 5 });
    expect(await readJournal(context.pool, label.id)).toHaveLength(2);
  });

  it('битый JSON → 400', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/stock-requests',
      headers: { 'content-type': 'application/json' },
      payload: '{"kind":',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('заявка: атомарность', () => {
  const context = useTestApp();

  it('позиция, обработанная последней, падает — предыдущие не списаны, журнал не тронут', async () => {
    const [first, last] = await createSortedLabels(context, 2, { usable: 10, obsolete: 0 });
    const before = await snapshot(context, [first!, last!]);
    const response = await postStockRequest(context.app, {
      kind: 'transfer',
      items: [
        { labelId: first!.id, quantity: 5 },
        { labelId: last!.id, quantity: 11 },
      ],
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().details).toEqual({ labelId: last!.id });
    expect(await snapshot(context, [first!, last!])).toEqual(before);
  });

  it('позиция обработана первой и падает — следующие не трогаются', async () => {
    const [first, last] = await createSortedLabels(context, 2, { usable: 10, obsolete: 0 });
    const before = await snapshot(context, [first!, last!]);
    const response = await postStockRequest(context.app, {
      kind: 'transfer',
      items: [
        { labelId: last!.id, quantity: 1 },
        { labelId: first!.id, quantity: 11 },
      ],
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().details).toEqual({ labelId: first!.id });
    expect(await snapshot(context, [first!, last!])).toEqual(before);
  });

  it('утилизация: одна позиция без старого макета — остальные не утилизированы', async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const labels = [
      await createLabelWithObsolete(
        context.app,
        { usable: 1, obsolete: 5 },
        { counterpartyId: counterparty.id },
      ),
      await createLabelWithObsolete(
        context.app,
        { usable: 1, obsolete: 7 },
        { counterpartyId: counterparty.id },
      ),
      await createLabel(context.app, { counterpartyId: counterparty.id, quantity: 3 }),
    ];
    const before = await snapshot(context, labels);
    const response = await postStockRequest(context.app, {
      kind: 'disposal',
      items: labels.map((label) => ({ labelId: label.id })),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().details).toEqual({ labelId: labels[2]!.id });
    expect(await snapshot(context, labels)).toEqual(before);
  });

  it('несуществующая позиция в середине заявки — остальные не списаны', async () => {
    const labels = await createSortedLabels(context, 2);
    const before = await snapshot(context, labels);
    const response = await postStockRequest(context.app, {
      kind: 'transfer',
      items: [
        { labelId: labels[0]!.id, quantity: 1 },
        { labelId: MISSING_ID, quantity: 1 },
        { labelId: labels[1]!.id, quantity: 1 },
      ],
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().details).toEqual({ labelId: MISSING_ID });
    expect(await snapshot(context, labels)).toEqual(before);
  });

  it('сбой БД на записи журнала по последней позиции → 500 без деталей, откат всего', async () => {
    const [first, last] = await createSortedLabels(context, 2);
    const before = await snapshot(context, [first!, last!]);
    // Имитация падения зависимости посреди транзакции: INSERT в журнал по второй позиции падает.
    await context.pool.query(`
      CREATE FUNCTION fail_movement_for_test() RETURNS trigger AS $$
      BEGIN
        IF NEW.label_id = '${last!.id}' THEN RAISE EXCEPTION 'test failure'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_movement_for_test BEFORE INSERT ON stock_movements
        FOR EACH ROW EXECUTE FUNCTION fail_movement_for_test();
    `);
    try {
      const response = await postStockRequest(context.app, {
        kind: 'transfer',
        items: [
          { labelId: first!.id, quantity: 1 },
          { labelId: last!.id, quantity: 1 },
        ],
      });
      expect(response.statusCode).toBe(500);
      expect(response.json().code).toBe('INTERNAL_ERROR');
      expect(response.body).not.toContain('test failure');
      expect(response.body).not.toContain(last!.id);
    } finally {
      await context.pool.query(`
        DROP TRIGGER fail_movement_for_test ON stock_movements;
        DROP FUNCTION fail_movement_for_test();
      `);
    }
    expect(await snapshot(context, [first!, last!])).toEqual(before);
  });
});

describe('заявка на перемещение: номер заявки в 1С', () => {
  const context = useTestApp();

  const readComments = async (labelId: string) => {
    const result = await context.pool.query<{ reason: string; comment: string | null }>(
      'SELECT reason, comment FROM stock_movements WHERE label_id = $1 ORDER BY created_at, id',
      [labelId],
    );
    return result.rows.filter((row) => row.reason !== 'created' && row.reason !== 'print');
  };

  const transferBoth = async (labels: Label[], requestNumber?: unknown) => {
    const response = await postStockRequest(context.app, {
      kind: 'transfer',
      ...(requestNumber === undefined ? {} : { requestNumber }),
      items: labels.map((label) => ({ labelId: label.id, quantity: 1 })),
    });
    return response;
  };

  it('номер в ответе и в комментарии движения у каждой позиции', async () => {
    const labels = await createSortedLabels(context, 3);
    const response = await transferBoth(labels, 'ЗП-00042');
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.requestNumber).toBe('ЗП-00042');
    expect(result.items.map((item) => item.movement.comment)).toEqual(
      Array(3).fill('Заявка 1С № ЗП-00042'),
    );
    for (const label of labels) {
      expect(await readComments(label.id)).toEqual([
        { reason: 'transfer', comment: 'Заявка 1С № ЗП-00042' },
      ]);
    }
  });

  it('пробелы вокруг номера обрезаются и в ответе, и в журнале', async () => {
    const [label] = await createSortedLabels(context, 1);
    const response = await transferBoth([label!], '  ЗП-7 ');
    expect(response.json<StockRequestResult>().requestNumber).toBe('ЗП-7');
    expect(await readComments(label!.id)).toEqual([
      { reason: 'transfer', comment: 'Заявка 1С № ЗП-7' },
    ]);
  });

  it.each([
    ['без поля', undefined],
    ['пустая строка', ''],
    ['только пробелы', '   '],
    ['null', null],
  ])('%s — requestNumber null, комментарий null', async (_name, requestNumber) => {
    const labels = await createSortedLabels(context, 2);
    const response = await transferBoth(labels, requestNumber);
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.requestNumber).toBeNull();
    expect(result.items.every((item) => item.movement.comment === null)).toBe(true);
    for (const label of labels) {
      expect(await readComments(label.id)).toEqual([{ reason: 'transfer', comment: null }]);
    }
  });

  it('ровно 50 символов — проходит', async () => {
    const [label] = await createSortedLabels(context, 1);
    const response = await transferBoth([label!], '1'.repeat(50));
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<StockRequestResult>().requestNumber).toBe('1'.repeat(50));
  });

  it.each([
    ['51 символ', '1'.repeat(51)],
    ['\\0 в номере', 'ЗП\u00001'],
    ['номер числом', 42],
  ])('%s → 400, ничего не списано', async (_name, requestNumber) => {
    const labels = await createSortedLabels(context, 2);
    const before = await snapshot(context, labels);
    const response = await transferBoth(labels, requestNumber);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
    expect(await snapshot(context, labels)).toEqual(before);
  });

  it('заявка с номером откатилась целиком — комментариев в журнале нет', async () => {
    const [first, last] = await createSortedLabels(context, 2, { usable: 5, obsolete: 0 });
    const response = await postStockRequest(context.app, {
      kind: 'transfer',
      requestNumber: 'ЗП-9',
      items: [
        { labelId: first!.id, quantity: 1 },
        { labelId: last!.id, quantity: 6 },
      ],
    });
    expect(response.statusCode).toBe(422);
    expect(await readComments(first!.id)).toEqual([]);
    expect(await readComments(last!.id)).toEqual([]);
  });

  it('утилизация: requestNumber в ответе null, даже если его прислали; комментарий null', async () => {
    const [label] = await createSortedLabels(context, 1, { usable: 1, obsolete: 3 });
    const response = await postStockRequest(context.app, {
      kind: 'disposal',
      requestNumber: 'ЗП-1',
      items: [{ labelId: label!.id }],
    });
    expect(response.statusCode, response.body).toBe(201);
    const result = response.json<StockRequestResult>();
    expect(result.requestNumber).toBeNull();
    expect(result.items[0]!.movement.comment).toBeNull();
    expect(await readComments(label!.id)).toEqual([{ reason: 'disposal', comment: null }]);
  });
});
