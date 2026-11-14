import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { CreateLabelResult, Label } from '@label-stock/shared';
import { createCounterparty, createLabel, readJournal, readStock, useTestApp } from './helpers';

const MERGE_COMMENT = 'Совпал номер макета';

/** Дубль напрямую в БД, мимо API: уникальный индекс активных позиций не даёт создать его через запрос. */
async function insertLabelDirect(
  pool: pg.Pool,
  values: {
    counterpartyId: string;
    layoutNumber: string | null;
    quantity: number;
    obsoleteQuantity?: number;
    createdAt: string;
  },
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO labels (counterparty_id, layout_number, barcode, printed_at, quantity, obsolete_quantity, version, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $7)
     RETURNING id`,
    [
      values.counterpartyId,
      values.layoutNumber,
      null,
      '2026-11-01',
      values.quantity,
      values.obsoleteQuantity ?? 0,
      values.createdAt,
    ],
  );
  return result.rows[0]!.id;
}

const DROP_LAYOUT_INDEX = 'DROP INDEX labels_layout_number_active_uq';
const CREATE_LAYOUT_INDEX = `CREATE UNIQUE INDEX labels_layout_number_active_uq
  ON labels USING btree (layout_number) WHERE deleted_at IS NULL AND layout_number IS NOT NULL`;

/**
 * Индекс не пускает дубли даже прямой вставкой, поэтому тест снимает его, готовит «испорченные»
 * данные и восстанавливает индекс после: восстановление проходит лишь тогда, когда слияние
 * вернуло таблицу в состояние, удовлетворяющее уникальности.
 */
async function withDroppedLayoutIndex(pool: pg.Pool, prepare: () => Promise<void>): Promise<void> {
  await pool.query(DROP_LAYOUT_INDEX);
  try {
    await prepare();
  } finally {
    await pool.query(CREATE_LAYOUT_INDEX);
  }
}

async function fetchLabel(app: FastifyInstance, id: string): Promise<Label> {
  const response = await app.inject({ url: `/api/labels/${id}` });
  expect(response.statusCode).toBe(200);
  return response.json<Label>();
}

const mergeDuplicates = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: '/api/labels/merge-duplicates' });

describe('создание: слияние по номеру макета', () => {
  const context = useTestApp();

  const postLabel = (payload: object) =>
    context.app.inject({ method: 'POST', url: '/api/labels', payload });

  it('остаток формы добавляется к занявшей позиции, её поля не меняются', async () => {
    const first = await createCounterparty(context.app, 'Первый');
    const second = await createCounterparty(context.app, 'Второй');
    const existing = await createLabel(context.app, {
      counterpartyId: first.id,
      layoutNumber: '100',
      barcode: 'B1',
      printedAt: '2026-10-01',
      comment: 'исходная',
      quantity: 30,
    });

    const response = await postLabel({
      counterpartyId: second.id,
      layoutNumber: ' 100 ',
      barcode: 'B2',
      printedAt: '2026-11-05',
      comment: 'из формы',
      quantity: 70,
    });

    expect(response.statusCode).toBe(201);
    const result = response.json<CreateLabelResult>();
    expect(result.merged).toBe(true);
    // Побеждают поля занявшей позиции: контрагент, штрихкод, дата и комментарий формы не переносятся.
    expect(result.label).toMatchObject({
      id: existing.id,
      counterparty: { id: first.id, name: 'Первый' },
      layoutNumber: '100',
      barcode: 'B1',
      printedAt: '2026-10-01',
      comment: 'исходная',
      quantity: 100,
    });
    expect(result.movement).toMatchObject({
      delta: 70,
      quantityAfter: 100,
      reason: 'print',
      comment: MERGE_COMMENT,
    });

    const list = await context.app.inject({ url: '/api/labels' });
    expect(list.json().total).toBe(1);
    expect(await readJournal(context.pool, existing.id)).toEqual([
      { delta: 30, quantity_after: 30, reason: 'created' },
      { delta: 70, quantity_after: 100, reason: 'print' },
    ]);
  });

  it('слияние с нулевым остатком: без движения, остаток не меняется', async () => {
    const existing = await createLabel(context.app, { layoutNumber: '100', quantity: 30 });
    const response = await postLabel({
      counterpartyId: existing.counterparty.id,
      layoutNumber: '100',
      printedAt: '2026-11-01',
      quantity: 0,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      merged: true,
      label: { id: existing.id, quantity: 30 },
      movement: null,
    });
    expect(await readJournal(context.pool, existing.id)).toHaveLength(1);
  });

  it('штрихкод формы, занятый другой позицией, слиянию не мешает', async () => {
    const existing = await createLabel(context.app, { layoutNumber: '100', quantity: 10 });
    const other = await createLabel(context.app, {
      layoutNumber: '200',
      barcode: 'B2',
      quantity: 5,
    });

    const response = await postLabel({
      counterpartyId: existing.counterparty.id,
      layoutNumber: '100',
      barcode: 'B2',
      printedAt: '2026-11-01',
      quantity: 7,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      merged: true,
      label: { id: existing.id, quantity: 17 },
    });
    expect(await fetchLabel(context.app, other.id)).toMatchObject({ barcode: 'B2', quantity: 5 });
  });

  it('создание со свободным номером: merged=false, движение created', async () => {
    const counterparty = await createCounterparty(context.app);
    const response = await postLabel({
      counterpartyId: counterparty.id,
      layoutNumber: '100',
      printedAt: '2026-11-01',
      quantity: 40,
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<CreateLabelResult>();
    expect(result.merged).toBe(false);
    expect(result.movement).toMatchObject({ delta: 40, reason: 'created', comment: null });
  });

  it('параллельное создание одного номера: одна позиция, остаток суммой всех форм', async () => {
    const counterparty = await createCounterparty(context.app);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        postLabel({
          counterpartyId: counterparty.id,
          layoutNumber: '123456',
          printedAt: '2026-11-01',
          quantity: 5,
        }),
      ),
    );
    expect(responses.map((response) => response.statusCode)).toEqual(Array(10).fill(201));
    expect(responses.every((response) => response.json().merged !== undefined)).toBe(true);

    const list = await context.app.inject({ url: '/api/labels' });
    expect(list.json().total).toBe(1);
    const label = list.json().items[0];
    expect(label).toMatchObject({ layoutNumber: '123456', quantity: 50 });
    const journal = await readJournal(context.pool, label.id);
    expect(journal).toHaveLength(10);
    expect(journal.reduce((sum, row) => sum + row.delta, 0)).toBe(50);
  });
});

describe('объединение дублей в списке', () => {
  const context = useTestApp();

  it('без дублей: пустой отчёт, данные не меняются', async () => {
    const label = await createLabel(context.app, { layoutNumber: '100', quantity: 10 });
    const response = await mergeDuplicates(context.app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ groups: 0, merged: 0, movedQuantity: 0 });
    expect(await fetchLabel(context.app, label.id)).toMatchObject({
      quantity: 10,
      deletedAt: null,
    });
  });

  it('в каждой группе остаётся самая ранняя позиция, остаток и старый макет переносятся', async () => {
    const counterparty = await createCounterparty(context.app);
    let keeper100: string;
    let mid100: string;
    let last100: string;
    let keeper200: string;
    let dup200: string;
    let unique: string;
    let response: Awaited<ReturnType<typeof mergeDuplicates>>;
    await withDroppedLayoutIndex(context.pool, async () => {
      keeper100 = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '100',
        quantity: 10,
        createdAt: '2026-11-01T00:00:01Z',
      });
      mid100 = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '100',
        quantity: 20,
        obsoleteQuantity: 5,
        createdAt: '2026-11-01T00:00:02Z',
      });
      last100 = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '100',
        quantity: 30,
        createdAt: '2026-11-01T00:00:03Z',
      });
      keeper200 = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '200',
        quantity: 7,
        createdAt: '2026-11-01T00:00:04Z',
      });
      dup200 = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '200',
        quantity: 3,
        createdAt: '2026-11-01T00:00:05Z',
      });
      unique = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '300',
        quantity: 1,
        createdAt: '2026-11-01T00:00:06Z',
      });
      // Удалённый дубль не участвует: активная позиция с таким номером остаётся одна.
      const deleted = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '400',
        quantity: 2,
        createdAt: '2026-11-01T00:00:07Z',
      });
      await context.pool.query('UPDATE labels SET deleted_at = now() WHERE id = $1', [deleted]);
      await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '400',
        quantity: 9,
        createdAt: '2026-11-01T00:00:08Z',
      });
      response = await mergeDuplicates(context.app);
    });

    expect(response!.statusCode).toBe(200);
    expect(response!.json()).toEqual({ groups: 2, merged: 3, movedQuantity: 53 });

    // Самая ранняя позиция группы осталась: 10 + 20 + 30 = 60, старый макет перенесён.
    expect(await readStock(context.pool, keeper100!)).toEqual({
      quantity: 60,
      obsoleteQuantity: 5,
    });
    expect(await fetchLabel(context.app, mid100!).then((label) => label.deletedAt)).not.toBeNull();
    expect(await fetchLabel(context.app, last100!).then((label) => label.deletedAt)).not.toBeNull();
    expect(await readJournal(context.pool, keeper100!)).toEqual([
      { delta: 20, quantity_after: 30, reason: 'correction' },
      { delta: 30, quantity_after: 60, reason: 'correction' },
    ]);

    // Вторая группа: 7 + 3 = 10.
    expect(await readStock(context.pool, keeper200!)).toEqual({
      quantity: 10,
      obsoleteQuantity: 0,
    });
    expect(await fetchLabel(context.app, dup200!).then((label) => label.deletedAt)).not.toBeNull();

    // Уникальный номер и «одиночная» четвёрка не тронуты.
    expect(await readStock(context.pool, unique!)).toEqual({ quantity: 1, obsoleteQuantity: 0 });
    const active400 = (
      await context.app.inject({ url: '/api/labels', query: { search: '400' } })
    ).json().items[0];
    expect(active400).toMatchObject({ layoutNumber: '400', quantity: 9, deletedAt: null });
  });

  it('дубль с нулевым остатком удаляется без записи в журнале', async () => {
    const counterparty = await createCounterparty(context.app);
    let keeper: string;
    let empty: string;
    let response: Awaited<ReturnType<typeof mergeDuplicates>>;
    await withDroppedLayoutIndex(context.pool, async () => {
      keeper = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '500',
        quantity: 5,
        createdAt: '2026-11-01T00:00:01Z',
      });
      empty = await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '500',
        quantity: 0,
        createdAt: '2026-11-01T00:00:02Z',
      });
      response = await mergeDuplicates(context.app);
    });

    expect(response!.json()).toEqual({ groups: 1, merged: 1, movedQuantity: 0 });
    expect(await readStock(context.pool, keeper!)).toEqual({ quantity: 5, obsoleteQuantity: 0 });
    expect(await fetchLabel(context.app, empty!).then((label) => label.deletedAt)).not.toBeNull();
    expect(await readJournal(context.pool, keeper!)).toEqual([]);
  });

  it('повторный вызов после объединения ничего не находит', async () => {
    const counterparty = await createCounterparty(context.app);
    let first: Awaited<ReturnType<typeof mergeDuplicates>>;
    let second: Awaited<ReturnType<typeof mergeDuplicates>>;
    await withDroppedLayoutIndex(context.pool, async () => {
      await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '100',
        quantity: 1,
        createdAt: '2026-11-01T00:00:01Z',
      });
      await insertLabelDirect(context.pool, {
        counterpartyId: counterparty.id,
        layoutNumber: '100',
        quantity: 2,
        createdAt: '2026-11-01T00:00:02Z',
      });
      first = await mergeDuplicates(context.app);
      second = await mergeDuplicates(context.app);
    });

    expect(first!.json()).toEqual({ groups: 1, merged: 1, movedQuantity: 2 });
    expect(second!.json()).toEqual({ groups: 0, merged: 0, movedQuantity: 0 });
  });
});
