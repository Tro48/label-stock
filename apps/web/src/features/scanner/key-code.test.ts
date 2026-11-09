import { describe, expect, it } from 'vitest';
import { keyToLatinChar, type KeyLike } from './key-code';

function key(
  code: string,
  keyValue: string,
  options: Partial<KeyLike> & { capsLock?: boolean } = {},
) {
  const { capsLock, ...rest } = options;
  return {
    code,
    key: keyValue,
    shiftKey: false,
    ...(capsLock === undefined
      ? {}
      : { getModifierState: (name: string) => name === 'CapsLock' && capsLock }),
    ...rest,
  };
}

describe('keyToLatinChar', () => {
  it('буква по code в нижнем регистре', () => {
    expect(keyToLatinChar(key('KeyF', 'f'))).toBe('f');
  });

  it('русская раскладка: key кириллица, символ берётся по code', () => {
    expect(keyToLatinChar(key('KeyF', 'а'))).toBe('f');
    expect(keyToLatinChar(key('KeyQ', 'й'))).toBe('q');
    expect(keyToLatinChar(key('KeyF', 'А', { shiftKey: true }))).toBe('F');
  });

  it('Shift даёт заглавную букву', () => {
    expect(keyToLatinChar(key('KeyA', 'Ф', { shiftKey: true }))).toBe('A');
  });

  it('CapsLock даёт заглавную, CapsLock + Shift — строчную', () => {
    expect(keyToLatinChar(key('KeyA', 'Ф', { capsLock: true }))).toBe('A');
    expect(keyToLatinChar(key('KeyA', 'ф', { capsLock: true, shiftKey: true }))).toBe('a');
  });

  it('без getModifierState CapsLock считается выключенным', () => {
    expect(keyToLatinChar({ code: 'KeyB', key: 'и', shiftKey: false })).toBe('b');
  });

  it.each([
    ['KeyE', 'E', false, 'E'],
    ['KeyE', 'e', true, 'e'],
    ['Digit5', '5', false, '5'],
    ['Minus', '_', true, '_'],
    ['Space', ' ', false, ' '],
    ['Backquote', '~', true, '~'],
  ])(
    'латиница и совпадающие с раскладкой символы (%s, %s) сохраняют регистр',
    (code, keyValue, shiftKey, expected) => {
      expect(keyToLatinChar(key(code, keyValue, { shiftKey, capsLock: true }))).toBe(expected);
    },
  );

  it('латинская буква в key важнее code: эмулятор шлёт key без соответствующего code', () => {
    expect(keyToLatinChar(key('KeyQ', 'Z'))).toBe('Z');
  });

  it.each([
    ['Slash', '.', false, '/'],
    ['Digit2', '"', true, '@'],
    ['Digit4', ';', true, '$'],
    ['Digit6', ':', true, '^'],
    ['Digit7', '?', true, '&'],
  ])(
    'русская раскладка: ASCII-символ из key (%s → %s) заменяется латинским по code',
    (code, keyValue, shiftKey, expected) => {
      expect(keyToLatinChar(key(code, keyValue, { shiftKey }))).toBe(expected);
    },
  );

  it.each([
    ['Digit0', '0'],
    ['Digit9', '9'],
    ['Numpad0', '0'],
    ['Numpad7', '7'],
  ])('цифра %s → %s', (code, expected) => {
    expect(keyToLatinChar(key(code, expected))).toBe(expected);
  });

  it('цифра Numpad по code, если key не ASCII', () => {
    expect(keyToLatinChar(key('Numpad3', 'Unidentified'))).toBe('3');
  });

  it('цифра с Shift даёт символ латинской раскладки, а не русской', () => {
    // В русской раскладке Shift+3 — «№», сканер при этом имел в виду «#».
    expect(keyToLatinChar(key('Digit3', '№', { shiftKey: true }))).toBe('#');
  });

  it('цифры Numpad по code не зависят от Shift', () => {
    expect(keyToLatinChar(key('Numpad5', '٥', { shiftKey: true }))).toBe('5');
  });

  it.each([
    ['Minus', false, '-'],
    ['Minus', true, '_'],
    ['Slash', false, '/'],
    ['Period', false, '.'],
    ['NumpadDecimal', true, '.'],
    ['NumpadAdd', false, '+'],
  ])('не-ASCII key: символ по code %s (shift=%s) → %s', (code, shiftKey, expected) => {
    expect(keyToLatinChar(key(code, 'ё', { shiftKey }))).toBe(expected);
  });

  it('неизвестный code: берётся печатаемый key как есть', () => {
    expect(keyToLatinChar(key('', 'x'))).toBe('x');
    expect(keyToLatinChar(key('Unidentified', 'Ж'))).toBe('Ж');
  });

  it.each([
    ['Enter', 'Enter'],
    ['ShiftLeft', 'Shift'],
    ['Tab', 'Tab'],
    ['ArrowDown', 'ArrowDown'],
    ['', ''],
  ])('непечатаемая клавиша %s → null', (code, keyValue) => {
    expect(keyToLatinChar(key(code, keyValue))).toBeNull();
  });
});
