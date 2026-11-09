// event.code — физическая клавиша, от раскладки не зависит: при русской раскладке
// сканер нажимает те же клавиши, что и при английской, но event.key приходит кириллицей.
// prettier-ignore
const SYMBOL_KEYS: Readonly<Record<string, readonly [plain: string, shifted: string]>> = {
  Digit1: ['1', '!'], Digit2: ['2', '@'], Digit3: ['3', '#'], Digit4: ['4', '$'], Digit5: ['5', '%'],
  Digit6: ['6', '^'], Digit7: ['7', '&'], Digit8: ['8', '*'], Digit9: ['9', '('], Digit0: ['0', ')'],
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'],
  Semicolon: [';', ':'], Quote: ["'", '"'], Backquote: ['`', '~'], Backslash: ['\\', '|'],
  Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'],
  NumpadDivide: ['/', '/'], NumpadMultiply: ['*', '*'], NumpadSubtract: ['-', '-'],
  NumpadAdd: ['+', '+'], NumpadDecimal: ['.', '.'],
};

const LETTER_CODE = /^Key([A-Z])$/;
const NUMPAD_DIGIT_CODE = /^Numpad(\d)$/;

export interface KeyLike {
  code: string;
  key: string;
  shiftKey: boolean;
  getModifierState?: (key: string) => boolean;
}

const LATIN_LETTER = /^[A-Za-z]$/;

/**
 * Символ, который напечатала бы клавиша в латинской раскладке; null — не печатаемая клавиша.
 * Латинская буква в event.key уже верна вместе с регистром (эмуляторы и часть сканеров не
 * присылают Shift). Остальное берём по физической клавише event.code: при русской раскладке
 * цифровой ряд и знаки дают ASCII, но другие (`/` → `.`, Shift+2 → `"`).
 */
export function keyToLatinChar(event: KeyLike): string | null {
  if (LATIN_LETTER.test(event.key)) return event.key;
  const letter = LETTER_CODE.exec(event.code)?.[1];
  if (letter) {
    const capsLock = event.getModifierState?.('CapsLock') ?? false;
    return event.shiftKey !== capsLock ? letter : letter.toLowerCase();
  }
  const numpadDigit = NUMPAD_DIGIT_CODE.exec(event.code)?.[1];
  if (numpadDigit) return numpadDigit;
  const symbol = SYMBOL_KEYS[event.code];
  if (symbol) return event.shiftKey ? symbol[1] : symbol[0];
  // Неизвестный code (виртуальная клавиатура, эмуляторы): берём символ как есть, его поправит нормализация.
  return event.key.length === 1 ? event.key : null;
}
