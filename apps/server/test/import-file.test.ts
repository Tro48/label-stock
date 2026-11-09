import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '@label-stock/shared';
import { createCounterparty, createLabel, useTestApp } from './helpers';
import { CSV_HEADER, csvOf, importCsv, postImport, readLabels } from './import-helpers';

describe('загрузка CSV: формат файла', () => {
  const context = useTestApp();

  it('Excel в английской локали: `,`, BOM, кавычки с переводом строки, text/plain', async () => {
    const csv =
      '\uFEFFКонтрагент,№ макета,Штрихкод,Дата печати,Остаток,Комментарий\r\n' +
      '"ООО ""Ромашка, и Ко""",007,,2026-11-01,"1,200","две\r\nстроки"\r\n';
    const response = await postImport(context.app, csv, { contentType: 'text/plain' });
    // «1,200» с запятой — не число: разделитель разрядов в остатке — только пробел.
    expect(response.json()).toMatchObject({
      applied: false,
      errors: [{ line: 2, message: 'Остаток: ожидается целое число не меньше нуля' }],
    });

    const fixed = csv.replace('"1,200"', '"1 200"');
    expect(await importCsv(context.app, fixed)).toMatchObject({ applied: true, created: 1 });
    const [label] = await readLabels(context.pool);
    expect(label).toMatchObject({
      counterparty: 'ООО "Ромашка, и Ко"',
      layoutNumber: '007',
      quantity: 1200,
      comment: 'две\r\nстроки',
    });
  });

  it('порядок столбцов любой, регистр заголовков не важен, лишние столбцы игнорируются', async () => {
    const csv =
      'остаток;Примечание склада;КОНТРАГЕНТ;дата печати\n5;что угодно;Ромашка;1.11.2026\n';
    expect(await importCsv(context.app, csv)).toMatchObject({ applied: true, created: 1 });
    expect((await readLabels(context.pool))[0]).toMatchObject({
      counterparty: 'Ромашка',
      layoutNumber: null,
      printedAt: '2026-11-01',
      quantity: 5,
    });
  });

  it('остаток с пробелом и неразрывным пробелом, разные форматы даты', async () => {
    await importCsv(
      context.app,
      csvOf(
        'Ромашка;1;;01.11.2026;1 200;',
        'Ромашка;2;;1.11.2026;3\u00a0400;',
        'Ромашка;3;;2026-11-01;5;',
      ),
    );
    const labels = await readLabels(context.pool);
    expect(labels.map((label) => [label.printedAt, label.quantity])).toEqual([
      ['2026-11-01', 1200],
      ['2026-11-01', 3400],
      ['2026-11-01', 5],
    ]);
  });

  it('экранированная выгрузкой формула раскрывается обратно', async () => {
    await importCsv(context.app, csvOf("'=SUM(A1);1;;01.11.2026;1;'+7 999"));
    expect((await readLabels(context.pool))[0]).toMatchObject({
      counterparty: '=SUM(A1)',
      comment: '+7 999',
    });
  });

  it('пустые строки и строки из одних `;` пропускаются', async () => {
    const csv = `${CSV_HEADER}\r\n\r\n;;;;;\r\nРомашка;1;;01.11.2026;1;\r\n\r\n`;
    expect(await importCsv(context.app, csv)).toMatchObject({ applied: true, created: 1 });
  });

  it('номер строки в ошибке — строка Excel, даже если выше были пустые строки', async () => {
    // Excel показывает пустую строку отдельной строкой листа, и пользователь ищет ошибку
    // по номеру, который видит слева. Здесь плохая строка — четвёртая.
    const csv = `${CSV_HEADER}\r\nРомашка;1;;01.11.2026;1;\r\n;;;;;\r\nРомашка;2;;вчера;1;\r\n`;
    expect((await importCsv(context.app, csv)).errors).toEqual([
      { line: 4, message: 'Дата печати: ожидается дата вида 01.11.2026' },
    ]);
  });

  it('многострочная ячейка — одна строка Excel: следующая ошибка не сдвигается', async () => {
    const csv = `${CSV_HEADER}\r\nРомашка;1;;01.11.2026;1;"а\r\nб\r\nв"\r\nРомашка;2;;вчера;1;\r\n`;
    expect((await importCsv(context.app, csv)).errors).toMatchObject([{ line: 3 }]);
  });

  it.each([
    ['пустое тело', ''],
    ['только BOM и пустые строки', '\uFEFF\r\n\r\n'],
    ['только заголовок', `${CSV_HEADER}\r\n`],
  ])('%s → 400 VALIDATION_ERROR', async (_name, csv) => {
    const response = await postImport(context.app, csv);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    });
  });

  it('нет обязательных столбцов → 400 с их названиями', async () => {
    const response = await postImport(context.app, 'Контрагент;Комментарий\nРомашка;x\n');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'В первой строке файла нет столбцов: «Дата печати», «Остаток»',
    });
  });

  it('больше 10000 строк данных → 400, ничего не записано', async () => {
    const lines = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `Р;${i};;01.11.2026;1;`);
    const response = await postImport(context.app, csvOf(...lines));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await readLabels(context.pool)).toEqual([]);
  });

  it('тело больше общего лимита JSON (1 МБ), но меньше 5 МБ — принимается', async () => {
    const csv = `${CSV_HEADER}\r\n` + '\r\n'.repeat(1024 * 1024);
    const response = await postImport(context.app, csv);
    // Дошло до разбора: ошибка про содержимое, а не 413.
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ message: 'В файле нет строк с данными' });
  });

  it('тело больше 5 МБ → 413 в формате {code, message}', async () => {
    const csv = `${CSV_HEADER}\r\n` + 'x'.repeat(IMPORT_MAX_BYTES);
    const response = await postImport(context.app, csv);
    expect(response.statusCode).toBe(413);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.json()).toEqual({ code: expect.any(String), message: expect.any(String) });
  });

  it('неподдерживаемый Content-Type → 415 в формате {code, message}', async () => {
    const response = await postImport(context.app, csvOf('Ромашка;1;;01.11.2026;1;'), {
      contentType: 'application/octet-stream',
    });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ code: expect.any(String), message: expect.any(String) });
  });
});

