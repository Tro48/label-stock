import { describe, expect, it } from 'vitest';
import { INT32_MAX, type Label, type MovementResult } from '@label-stock/shared';
import {
  createCounterparty,
  createLabel,
  createLabelWithObsolete,
  postMovement,
  readJournal,
  readStock,
  useTestApp,
} from './helpers';
import { csvOf, importCsv } from './import-helpers';

describe('старый макет: допечатка со сменой макета', () => {
  const context = useTestApp();

  const apply = async (labelId: string, payload: object, expectedStatus = 201) => {
    const response = await postMovement(context.app, labelId, payload);
    expect(response.statusCode, response.body).toBe(expectedStatus);
    return response.json<MovementResult>();
  };

  it('новая позиция без старого макета: obsoleteQuantity = 0 в ответе и в БД', async () => {
    const label = await createLabel(context.app, { quantity: 50 });
    expect(label.obsoleteQuantity).toBe(0);
    expect(await readStock(context.pool, label.id)).toEqual({ quantity: 50, obsoleteQuantity: 0 });
  });

  it('допечатка с layoutChanged: весь остаток до неё уходит в утилизацию', async () => {
    const label = await createLabel(context.app, { quantity: 40 });
    const result = await apply(label.id, { reason: 'print', delta: 100, layoutChanged: true });
    expect(result.label).toMatchObject({ quantity: 140, obsoleteQuantity: 40 });
    expect(result.movement).toMatchObject({ delta: 100, quantityAfter: 140, reason: 'print' });
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: 140,
      obsoleteQuantity: 40,
    });
  });

  it('повторная смена макета: в утилизацию уходит весь остаток, включая прежний старый', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 30, obsolete: 10 });
    const result = await apply(label.id, { reason: 'print', delta: 5, layoutChanged: true });
    expect(result.label).toMatchObject({ quantity: 45, obsoleteQuantity: 40 });
  });

  it('допечатка без layoutChanged не трогает старый макет', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 30, obsolete: 10 });
    const result = await apply(label.id, { reason: 'print', delta: 5 });
    expect(result.label).toMatchObject({ quantity: 45, obsoleteQuantity: 10 });
  });

  it('layoutChanged: false явно — то же, что без флага', async () => {
    const label = await createLabel(context.app, { quantity: 40 });
    const result = await apply(label.id, { reason: 'print', delta: 1, layoutChanged: false });
    expect(result.label).toMatchObject({ quantity: 41, obsoleteQuantity: 0 });
  });

  it('смена макета при нулевом остатке: утилизировать нечего, obsolete = 0', async () => {
    const label = await createLabel(context.app, { quantity: 0 });
    const result = await apply(label.id, { reason: 'print', delta: 10, layoutChanged: true });
    expect(result.label).toMatchObject({ quantity: 10, obsoleteQuantity: 0 });
  });

  it('смена макета вместе с датой печати поднимает version', async () => {
    const label = await createLabel(context.app, { quantity: 10, printedAt: '2026-01-01' });
    const result = await apply(label.id, {
      reason: 'print',
      delta: 1,
      layoutChanged: true,
      printedAt: '2026-11-09',
    });
    expect(result.label).toMatchObject({
      quantity: 11,
      obsoleteQuantity: 10,
      printedAt: '2026-11-09',
      version: label.version + 1,
    });
  });

  it('переполнение int32 при смене макета → 422, ни остаток, ни старый макет не меняются', async () => {
    const label = await createLabel(context.app, { quantity: INT32_MAX });
    const response = await postMovement(context.app, label.id, {
      reason: 'print',
      delta: 1,
      layoutChanged: true,
    });
    expect(response.statusCode).toBe(422);
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: INT32_MAX,
      obsoleteQuantity: 0,
    });
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('смена макета у удалённой позиции → 409 LABEL_DELETED, старый макет не появляется', async () => {
    const label = await createLabel(context.app, { quantity: 10 });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` });
    const response = await postMovement(context.app, label.id, {
      reason: 'print',
      delta: 1,
      layoutChanged: true,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('LABEL_DELETED');
    expect(await readStock(context.pool, label.id)).toEqual({ quantity: 10, obsoleteQuantity: 0 });
  });

  it.each([
    ['строкой', 'true'],
    ['числом', 1],
    ['null', null],
  ])('layoutChanged %s → 400, остаток не меняется', async (_name, layoutChanged) => {
    const label = await createLabel(context.app, { quantity: 10 });
    const response = await postMovement(context.app, label.id, {
      reason: 'print',
      delta: 1,
      layoutChanged,
    });
    expect(response.statusCode).toBe(400);
    expect(await readStock(context.pool, label.id)).toEqual({ quantity: 10, obsoleteQuantity: 0 });
  });

  it('карточка и список отдают obsoleteQuantity', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 7, obsolete: 3 });
    const card = await context.app.inject({ url: `/api/labels/${label.id}` });
    expect(card.json<Label>().obsoleteQuantity).toBe(3);
    const list = await context.app.inject({ url: '/api/labels' });
    expect(list.json<{ items: Label[] }>().items[0]).toMatchObject({
      quantity: 10,
      obsoleteQuantity: 3,
    });
  });

  it('CHECK в БД не даёт старому макету превысить остаток', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 5 });
    await expect(
      context.pool.query('UPDATE labels SET obsolete_quantity = quantity + 1 WHERE id = $1', [
        label.id,
      ]),
    ).rejects.toThrow(/labels_obsolete_quantity_range_chk/);
    await expect(
      context.pool.query('UPDATE labels SET obsolete_quantity = -1 WHERE id = $1', [label.id]),
    ).rejects.toThrow(/labels_obsolete_quantity_range_chk/);
  });
});

describe('старый макет: списание берёт только годный остаток', () => {
  const context = useTestApp();

  const consume = (labelId: string, delta: number) =>
    postMovement(context.app, labelId, { reason: 'consumption', delta });

  it('списание в пределах годного: старый макет не меняется', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 15, obsolete: 10 });
    const response = await consume(label.id, -15);
    expect(response.statusCode, response.body).toBe(201);
    expect(response.json<MovementResult>().label).toMatchObject({
      quantity: 10,
      obsoleteQuantity: 10,
    });
  });

  it('на 1 шт. больше годного → 422 OBSOLETE_STOCK с годным и старым в сообщении', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 15, obsolete: 10 });
    const response = await consume(label.id, -16);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'OBSOLETE_STOCK',
      message: 'Можно взять не больше 15 шт.: ещё 10 шт. со старым макетом ждут утилизации',
    });
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: 25,
      obsoleteQuantity: 10,
    });
    expect(await readJournal(context.pool, label.id)).toHaveLength(2);
  });

  it('больше всего остатка при старом макете → тоже OBSOLETE_STOCK, а не NEGATIVE_STOCK', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 15, obsolete: 10 });
    const response = await consume(label.id, -26);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('OBSOLETE_STOCK');
  });

  it('весь остаток — старый макет: даже 1 шт. списать нельзя', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 0, obsolete: 8 });
    expect(await readStock(context.pool, label.id)).toEqual({ quantity: 8, obsoleteQuantity: 8 });
    const response = await consume(label.id, -1);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      code: 'OBSOLETE_STOCK',
      message: 'Можно взять не больше 0 шт.: ещё 8 шт. со старым макетом ждут утилизации',
    });
  });

  it('без старого макета превышение остатка → NEGATIVE_STOCK', async () => {
    const label = await createLabel(context.app, { quantity: 5 });
    const response = await consume(label.id, -6);
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('NEGATIVE_STOCK');
  });
});

describe('старый макет: уменьшение остатка не даёт ему превысить остаток', () => {
  const context = useTestApp();

  const apply = async (labelId: string, payload: object) => {
    const response = await postMovement(context.app, labelId, payload);
    expect(response.statusCode, response.body).toBe(201);
    return response.json<MovementResult>().label;
  };

  it('отрицательное исправление в пределах годного: старый макет прежний', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    expect(await apply(label.id, { reason: 'correction', delta: -3 })).toMatchObject({
      quantity: 12,
      obsoleteQuantity: 10,
    });
  });

  it('отрицательное исправление ниже старого макета: старый = новому остатку', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    expect(await apply(label.id, { reason: 'correction', delta: -8 })).toMatchObject({
      quantity: 7,
      obsoleteQuantity: 7,
    });
  });

  it('исправление до нуля обнуляет старый макет', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    expect(await apply(label.id, { reason: 'correction', delta: -15 })).toMatchObject({
      quantity: 0,
      obsoleteQuantity: 0,
    });
  });

  it('положительное исправление старый макет не увеличивает', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    expect(await apply(label.id, { reason: 'correction', delta: 4 })).toMatchObject({
      quantity: 19,
      obsoleteQuantity: 10,
    });
  });

  it('исправление больше остатка → 422 NEGATIVE_STOCK, старый макет не тронут', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    const response = await postMovement(context.app, label.id, {
      reason: 'correction',
      delta: -16,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('NEGATIVE_STOCK');
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: 15,
      obsoleteQuantity: 10,
    });
  });

  it.each([
    ['выше старого макета — он прежний', 12, 10],
    ['ровно в старый макет — он прежний', 10, 10],
    ['ниже старого макета — старый = новому остатку', 4, 4],
    ['в ноль — старый макет обнуляется', 0, 0],
    ['выше текущего остатка — старый макет не растёт', 100, 10],
  ])('инвентаризация %s', async (_name, setQuantity, expectedObsolete) => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    const result = await apply(label.id, { reason: 'inventory', setQuantity });
    expect(result).toMatchObject({ quantity: setQuantity, obsoleteQuantity: expectedObsolete });
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: setQuantity,
      obsoleteQuantity: expectedObsolete,
    });
  });

  it('инвентаризация на то же значение ничего не меняет', async () => {
    const label = await createLabelWithObsolete(context.app, { usable: 5, obsolete: 10 });
    const response = await postMovement(context.app, label.id, {
      reason: 'inventory',
      setQuantity: 15,
    });
    expect(response.json<MovementResult>().movement).toBeNull();
    expect(await readStock(context.pool, label.id)).toEqual({
      quantity: 15,
      obsoleteQuantity: 10,
    });
  });

  describe('загрузка CSV', () => {
    const createImported = async () => {
      const counterparty = await createCounterparty(context.app, 'Ромашка');
      return createLabelWithObsolete(
        context.app,
        { usable: 5, obsolete: 10 },
        { counterpartyId: counterparty.id, layoutNumber: '007', printedAt: '2026-11-01' },
      );
    };

    it.each([
      ['ниже старого макета — старый = новому остатку', 3, 3],
      ['в ноль — старый макет обнуляется', 0, 0],
      ['выше старого макета — он прежний', 12, 10],
      ['выше текущего остатка — старый макет не растёт', 40, 10],
      ['то же значение — ничего не меняется', 15, 10],
    ])('остаток %s', async (_name, quantity, expectedObsolete) => {
      const label = await createImported();
      await importCsv(context.app, csvOf(`Ромашка;007;;01.11.2026;${quantity};`));
      expect(await readStock(context.pool, label.id)).toEqual({
        quantity,
        obsoleteQuantity: expectedObsolete,
      });
    });

    it('пробный прогон (dryRun) старый макет не трогает', async () => {
      const label = await createImported();
      await importCsv(context.app, csvOf('Ромашка;007;;01.11.2026;2;'), { dryRun: true });
      expect(await readStock(context.pool, label.id)).toEqual({
        quantity: 15,
        obsoleteQuantity: 10,
      });
    });
  });
});
