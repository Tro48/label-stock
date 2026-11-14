import { describe, expect, it } from 'vitest';
import type { Counterparty } from '@label-stock/shared';
import { MISSING_ID, createCounterparty, useTestApp } from './helpers';

describe('контрагенты', () => {
  const context = useTestApp();

  const post = (name: unknown) =>
    context.app.inject({ method: 'POST', url: '/api/counterparties', payload: { name } });
  const rename = (id: string, name: unknown) =>
    context.app.inject({ method: 'PATCH', url: `/api/counterparties/${id}`, payload: { name } });
  const search = async (query: Record<string, string> = {}) => {
    const response = await context.app.inject({ url: '/api/counterparties', query });
    expect(response.statusCode).toBe(200);
    return response.json<Counterparty[]>();
  };

  it('создаёт контрагента с обрезанным названием → 201', async () => {
    const response = await post('  Ромашка  ');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Ромашка', externalId: null });
  });

  it.each(['ромашка', 'РОМАШКА', '  Ромашка ', 'рОмАшКа\t'])(
    'дубль «%s» → 200 и тот же id',
    async (duplicateName) => {
      const original = await createCounterparty(context.app, 'Ромашка');
      const response = await post(duplicateName);
      expect(response.statusCode).toBe(200);
      expect(response.json<Counterparty>()).toMatchObject({ id: original.id, name: 'Ромашка' });
      expect(await search()).toHaveLength(1);
    },
  );

  it('параллельное создание одного контрагента даёт одну запись', async () => {
    const responses = await Promise.all(
      ['Лютик', 'лютик', 'ЛЮТИК ', ' Лютик', 'Лютик'].map((name) => post(name)),
    );
    const ids = new Set(responses.map((response) => response.json<Counterparty>().id));
    expect(ids.size).toBe(1);
    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
  });

  it.each([
    ['пустое', ''],
    ['только пробелы', '   '],
    ['длиннее 200', 'я'.repeat(201)],
    ['не строка', 123],
    ['null', null],
  ])('создание: название %s → 400', async (_name, value) => {
    const response = await post(value);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('переименование', async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const response = await rename(counterparty.id, ' ООО Ромашка ');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: counterparty.id, name: 'ООО Ромашка' });
  });

  it('переименование себя же в другом регистре — не конфликт', async () => {
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    expect((await rename(counterparty.id, 'РОМАШКА')).statusCode).toBe(200);
  });

  it('переименование в занятое имя → 409 с conflictingId', async () => {
    const taken = await createCounterparty(context.app, 'Лютик');
    const counterparty = await createCounterparty(context.app, 'Ромашка');
    const response = await rename(counterparty.id, ' лютик ');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'DUPLICATE',
      details: { field: 'name', conflictingId: taken.id },
    });
  });

  it('переименование несуществующего → 404, невалидный id → 400, пустое имя → 400', async () => {
    expect((await rename(MISSING_ID, 'X')).statusCode).toBe(404);
    expect((await rename('abc', 'X')).statusCode).toBe(400);
    const counterparty = await createCounterparty(context.app);
    expect((await rename(counterparty.id, '  ')).statusCode).toBe(400);
  });

  it('переименование видно в позициях', async () => {
    const counterparty = await createCounterparty(context.app, 'Старое');
    const label = await context.app.inject({
      method: 'POST',
      url: '/api/labels',
      payload: { counterpartyId: counterparty.id, printedAt: '2026-11-01', quantity: 1 },
    });
    await rename(counterparty.id, 'Новое');
    const card = await context.app.inject({ url: `/api/labels/${label.json().label.id}` });
    expect(card.json().counterparty.name).toBe('Новое');
  });

  describe('автодополнение', () => {
    it('ищет по подстроке без учёта регистра', async () => {
      await createCounterparty(context.app, 'ООО Ромашка');
      await createCounterparty(context.app, 'Лютик');
      expect((await search({ search: 'РОМ' })).map((item) => item.name)).toEqual(['ООО Ромашка']);
    });

    it('отдаёт не больше 20 вариантов', async () => {
      for (let index = 0; index < 25; index++) {
        await createCounterparty(context.app, `Контрагент ${index}`);
      }
      expect(await search({ search: 'контрагент' })).toHaveLength(20);
      expect(await search()).toHaveLength(20);
    });

    it.each([
      ['%', '100%', '1000'],
      ['_', 'A_B', 'AXB'],
    ])('«%s» ищется буквально', async (needle, matching, decoy) => {
      await createCounterparty(context.app, matching);
      await createCounterparty(context.app, decoy);
      expect((await search({ search: needle })).map((item) => item.name)).toEqual([matching]);
    });

    it('поиск длиннее 200 символов → 400', async () => {
      const response = await context.app.inject({
        url: '/api/counterparties',
        query: { search: 'я'.repeat(201) },
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