describe('загрузка CSV: выгрузка → загрузка', () => {
  const context = useTestApp();

  const exportCsv = async () => (await context.app.inject({ url: '/api/export.csv' })).body;

  it('файл выгрузки загружается обратно без изменений', async () => {
    const formula = await createCounterparty(context.app, '=HYPERLINK("http://x";"y")');
    const quoted = await createCounterparty(context.app, 'ООО "Ромашка; и Ко"');
    await createLabel(context.app, {
      counterpartyId: formula.id,
      layoutNumber: '007',
      barcode: '4600000000015',
      quantity: 1200,
      comment: '-минус в начале',
    });
    await createLabel(context.app, {
      counterpartyId: quoted.id,
      layoutNumber: null,
      barcode: 'ABC-1',
      quantity: 0,
      comment: 'две\nстроки; и "кавычки"',
    });
    await createLabel(context.app, {
      counterpartyId: quoted.id,
      layoutNumber: '00123',
      barcode: null,
      comment: '@упоминание',
    });
    const before = await readLabels(context.pool);

    const result = await importCsv(context.app, await exportCsv());
    expect(result).toEqual({
      applied: true,
      created: 0,
      updated: 0,
      unchanged: 3,
      errors: [],
      errorsTruncated: false,
    });
    expect(await readLabels(context.pool)).toEqual(before);
  });

  it('комментарий, начинающийся с апострофа и формулы, переживает выгрузку и загрузку', async () => {
    // Выгрузка не экранирует `'=1`, потому что он начинается с апострофа, а загрузка снимает
    // апостроф перед `=` — значение не должно меняться.
    await createLabel(context.app, { layoutNumber: '1', comment: "'=1+1" });
    const result = await importCsv(context.app, await exportCsv());
    expect(result).toMatchObject({ unchanged: 1, updated: 0 });
    expect((await readLabels(context.pool))[0]?.comment).toBe("'=1+1");
  });

  it('пустая база: выгрузка из одного заголовка не загружается — 400', async () => {
    const response = await postImport(context.app, await exportCsv());
    expect(response.statusCode).toBe(400);
  });
});
