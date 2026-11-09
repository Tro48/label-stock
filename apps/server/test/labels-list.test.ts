import { describe, expect, it } from 'vitest';
import type { Label, Paginated } from '@label-stock/shared';
import { createCounterparty, createLabel, useTestApp } from './helpers';

describe('позиции: список, поиск, сортировка, by-barcode', () => {
  const context = useTestApp();

  const list = async (query: Record<string, string> = {}) => {
    const response = await context.app.inject({ url: '/api/labels', query });
    expect(response.statusCode).toBe(200);
    return response.json<Paginated<Label>>();
  };
  const layoutNumbers = (page: Paginated<Label>) => page.items.map((item) => item.layoutNumber);

  it('по умолчанию: 50 на страницу, только активные', async () => {
    const active = await createLabel(context.app, { layoutNumber: '1' });
    const deleted = await createLabel(context.app, { layoutNumber: '2' });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${deleted.id}` });

    const page = await list();
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 50 });
    expect(page.items.map((item) => item.id)).toEqual([active.id]);
  });

  it('deleted=true отдаёт только удалённые', async () => {
    await createLabel(context.app, { layoutNumber: '1' });
    const deleted = await createLabel(context.app, { layoutNumber: '2' });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${deleted.id}` });

    const page = await list({ deleted: 'true' });
    expect(page.items.map((item) => item.id)).toEqual([deleted.id]);
  });

  it('onlyEmpty=true — только нулевой остаток, false — все', async () => {
    const counterparty = await createCounterparty(context.app);
    await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: '1',
      quantity: 5,
    });
    await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: '2',
      quantity: 0,
    });

    expect(layoutNumbers(await list({ onlyEmpty: 'true' }))).toEqual(['2']);
    expect((await list({ onlyEmpty: 'false' })).total).toBe(2);
  });

  it.each([
    ['onlyEmpty=abc', { onlyEmpty: 'abc' }],
    ['pageSize=201', { pageSize: '201' }],
    ['page=0', { page: '0' }],
    ['sort неизвестный', { sort: 'id' }],
    ['counterpartyId не UUID', { counterpartyId: 'x' }],
  ])('%s → 400', async (_name, query) => {
    const response = await context.app.inject({ url: '/api/labels', query });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_ERROR');
  });

  it('сортировка по номеру макета: 9 раньше 10, ведущие нули по длине', async () => {
    const counterparty = await createCounterparty(context.app);
    for (const layoutNumber of ['10', '9', '100', '009', '2']) {
      await createLabel(context.app, { counterpartyId: counterparty.id, layoutNumber });
    }
    expect(layoutNumbers(await list({ sort: 'layoutNumber' }))).toEqual([
      '2',
      '9',
      '10',
      '009',
      '100',
    ]);
    expect(layoutNumbers(await list({ sort: 'layoutNumber', order: 'desc' }))).toEqual([
      '100',
      '009',
      '10',
      '9',
      '2',
    ]);
  });

  it('позиции без номера при сортировке по номеру идут в конце', async () => {
    const counterparty = await createCounterparty(context.app);
    await createLabel(context.app, { counterpartyId: counterparty.id, layoutNumber: null });
    await createLabel(context.app, { counterpartyId: counterparty.id, layoutNumber: '5' });
    expect(layoutNumbers(await list({ sort: 'layoutNumber' }))).toEqual(['5', null]);
    expect(layoutNumbers(await list({ sort: 'layoutNumber', order: 'desc' }))).toEqual(['5', null]);
  });

  it('пагинация: страницы не пересекаются, total общий', async () => {
    const counterparty = await createCounterparty(context.app);
    for (let index = 1; index <= 5; index++) {
      await createLabel(context.app, {
        counterpartyId: counterparty.id,
        layoutNumber: String(index),
      });
    }
    const query = { sort: 'layoutNumber', pageSize: '2' };
    const pages = [
      await list({ ...query, page: '1' }),
      await list({ ...query, page: '2' }),
      await list({ ...query, page: '3' }),
      await list({ ...query, page: '4' }),
    ];
    expect(pages.map(layoutNumbers)).toEqual([['1', '2'], ['3', '4'], ['5'], []]);
    expect(pages.every((page) => page.total === 5)).toBe(true);
  });

  describe('поиск', () => {
    it('по части названия контрагента без учёта регистра', async () => {
      const romashka = await createCounterparty(context.app, 'ООО Ромашка');
      const lyutik = await createCounterparty(context.app, 'Лютик');
      await createLabel(context.app, { counterpartyId: romashka.id, layoutNumber: '1' });
      await createLabel(context.app, { counterpartyId: lyutik.id, layoutNumber: '2' });
      expect(layoutNumbers(await list({ search: 'ромаш' }))).toEqual(['1']);
    });

    it('по префиксу номера макета, но не по середине', async () => {
      const counterparty = await createCounterparty(context.app, 'Без цифр');
      await createLabel(context.app, { counterpartyId: counterparty.id, layoutNumber: '00123' });
      await createLabel(context.app, { counterpartyId: counterparty.id, layoutNumber: '5012' });
      expect(layoutNumbers(await list({ search: '001' }))).toEqual(['00123']);
      expect(layoutNumbers(await list({ search: '12' }))).toEqual([]);
    });

    it('по штрихкоду, набранному в русской раскладке', async () => {
      const counterparty = await createCounterparty(context.app, 'Без букв');
      await createLabel(context.app, {
        counterpartyId: counterparty.id,
        layoutNumber: '1',
        barcode: 'ABC123',
      });
      expect(layoutNumbers(await list({ search: 'ФИС1' }))).toEqual(['1']);
    });

    describe('по штрихкоду', () => {
      async function createBarcodes() {
        const counterparty = await createCounterparty(context.app, 'Без цифр в названии');
        await createLabel(context.app, {
          counterpartyId: counterparty.id,
          layoutNumber: '1',
          barcode: '4601234567890',
        });
        await createLabel(context.app, {
          counterpartyId: counterparty.id,
          layoutNumber: '2',
          barcode: '4609876543210',
        });
      }

      it('по последним шести цифрам', async () => {
        await createBarcodes();
        expect(layoutNumbers(await list({ search: '567890' }))).toEqual(['1']);
      });

      it('по полному коду', async () => {
        await createBarcodes();
        expect(layoutNumbers(await list({ search: '4609876543210' }))).toEqual(['2']);
      });

      it('по началу кода — как раньше', async () => {
        await createBarcodes();
        expect(layoutNumbers(await list({ search: '460' }))).toEqual(['1', '2']);
      });

      it('по середине кода — не находит', async () => {
        await createBarcodes();
        expect(layoutNumbers(await list({ search: '345678' }))).toEqual([]);
      });

      it('последние цифры с пробелами вокруг', async () => {
        await createBarcodes();
        expect(layoutNumbers(await list({ search: '  543210 ' }))).toEqual(['2']);
      });

      it('конец кода в русской раскладке', async () => {
        const counterparty = await createCounterparty(context.app, 'Без букв');
        await createLabel(context.app, {
          counterpartyId: counterparty.id,
          layoutNumber: '1',
          barcode: 'XYZABC',
        });
        expect(layoutNumbers(await list({ search: 'ФИС' }))).toEqual(['1']);
      });

      it('удалённая позиция по концу кода не находится в активных', async () => {
        await createBarcodes();
        const gone = await createLabel(context.app, {
          layoutNumber: '3',
          barcode: '4600000111222',
        });
        await context.app.inject({ method: 'DELETE', url: `/api/labels/${gone.id}` });
        expect(layoutNumbers(await list({ search: '111222' }))).toEqual([]);
      });

      it.each([
        ['%', '12%45'],
        ['_', '12_45'],
      ])('«%s» в конце ищется буквально', async (needle, barcode) => {
        const counterparty = await createCounterparty(context.app, 'Спецсимволы');
        await createLabel(context.app, {
          counterpartyId: counterparty.id,
          layoutNumber: '1',
          barcode,
        });
        await createLabel(context.app, {
          counterpartyId: counterparty.id,
          layoutNumber: '2',
          barcode: '1234500',
        });
        expect(layoutNumbers(await list({ search: `${needle}45` }))).toEqual(['1']);
      });
    });

    describe('фильтр counterpartyName', () => {
      async function createHoldings() {
        const holding = await createCounterparty(context.app, 'ЖК Холдинг');
        const south = await createCounterparty(context.app, 'Холдинг Юг');
        const other = await createCounterparty(context.app, 'Ромашка');
        await createLabel(context.app, { counterpartyId: holding.id, layoutNumber: '1' });
        await createLabel(context.app, { counterpartyId: south.id, layoutNumber: '2' });
        await createLabel(context.app, { counterpartyId: other.id, layoutNumber: '3' });
      }

      it('по слову из середины названия без учёта регистра', async () => {
        await createHoldings();
        expect(layoutNumbers(await list({ counterpartyName: 'холдинг' }))).toEqual(['1', '2']);
      });

      it('по полному названию', async () => {
        await createHoldings();
        expect(layoutNumbers(await list({ counterpartyName: 'ЖК ХОЛДИНГ' }))).toEqual(['1']);
      });

      it('ничего не совпало — пустой список, а не все позиции', async () => {
        await createHoldings();
        const page = await list({ counterpartyName: 'Лютик' });
        expect(page.total).toBe(0);
      });

      it('пустая строка — фильтра нет', async () => {
        await createHoldings();
        expect((await list({ counterpartyName: '' })).total).toBe(3);
      });

      it('вместе с поиском — оба условия сразу', async () => {
        await createHoldings();
        expect(layoutNumbers(await list({ counterpartyName: 'холдинг', search: '2' }))).toEqual([
          '2',
        ]);
      });

      it('«%» ищется буквально', async () => {
        const hit = await createCounterparty(context.app, 'Скидка 100%');
        const miss = await createCounterparty(context.app, 'Скидка 1000');
        await createLabel(context.app, { counterpartyId: hit.id, layoutNumber: '1' });
        await createLabel(context.app, { counterpartyId: miss.id, layoutNumber: '2' });
        expect(layoutNumbers(await list({ counterpartyName: '%' }))).toEqual(['1']);
      });

      it('длиннее 200 символов — 400', async () => {
        const response = await context.app.inject({
          url: '/api/labels',
          query: { counterpartyName: 'а'.repeat(201) },
        });
        expect(response.statusCode).toBe(400);
      });

      it('NUL не роняет запрос', async () => {
        const response = await context.app.inject({
          url: '/api/labels',
          query: { counterpartyName: 'a\u0000b' },
        });
        expect(response.statusCode).toBeLessThan(500);
      });
    });

    it('фильтр по counterpartyId', async () => {
      const first = await createCounterparty(context.app, 'Первый');
      const second = await createCounterparty(context.app, 'Второй');
      await createLabel(context.app, { counterpartyId: first.id, layoutNumber: '1' });
      await createLabel(context.app, { counterpartyId: second.id, layoutNumber: '2' });
      expect(layoutNumbers(await list({ counterpartyId: second.id }))).toEqual(['2']);
    });

    it.each([
      ['%', 'Скидка 100%', 'Скидка 1000'],
      ['_', 'ООО_А', 'ОООБА'],
      ['\\', 'A\\B', 'AB'],
    ])('«%s» ищется буквально', async (needle, matching, decoy) => {
      const hit = await createCounterparty(context.app, matching);
      const miss = await createCounterparty(context.app, decoy);
      await createLabel(context.app, { counterpartyId: hit.id, layoutNumber: '1' });
      await createLabel(context.app, { counterpartyId: miss.id, layoutNumber: '2' });
      expect(layoutNumbers(await list({ search: needle }))).toEqual(['1']);
    });

    it('SQL в поиске — просто текст', async () => {
      await createLabel(context.app, { layoutNumber: '1' });
      const page = await list({ search: "'; DROP TABLE labels; --" });
      expect(page.total).toBe(0);
      expect((await list()).total).toBe(1);
    });
  });

  describe('by-barcode', () => {
    const byBarcode = (code: string) =>
      context.app.inject({ url: `/api/labels/by-barcode/${encodeURIComponent(code)}` });

    it('находит по коду, набранному кириллицей с пробелами', async () => {
      const label = await createLabel(context.app, { barcode: 'ABC123' });
      const response = await byBarcode(' ФИС123 ');
      expect(response.statusCode).toBe(200);
      expect(response.json<Label>().id).toBe(label.id);
    });

    it('удалённую позицию не находит', async () => {
      const label = await createLabel(context.app, { barcode: 'GONE' });
      await context.app.inject({ method: 'DELETE', url: `/api/labels/${label.id}` });
      const response = await byBarcode('GONE');
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });

    it('находит активную, если удалённая занимала тот же код раньше', async () => {
      const old = await createLabel(context.app, { barcode: 'REUSED' });
      await context.app.inject({ method: 'DELETE', url: `/api/labels/${old.id}` });
      const fresh = await createLabel(context.app, { barcode: 'REUSED' });
      expect((await byBarcode('REUSED')).json<Label>().id).toBe(fresh.id);
    });

    it.each([['%'], ['_'], ['ABC%']])('шаблон %s не совпадает с чужим кодом', async (code) => {
      await createLabel(context.app, { barcode: 'ABC123' });
      expect((await byBarcode(code)).statusCode).toBe(404);
    });

    it('код из одних управляющих символов → 404', async () => {
      expect((await byBarcode('​')).statusCode).toBe(404);
    });

    // Схема параметра допускает сырой код до 256 символов: длинный ввод должен доходить до неё,
    // а ответ — быть в общем формате { code, message }.
    it('код 150 символов (в пределах схемы) → 404 NOT_FOUND в общем формате', async () => {
      const response = await byBarcode('1'.repeat(150));
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('NOT_FOUND');
    });

    it('код длиннее 256 символов → 400 VALIDATION_ERROR в общем формате', async () => {
      const response = await byBarcode('1'.repeat(257));
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('VALIDATION_ERROR');
    });
  });
});
