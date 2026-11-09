const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Проверяет календарную дату `YYYY-MM-DD` без перевода во время, чтобы не зависеть от часового пояса. */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Сегодняшняя дата в локальном поясе в формате `YYYY-MM-DD`. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const RU_DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/**
 * Дата из ячейки Excel: `01.11.2026`, `1.11.2026` или `2026-11-01` → `2026-11-01`.
 * null — не дата или несуществующий день.
 */
export function parseRuOrIsoDate(value: string): string | null {
  const trimmed = value.trim();
  const ruMatch = RU_DATE_PATTERN.exec(trimmed);
  const iso = ruMatch
    ? `${ruMatch[3]}-${ruMatch[2]!.padStart(2, '0')}-${ruMatch[1]!.padStart(2, '0')}`
    : trimmed;
  return isValidIsoDate(iso) ? iso : null;
}

/** `2026-11-01` → `01.11.2026`. */
export function formatIsoDateRu(value: string): string {
  const match = ISO_DATE_PATTERN.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
