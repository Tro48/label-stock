import { describe, expect, it } from 'vitest';
import {
  BARCODE_MAX_LENGTH,
  hasEan13ChecksumWarning,
  isValidEan13Checksum,
  looksLikeEan13,
  normalizeBarcode,
} from './barcode';

describe('normalizeBarcode', () => {
  it.each([
    ['пробелы по краям и внутри', '  46 000 00  ', '4600000'],
    ['табы', '\t123\t456\t', '123456'],
    ['переводы строк от сканера', '123456\r\n', '123456'],
    ['неразрывный пробел', '12 34', '1234'],
    ['zero-width space', '12​34', '1234'],
    ['BOM', '﻿1234', '1234'],
    ['NUL', '12\u000034', '1234'],
    ['ESC и DEL', '\u001B12\u007F34', '1234'],
    ['soft hyphen (format-символ)', '12­34', '1234'],
    ['разделитель строк U+2028', '12 34', '1234'],
  ])('убирает %s', (_name, raw, expected) => {
    expect(normalizeBarcode(raw)).toBe(expected);
  });

  it('переводит кириллицу верхнего регистра по раскладке: ФИС123 → ABC123', () => {
    expect(normalizeBarcode('ФИС123')).toBe('ABC123');
  });

  it('переводит кириллицу нижнего регистра без смены регистра: фис → abc', () => {
    expect(normalizeBarcode('фис')).toBe('abc');
  });

  it('чинит смешанную раскладку: латиница и кириллица в одном коде', () => {
    // «С» здесь кириллическая, остальные буквы латинские.
    expect(normalizeBarcode('ABСD-12')).toBe('ABCD-12');
  });

  it('переводит всю строку ЙЦУКЕН в QWERTY по позициям клавиш', () => {
    expect(normalizeBarcode('йцукенгшщзхъ')).toBe('qwertyuiop[]');
    expect(normalizeBarcode('ЯЧСМИТЬБЮЁ')).toBe('ZXCVBNM<>~');
  });

  it('латиницу, цифры и знаки оставляет как есть', () => {
    expect(normalizeBarcode('Code-128/abc.XYZ')).toBe('Code-128/abc.XYZ');
  });

  it('пустая строка остаётся пустой', () => {
    expect(normalizeBarcode('')).toBe('');
  });

  it('строка только из пробелов и управляющих символов становится пустой', () => {
    expect(normalizeBarcode(' \t\r\n\u0000​﻿')).toBe('');
  });

  it('идемпотентна', () => {
    const once = normalizeBarcode(' ФИС 123\n');
    expect(normalizeBarcode(once)).toBe(once);
  });

  it('длину не ограничивает: лимит проверяет схема', () => {
    expect(normalizeBarcode('1'.repeat(BARCODE_MAX_LENGTH + 1))).toHaveLength(
      BARCODE_MAX_LENGTH + 1,
    );
  });
});

describe('EAN-13', () => {
  // Контрольные цифры пересчитаны вручную: 4006381333931 и 5901234123457 — валидные,
  // у 4600000000017 правильная контрольная цифра 5, а не 7.
  it.each(['4006381333931', '5901234123457', '4600000000015', '0000000000000'])(
    'валидная контрольная сумма: %s',
    (code) => {
      expect(looksLikeEan13(code)).toBe(true);
      expect(isValidEan13Checksum(code)).toBe(true);
      expect(hasEan13ChecksumWarning(code)).toBe(false);
    },
  );

  it.each(['4600000000017', '4006381333932', '5901234123450'])(
    'неверная контрольная сумма — предупреждение: %s',
    (code) => {
      expect(looksLikeEan13(code)).toBe(true);
      expect(isValidEan13Checksum(code)).toBe(false);
      expect(hasEan13ChecksumWarning(code)).toBe(true);
    },
  );

  it.each([
    ['12 цифр', '400638133393'],
    ['14 цифр', '40063813339310'],
    ['буквы', 'ABC1234567890'],
    ['пустая строка', ''],
    ['пробел внутри', '400638 333931'],
    ['арабско-индийские цифры', '٤٠٠٦٣٨١٣٣٣٩٣١'],
  ])('не EAN-13 (%s): без предупреждения', (_name, code) => {
    expect(looksLikeEan13(code)).toBe(false);
    expect(isValidEan13Checksum(code)).toBe(false);
    expect(hasEan13ChecksumWarning(code)).toBe(false);
  });
});
