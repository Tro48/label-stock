import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';

describe('escapeCsvCell', () => {
  it.each([
    ['обычный текст', 'Ромашка', 'Ромашка'],
    ['пустая строка', '', ''],
    ['число', 42, '42'],
    ['ноль', 0, '0'],
    ['null', null, ''],
    ['разделитель', 'ООО; Ромашка', '"ООО; Ромашка"'],
    ['кавычки', 'ООО "Ромашка"', '"ООО ""Ромашка"""'],
    ['перевод строки', 'строка 1\nстрока 2', '"строка 1\nстрока 2"'],
    ['CR', 'a\rb', '"a\rb"'],
    ['запятая не требует кавычек', 'a, b', 'a, b'],
  ])('%s', (_name, input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it.each([
    ['=SUM()', "'=SUM()"],
    ['+7 999', "'+7 999"],
    ['-1', "'-1"],
    ['@cmd', "'@cmd"],
    ['\tTAB', "'\tTAB"],
  ])('нейтрализует формулу %j', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('формула с разделителем: и апостроф, и кавычки', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x";"y")')).toBe(`"'=HYPERLINK(""http://x"";""y"")"`);
  });

  it('формулу с CR в начале экранирует и берёт в кавычки', () => {
    expect(escapeCsvCell('\r=1')).toBe(`"'\r=1"`);
  });

  it('отрицательное число как number не трогает: это не пользовательский текст', () => {
    expect(escapeCsvCell(-5)).toBe('-5');
  });
});

describe('toCsv', () => {
  it('BOM, разделитель `;`, CRLF и завершающий перевод строки', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        ['1', 2],
        [null, 'x;y'],
      ],
    );
    expect(csv).toBe('﻿A;B\r\n1;2\r\n;"x;y"\r\n');
  });

  it('без строк — только заголовок', () => {
    expect(toCsv(['A'], [])).toBe('﻿A\r\n');
  });
});
