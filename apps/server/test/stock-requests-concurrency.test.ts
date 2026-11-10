import { describe, expect, it } from 'vitest';
import {
  createCounterparty,
  createLabelWithObsolete,
  postMovement,
  postStockRequest,
  readJournal,
  readStock,
  useTestApp,
} from './helpers';

describe('гонки заявок на перемещение и утилизацию', () => {
  const context = useTestApp();

  const transfer = (items: { labelId: string; quantity: number }[]) =>
    postStockRequest(context.app, { kind: 'transfer', items });
  const dispose = (labelIds: string[]) =>
    postStockRequest(context.app, {
      kind: 'disposal',
      items: labelIds.map((labelId) => ({ labelId })),
    });

  const statusesOf = (responses: { statusCode: number }[]) =>
    responses.map((response) => response.statusCode);

  /** Инварианты позиции: старый макет в пределах остатка, журнал сходится с остатком. */
  async function expectConsistent(labelId: string) {
    const stock = await readStock(context.pool, labelId);
    expect(stock.obsoleteQuantity).toBeGreaterThanOrEqual(0);
    expect(stock.obsoleteQuantity).toBeLessThanOrEqual(stock.quantity);
    const journal = await readJournal(context.pool, labelId);
    expect(journal.reduce((sum, row) => sum + row.delta, 0)).toBe(stock.quantity);
    return { stock, journal };
  }

  const createPair = async (stock: { usable: number; obsolete: number }) => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const first = await createLabelWithObsolete(context.app, stock, {
      counterpartyId: counterparty.id,
    });
    const second = await createLabelWithObsolete(context.app, stock, {
      counterpartyId: counterparty.id,
    });
    return [first, second] as const;
  };

  it('10 параллельных перемещений по 3 из годных 20: ровно 6 успешных, старый макет цел', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 20, obsolete: 5 });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => transfer([{ labelId: label.id, quantity: 3 }])),
    );
    const statuses = statusesOf(responses);
    expect(statuses.filter((status) => status === 201)).toHaveLength(6);
    expect(statuses.filter((status) => status === 422)).toHaveLength(4);
    for (const response of responses.filter((item) => item.statusCode === 422)) {
      expect(response.json()).toMatchObject({
        code: 'OBSOLETE_STOCK',
        details: { labelId: label.id },
      });
    }
    const { stock, journal } = await expectConsistent(label.id);
    expect(stock).toEqual({ quantity: 7, obsoleteQuantity: 5 });
    expect(journal.filter((row) => row.reason === 'transfer')).toHaveLength(6);
  });

  it('без старого макета параллельные перемещения не уводят остаток в минус', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 10, obsolete: 0 });
    const responses = await Promise.all(
      Array.from({ length: 15 }, () => transfer([{ labelId: label.id, quantity: 1 }])),
    );
    const statuses = statusesOf(responses);
    expect(statuses.filter((status) => status === 201)).toHaveLength(10);
    for (const response of responses.filter((item) => item.statusCode !== 201)) {
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('NEGATIVE_STOCK');
    }
    const { stock } = await expectConsistent(label.id);
    expect(stock).toEqual({ quantity: 0, obsoleteQuantity: 0 });
  });

  it('10 параллельных утилизаций одной позиции: старый макет списан ровно один раз', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 6, obsolete: 9 });
    const responses = await Promise.all(Array.from({ length: 10 }, () => dispose([label.id])));
    const statuses = statusesOf(responses);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    for (const response of responses.filter((item) => item.statusCode !== 201)) {
      expect(response.statusCode).toBe(422);
      expect(response.json().message).toBe('Утилизировать нечего');
    }
    const { stock, journal } = await expectConsistent(label.id);
    expect(stock).toEqual({ quantity: 6, obsoleteQuantity: 0 });
    expect(journal.filter((row) => row.reason === 'disposal')).toEqual([
      { delta: -9, quantity_after: 6, reason: 'disposal' },
    ]);
  });

  it('встречные заявки [A,B] и [B,A] не взаимоблокируются: все 20 проходят', async () => {
    const [first, second] = await createPair({ usable: 100, obsolete: 0 });
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) => {
        const items = [
          { labelId: first.id, quantity: 1 },
          { labelId: second.id, quantity: 2 },
        ];
        return transfer(index % 2 === 0 ? items : [...items].reverse());
      }),
    );
    expect(statusesOf(responses)).toEqual(Array(20).fill(201));
    expect((await expectConsistent(first.id)).stock.quantity).toBe(80);
    expect((await expectConsistent(second.id)).stock.quantity).toBe(60);
  });

  it('встречные утилизация [A,B] и перемещения [B,A] не взаимоблокируются', async () => {
    const [first, second] = await createPair({ usable: 50, obsolete: 10 });
    const responses = await Promise.all([
      dispose([first.id, second.id]),
      ...Array.from({ length: 10 }, () =>
        transfer([
          { labelId: second.id, quantity: 1 },
          { labelId: first.id, quantity: 1 },
        ]),
      ),
    ]);
    expect(statusesOf(responses)).toEqual(Array(11).fill(201));
    for (const label of [first, second]) {
      expect((await expectConsistent(label.id)).stock).toEqual({
        quantity: 40,
        obsoleteQuantity: 0,
      });
    }
  });

  it('утилизация параллельно со списаниями: списания не трогают старый макет', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 10, obsolete: 10 });
    const responses = await Promise.all([
      ...Array.from({ length: 15 }, () =>
        postMovement(context.app, label.id, { reason: 'consumption', delta: -1 }),
      ),
      dispose([label.id]),
    ]);
    const disposal = responses.at(-1)!;
    expect(disposal.statusCode, disposal.body).toBe(201);
    expect(disposal.json().items[0].movement.delta).toBe(-10);
    const consumed = responses.slice(0, -1).filter((response) => response.statusCode === 201);
    expect(consumed).toHaveLength(10);
    const { stock } = await expectConsistent(label.id);
    expect(stock).toEqual({ quantity: 0, obsoleteQuantity: 0 });
  });

  it('смена макета параллельно с перемещениями: инварианты сохраняются', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 30, obsolete: 0 });
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () => transfer([{ labelId: label.id, quantity: 2 }])),
      postMovement(context.app, label.id, { reason: 'print', delta: 5, layoutChanged: true }),
    ]);
    expect(statusesOf(responses).every((status) => status === 201 || status === 422)).toBe(true);
    const { stock, journal } = await expectConsistent(label.id);
    // Всё, что лежало до допечатки, стало старым макетом; после неё годные только 5 шт.
    const printIndex = journal.findLastIndex((row) => row.reason === 'print');
    expect(stock.obsoleteQuantity).toBe(journal[printIndex]!.quantity_after - 5);
    const transfersAfterPrint = journal
      .slice(printIndex + 1)
      .filter((row) => row.reason === 'transfer');
    expect(transfersAfterPrint.length).toBeLessThanOrEqual(2);
  });

  it('удаление посреди заявок: после удаления остаток не меняется', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 50, obsolete: 0 });
    const request = () => transfer([{ labelId: label.id, quantity: 1 }]);
    const [before, , after] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, request)),
      context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` }),
      Promise.all(Array.from({ length: 10 }, request)),
    ]);
    const statuses = statusesOf([...before, ...after]);
    expect(statuses.every((status) => status === 201 || status === 409)).toBe(true);
    const succeeded = statuses.filter((status) => status === 201).length;
    const { stock, journal } = await expectConsistent(label.id);
    expect(stock.quantity).toBe(50 - succeeded);
    expect(journal.filter((row) => row.reason === 'transfer')).toHaveLength(succeeded);
  });

  it('частичный сбой одной из параллельных заявок не задевает остальные', async () => {
    const [first, second] = await createPair({ usable: 10, obsolete: 0 });
    const responses = await Promise.all([
      transfer([
        { labelId: first.id, quantity: 1 },
        { labelId: second.id, quantity: 1 },
      ]),
      // Эта заявка падает целиком на второй позиции.
      transfer([
        { labelId: first.id, quantity: 1 },
        { labelId: second.id, quantity: 1_000 },
      ]),
      transfer([{ labelId: second.id, quantity: 2 }]),
    ]);
    expect(statusesOf(responses)).toEqual([201, 422, 201]);
    expect((await expectConsistent(first.id)).stock.quantity).toBe(9);
    expect((await expectConsistent(second.id)).stock.quantity).toBe(7);
  });
});
