import { describe, expect, it } from 'vitest';
import { todayIsoDate } from '@label-stock/shared';
import { createCounterparty, createLabel, useTestApp } from './helpers';

describe('выгрузка CSV', () => {
  const context = useTestApp();

  const exportCsv = () => context.app.inject({ url: '/api/export.csv' });

  it('заголовки ответа: text/csv utf-8 и attachment с датой', async () => {
    const response = await exportCsv();
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="ostatki-${todayIsoDate()}.csv"`,
    );
  });

  it('пустая база — BOM и строка заголовков', async () => {
    const response = await exportCsv();
    expect(response.body).toBe('﻿Контрагент;№ макета;Штрихкод;Дата печати;Остаток;Комментарий\r\n');
  });

  it('BOM, `;`, CRLF и экранирование `;` и кавычек в названии контрагента', async () => {
    const counterparty = await createCounterparty(context.app, 'ООО "Ромашка; и Ко"');
    await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: '007',
      barcode: '4600000000015',
      printedAt: '2026-11-01',
      quantity: 12,
      comment: 'две\nстроки',
    });

    const body = (await exportCsv()).body;
    expect(body.startsWith('﻿')).toBe(true);
    expect(body.endsWith('\r\n')).toBe(true);
    const lines = body.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('"ООО ""Ромашка; и Ко""";007;4600000000015;01.11.2026;12;"две\nстроки"');
  });

  it('ведущие нули номера сохраняются, пустые поля — пустые ячейки', async () => {
    await createLabel(context.app, {
      layoutNumber: '00123',
      barcode: null,
      comment: null,
      quantity: 0,
    });
    const lines = (await exportCsv()).body.slice(1).split('\r\n');
    expect(lines[1]).toBe('Ромашка;00123;;01.11.2026;0;');
  });

  it.each([
    ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
    ['+79990000000', "'+79990000000"],
    ['-сразу', "'-сразу"],
    ['@SUM(1)', "'@SUM(1)"],
    ['=HYPERLINK("http://evil";"x")', `"'=HYPERLINK(""http://evil"";""x"")"`],
  ])('формула в названии контрагента %j нейтрализуется', async (name, expectedCell) => {
    const counterparty = await createCounterparty(context.app, name);
    await createLabel(context.app, { counterpartyId: counterparty.id });
    const lines = (await exportCsv()).body.slice(1).split('\r\n');
    expect(lines[1]!.startsWith(`${expectedCell};`)).toBe(true);
  });

  it('формула в комментарии тоже нейтрализуется', async () => {
    await createLabel(context.app, { comment: '=1+1' });
    const lines = (await exportCsv()).body.slice(1).split('\r\n');
    expect(lines[1]!.endsWith(";'=1+1")).toBe(true);
  });

  it('удалённые позиции в выгрузку не попадают', async () => {
    const counterparty = await createCounterparty(context.app, 'Живой');
    const kept = await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: '1',
    });
    const gone = await createLabel(context.app, {
      counterpartyId: counterparty.id,
      layoutNumber: '2',
    });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${gone.id}` });

    const lines = (await exportCsv()).body.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`;${kept.layoutNumber};`);
  });

  it('порядок: контрагент без учёта регистра, затем номер по длине', async () => {
    const b = await createCounterparty(context.app, 'бета');
    const a = await createCounterparty(context.app, 'Альфа');
    await createLabel(context.app, { counterpartyId: b.id, layoutNumber: '1' });
    await createLabel(context.app, { counterpartyId: a.id, layoutNumber: '10' });
    await createLabel(context.app, { counterpartyId: a.id, layoutNumber: '9' });
    const lines = (await exportCsv()).body.slice(1).split('\r\n').filter(Boolean);
    expect(lines.slice(1).map((line) => line.split(';').slice(0, 2).join(';'))).toEqual([
      'Альфа;9',
      'Альфа;10',
      'бета;1',
    ]);
  });
});
