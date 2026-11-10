import type { CreateStockRequestInput, Label, StockRequestKind } from '@label-stock/shared';
import { formatQuantity } from '../../shared/format';
import { quantityInputSchema } from '../labels/label-form-schema';

/** Сколько можно забрать со склада: старый макет перемещать нельзя. */
export function usableQuantity(label: Label): number {
  return label.quantity - label.obsoleteQuantity;
}

/** Ошибки по id позиции: показываются в строке этой позиции. */
export type RowErrors = Readonly<Record<string, string>>;

export type BuildRequestResult =
  { ok: true; input: CreateStockRequestInput } | { ok: false; errors: RowErrors };

function parseTransferAmount(label: Label, amount: string): number | string {
  const parsed = quantityInputSchema.safeParse(amount);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Ошибка';
  if (parsed.data === 0) return 'Укажите количество больше нуля';
  const usable = usableQuantity(label);
  if (parsed.data > usable) return `Доступно только ${formatQuantity(usable)} шт.`;
  return parsed.data;
}

/** amounts — введённое количество по id позиции; для утилизации не нужно. */
export function buildStockRequest(
  kind: StockRequestKind,
  labels: readonly Label[],
  amounts: Readonly<Record<string, string>>,
): BuildRequestResult {
  if (kind === 'disposal') {
    return { ok: true, input: { kind, items: labels.map((label) => ({ labelId: label.id })) } };
  }
  const errors: Record<string, string> = {};
  const items: { labelId: string; quantity: number }[] = [];
  for (const label of labels) {
    const result = parseTransferAmount(label, amounts[label.id] ?? '');
    if (typeof result === 'string') errors[label.id] = result;
    else items.push({ labelId: label.id, quantity: result });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { kind, items } };
}
