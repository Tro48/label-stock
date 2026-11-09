import { describe, expect, it } from 'vitest';
import { createCounterparty, createLabel, readJournal, readQuantity, useTestApp } from './helpers';
import {
  csvOf,
  importCsv,
  postImport,
  readCounterpartyNames,
  readJournalWithComments,
  readLabels,
  snapshotDatabase,
} from './import-helpers';

const IMPORT_COMMENT = 'Загрузка из CSV';

describe('загрузка CSV: создание и обновление позиций', () => {
  const context = useTestApp();

  it('новые позиции создаются, остаток > 0 пишется движением created', async () => {
    const result = await importCsv(
      context.app,
      csvOf('Ромашка;007;4600000000015;01.11.2026;12;первая', 'Ромашка;008;;02.11.2026;0;'),
    );
    expect(result).toEqual({
      applied: true,
      created: 2,
      updated: 0,
      unchanged: 0,
      errors: [],
      errorsTruncated: false,
    });

    const [first, second] = await readLabels(context.pool);
    expect(first).toMatchObject({
      counterparty: 'Ромашка',
      layoutNumber: '007',
      barcode: '4600000000015',
      printedAt: '2026-11-01',
      quantity: 12,
      comment: 'первая',
    });
    expect(second).toMatchObject({
      layoutNumber: '008',
      barcode: null,
      quantity: 0,
      comment: null,
    });
    expect(await readJournalWithComments(context.pool, first!.id)).toEqual([
      { delta: 12, reason: 'created', comment: IMPORT_COMMENT },
    ]);
    expect(await readJournal(context.pool, second!.id)).toEqual([]);
  });

  it('новые контрагенты создаются один раз, существующие переиспользуются без учёта регистра', async () => {
    await createCounterparty(context.app, 'Ромашка');
    await importCsv(
      context.app,
      csvOf(
        'РОМАШКА;1;;01.11.2026;1;',
        'ромашка;2;;01.11.2026;1;',
        'Лютик;3;;01.11.2026;1;',
        'ЛЮТИК;4;;01.11.2026;1;',
      ),
    );
    expect(await readCounterpartyNames(context.pool)).toEqual(['Лютик', 'Ромашка']);
    const labels = await readLabels(context.pool);
    expect(labels.map((label) => label.counterparty)).toEqual([
      'Ромашка',
      'Ромашка',
      'Лютик',
      'Лютик',
    ]);
  });

  it('позиция ищется по номеру: остаток меняется через inventory с комментарием', async () => {
    const label = await createLabel(context.app, { layoutNumber: '007', quantity: 100 });
    const result = await importCsv(context.app, csvOf('Ромашка;007;;01.11.2026;80;'));
    expect(result).toMatchObject({ applied: true, created: 0, updated: 1, unchanged: 0 });
    expect(await readQuantity(context.pool, label.id)).toBe(80);
    expect(await readJournalWithComments(context.pool, label.id)).toEqual([
      { delta: 100, reason: 'created', comment: null },
      { delta: -20, reason: 'inventory', comment: IMPORT_COMMENT },
    ]);
  });

  it('без номера позиция ищется по нормализованному штрихкоду', async () => {
    const label = await createLabel(context.app, {
      layoutNumber: '5',
      barcode: '4600000000015',
      quantity: 10,
    });
    const result = await importCsv(context.app, csvOf('Ромашка;;4600 0000 00015;01.11.2026;15;'));
    expect(result).toMatchObject({ created: 0, updated: 1 });
    const [stored] = await readLabels(context.pool);
    expect(stored).toMatchObject({ id: label.id, layoutNumber: '5', quantity: 15 });
  });

  it('пустые ячейки не стирают штрихкод и комментарий; всё совпало — unchanged', async () => {
    const label = await createLabel(context.app, {
      layoutNumber: '7',
      barcode: '4600000000015',
      comment: 'важное',
      quantity: 10,
    });
    const result = await importCsv(context.app, csvOf('Ромашка;7;;01.11.2026;10;'));
    expect(result).toMatchObject({ applied: true, created: 0, updated: 0, unchanged: 1 });
    const [stored] = await readLabels(context.pool);
    expect(stored).toMatchObject({ barcode: '4600000000015', comment: 'важное', version: 1 });
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('меняются контрагент, дата, штрихкод и комментарий; движения нет, если остаток тот же', async () => {
    const label = await createLabel(context.app, { layoutNumber: '7', quantity: 10 });
    const result = await importCsv(context.app, csvOf('Лютик;7;4600000000015;1.12.2026;10;новый'));
    expect(result).toMatchObject({ updated: 1, unchanged: 0 });
    const [stored] = await readLabels(context.pool);
    expect(stored).toMatchObject({
      id: label.id,
      counterparty: 'Лютик',
      barcode: '4600000000015',
      printedAt: '2026-12-01',
      comment: 'новый',
      quantity: 10,
    });
    expect(stored!.version).toBeGreaterThan(1);
    expect(await readJournal(context.pool, label.id)).toHaveLength(1);
  });

  it('удалённая позиция с тем же номером не мешает создать новую', async () => {
    const gone = await createLabel(context.app, { layoutNumber: '7', barcode: '4600000000015' });
    await context.app.inject({ method: 'DELETE', url: `/api/labels/${gone.id}` });

    const result = await importCsv(context.app, csvOf('Ромашка;7;4600000000015;01.11.2026;3;'));
    expect(result).toMatchObject({ applied: true, created: 1, updated: 0 });
    const labels = await readLabels(context.pool);
    expect(labels).toHaveLength(2);
    expect(labels.find((label) => label.id === gone.id)).toMatchObject({
      deleted: true,
      quantity: 100,
    });
    expect(labels.find((label) => label.id !== gone.id)).toMatchObject({
      deleted: false,
      quantity: 3,
    });
  });

  it('смешанный файл: created, updated, unchanged считаются раздельно', async () => {
    await createLabel(context.app, { layoutNumber: '1', quantity: 5 });
    await createLabel(context.app, { layoutNumber: '2', quantity: 5 });
    const result = await importCsv(
      context.app,
      csvOf('Ромашка;1;;01.11.2026;5;', 'Ромашка;2;;01.11.2026;6;', 'Ромашка;3;;01.11.2026;7;'),
    );
    expect(result).toMatchObject({ applied: true, created: 1, updated: 1, unchanged: 1 });
  });
});

describe('загрузка CSV: всё или ничего', () => {
  const context = useTestApp();

  it('одна плохая строка — ничего не записано, applied=false, счётчики посчитаны', async () => {
    const label = await createLabel(context.app, { layoutNumber: '1', quantity: 5 });
    const before = await snapshotDatabase(context.pool);

    const result = await importCsv(
      context.app,
      csvOf('Ромашка;1;;01.11.2026;50;', 'Новый;2;;01.11.2026;1;', 'Ромашка;3;;01.11.2026;-1;'),
    );
    expect(result).toEqual({
      applied: false,
      created: 1,
      updated: 1,
      unchanged: 0,
      errors: [{ line: 4, message: 'Остаток: ожидается целое число не меньше нуля' }],
      errorsTruncated: false,
    });
    expect(await snapshotDatabase(context.pool)).toEqual(before);
    expect(await readQuantity(context.pool, label.id)).toBe(5);
  });

  it('dryRun: счётчики посчитаны, в БД ничего, новый контрагент не создан', async () => {
    await createLabel(context.app, { layoutNumber: '1', quantity: 5 });
    const before = await snapshotDatabase(context.pool);

    const result = await importCsv(
      context.app,
      csvOf('Ромашка;1;;01.11.2026;6;', 'Новый;2;;01.11.2026;1;'),
      { dryRun: true },
    );
    expect(result).toEqual({
      applied: false,
      created: 1,
      updated: 1,
      unchanged: 0,
      errors: [],
      errorsTruncated: false,
    });
    expect(await snapshotDatabase(context.pool)).toEqual(before);
  });

  it('dryRun=false — то же, что без параметра', async () => {
    const result = await importCsv(context.app, csvOf('Ромашка;1;;01.11.2026;1;'), {
      dryRun: false,
    });
    expect(result.applied).toBe(true);
    expect(await readLabels(context.pool)).toHaveLength(1);
  });

  it('некорректный dryRun → 400 VALIDATION_ERROR, ничего не записано', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/api/import.csv?dryRun=может',
      headers: { 'content-type': 'text/csv' },
      payload: csvOf('Ромашка;1;;01.11.2026;1;'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await readLabels(context.pool)).toEqual([]);
  });

  it('штрихкод занят другой активной позицией → ошибка строки, а не 500', async () => {
    await createLabel(context.app, { layoutNumber: '1', barcode: '4600000000015' });
    const before = await snapshotDatabase(context.pool);

    const response = await postImport(
      context.app,
      csvOf('Ромашка;2;4600000000015;01.11.2026;1;', 'Ромашка;3;;01.11.2026;1;'),
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      applied: false,
      created: 1,
      errors: [{ line: 2, message: 'Штрихкод уже занят другой позицией' }],
    });
    expect(await snapshotDatabase(context.pool)).toEqual(before);
  });

  it('обновление по номеру на штрихкод чужой позиции → ошибка строки', async () => {
    await createLabel(context.app, { layoutNumber: '1', barcode: '4600000000015' });
    await createLabel(context.app, { layoutNumber: '2', barcode: null });
    const result = await importCsv(context.app, csvOf('Ромашка;2;4600000000015;01.11.2026;1;'));
    expect(result).toMatchObject({
      applied: false,
      errors: [{ line: 2, message: 'Штрихкод уже занят другой позицией' }],
    });
  });

  it('после ошибки строки в savepoint следующие строки обрабатываются', async () => {
    await createLabel(context.app, { layoutNumber: '1', barcode: 'TAKEN' });
    const result = await importCsv(
      context.app,
      csvOf(
        'Ромашка;2;TAKEN;01.11.2026;1;',
        'Ромашка;3;;01.11.2026;1;',
        'Ромашка;4;;01.11.2026;1;',
      ),
    );
    expect(result).toMatchObject({ created: 2, errors: [{ line: 2 }] });
  });

  it('дубли номера и штрихкода внутри файла', async () => {
    const result = await importCsv(
      context.app,
      csvOf(
        'Ромашка;1;A1;01.11.2026;1;',
        'Ромашка;1;B2;01.11.2026;1;',
        'Ромашка;;A 1;01.11.2026;1;',
      ),
    );
    expect(result.applied).toBe(false);
    expect(result.errors).toEqual([
      { line: 3, message: 'Номер макета 1 уже есть в строке 2' },
      { line: 4, message: 'Штрихкод A1 уже есть в строке 2' },
    ]);
    expect(await readLabels(context.pool)).toEqual([]);
  });

  it('ошибки разных этапов отсортированы по строке', async () => {
    await createLabel(context.app, { layoutNumber: '100', barcode: 'TAKEN' });
    const result = await importCsv(
      context.app,
      csvOf(
        'Ромашка;1;TAKEN;01.11.2026;1;',
        'Ромашка;2;;вчера;1;',
        'Ромашка;3;;01.11.2026;1;',
        'Ромашка;3;;01.11.2026;1;',
      ),
    );
    expect(result.errors.map((error) => error.line)).toEqual([2, 3, 5]);
  });

  it('больше 100 ошибок: отдаются первые 100 и errorsTruncated', async () => {
    const lines = Array.from({ length: 150 }, (_, index) => `Ромашка;${index};;вчера;1;`);
    const result = await importCsv(context.app, csvOf(...lines));
    expect(result.errors).toHaveLength(100);
    expect(result.errors[0]?.line).toBe(2);
    expect(result.errors[99]?.line).toBe(101);
    expect(result.errorsTruncated).toBe(true);
  });

  it('ровно 100 ошибок — без errorsTruncated', async () => {
    const lines = Array.from({ length: 100 }, (_, index) => `Ромашка;${index};;вчера;1;`);
    const result = await importCsv(context.app, csvOf(...lines));
    expect(result.errors).toHaveLength(100);
    expect(result.errorsTruncated).toBe(false);
  });

  it('NUL в ячейке → ошибка строки, а не 500', async () => {
    const response = await postImport(context.app, csvOf('Ром\0ашка;1;;01.11.2026;1;к\0'));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      applied: false,
      errors: [
        { line: 2, message: 'Контрагент: Недопустимый символ' },
        { line: 2, message: 'Комментарий: Недопустимый символ' },
      ],
    });
  });
});
