export { formatIsoDateRu as formatDate } from '@label-stock/shared';

const quantityFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatQuantity(quantity: number): string {
  return quantityFormatter.format(quantity);
}

/** Дельта со знаком: `+500`, `−30` (типографский минус). */
export function formatDelta(delta: number): string {
  const formatted = formatQuantity(Math.abs(delta));
  if (delta === 0) return formatted;
  return delta > 0 ? `+${formatted}` : `−${formatted}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormatter.format(new Date(isoTimestamp));
}

/** Пустое значение в таблице показывается прочерком. */
export const EMPTY_VALUE = '—';
