export const BARCODE_MAX_LENGTH = 64;

// Сканер при русской раскладке печатает символы той же физической клавиши:
// вместо `ABC123` приходит `ФИС123`. Таблица переводит ЙЦУКЕН в QWERTY по позиции клавиши.
// prettier-ignore
const CYRILLIC_TO_LATIN_KEYS: Readonly<Record<string, string>> = {
  й: 'q', ц: 'w', у: 'e', к: 'r', е: 't', н: 'y', г: 'u', ш: 'i', щ: 'o', з: 'p', х: '[', ъ: ']',
  ф: 'a', ы: 's', в: 'd', а: 'f', п: 'g', р: 'h', о: 'j', л: 'k', д: 'l', ж: ';', э: "'",
  я: 'z', ч: 'x', с: 'c', м: 'v', и: 'b', т: 'n', ь: 'm', б: ',', ю: '.', ё: '`',
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P', Х: '{', Ъ: '}',
  Ф: 'A', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J', Л: 'K', Д: 'L', Ж: ':', Э: '"',
  Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M', Б: '<', Ю: '>', Ё: '~',
};

const WHITESPACE_AND_CONTROL = /[\s\p{Cc}\p{Cf}]/gu;

/** Единая точка нормализации штрихкода для клиента и сервера. */
export function normalizeBarcode(raw: string): string {
  let normalized = '';
  for (const char of raw.replace(WHITESPACE_AND_CONTROL, '')) {
    normalized += CYRILLIC_TO_LATIN_KEYS[char] ?? char;
  }
  return normalized;
}

const EAN13_PATTERN = /^\d{13}$/;

export function looksLikeEan13(barcode: string): boolean {
  return EAN13_PATTERN.test(barcode);
}

export function isValidEan13Checksum(barcode: string): boolean {
  if (!looksLikeEan13(barcode)) return false;
  const digits = [...barcode].map(Number);
  const checkDigit = digits.pop()!;
  const weightedSum = digits.reduce(
    (sum, digit, index) => sum + digit * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (weightedSum % 10)) % 10 === checkDigit;
}

/** Похож на EAN-13, но контрольная сумма не сходится: показываем предупреждение, не ошибку. */
export function hasEan13ChecksumWarning(barcode: string): boolean {
  return looksLikeEan13(barcode) && !isValidEan13Checksum(barcode);
}
