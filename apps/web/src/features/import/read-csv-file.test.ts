import { describe, expect, it } from 'vitest';
import { readCsvFile } from './read-csv-file';

// «Контрагент;Остаток» в Windows-1251 — так сохраняет «CSV (разделители — запятые)» русский Excel.
const CP1251_HEADER = [
  0xca, 0xee, 0xed, 0xf2, 0xf0, 0xe0, 0xe3, 0xe5, 0xed, 0xf2, 0x3b, 0xce, 0xf1, 0xf2, 0xe0, 0xf2,
  0xee, 0xea,
];

const blobOf = (bytes: number[] | Uint8Array) => new Blob([new Uint8Array(bytes)]);
const utf8 = (text: string) => new TextEncoder().encode(text);

describe('readCsvFile', () => {
  it('UTF-8 читается как есть', async () => {
    await expect(readCsvFile(blobOf(utf8('Контрагент;Остаток\r\nРомашка;1')))).resolves.toBe(
      'Контрагент;Остаток\r\nРомашка;1',
    );
  });

  it('UTF-8 с BOM: текст без потерь, BOM серверу не мешает', async () => {
    const text = await readCsvFile(blobOf([0xef, 0xbb, 0xbf, ...utf8('Контрагент')]));
    expect(text.replace(/^\uFEFF/, '')).toBe('Контрагент');
  });

  it('байты Windows-1251 → кириллица, а не знаки замены', async () => {
    const text = await readCsvFile(blobOf(CP1251_HEADER));
    expect(text).toBe('Контрагент;Остаток');
    expect(text).not.toContain('�');
  });

  it('Windows-1251: буквы ё/Ё и неразрывный пробел', async () => {
    await expect(readCsvFile(blobOf([0xb8, 0xa8, 0xa0, 0x31]))).resolves.toBe('ёЁ\u00a01');
  });

  it('ASCII одинаков в обеих кодировках', async () => {
    await expect(readCsvFile(blobOf(utf8('a;b\r\n1;2')))).resolves.toBe('a;b\r\n1;2');
  });

  it('пустой файл → пустая строка', async () => {
    await expect(readCsvFile(blobOf([]))).resolves.toBe('');
  });

  it('обрезанный многобайтовый символ UTF-8 → перечитывается как 1251, без исключения', async () => {
    const bytes = utf8('Ромашка').slice(0, -1);
    const text = await readCsvFile(blobOf(bytes));
    expect(text).not.toContain('�');
    expect(text.length).toBe(bytes.length);
  });

  it('принимает File, как из <input type="file">', async () => {
    const file = new File([new Uint8Array(CP1251_HEADER)], 'ostatki.csv', { type: 'text/csv' });
    await expect(readCsvFile(file)).resolves.toBe('Контрагент;Остаток');
  });
});
