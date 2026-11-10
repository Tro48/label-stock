import type { CreateMovementInput, MovementResult } from '@label-stock/shared';
import { formatQuantity } from '../../shared/format';
import { quantityInputSchema } from '../labels/label-form-schema';

export type StockOperation = 'consumption' | 'print';

export interface StockOperationValues {
  amount: string;
  printedAt: string;
  comment: string;
  /** Только для допечатки: старый остаток уходит в утилизацию. */
  layoutChanged: boolean;
}

export type BuildResult = { ok: true; input: CreateMovementInput } | { ok: false; error: string };

/** Переводит поле «количество» в операцию API: знак дельты задаёт кнопка, а не пользователь. */
export function buildMovementInput(
  operation: StockOperation,
  { amount, printedAt, comment, layoutChanged }: StockOperationValues,
): BuildResult {
  const parsed = quantityInputSchema.safeParse(amount);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ошибка' };
  const value = parsed.data;
  const commentValue = comment.trim() || undefined;

  if (value === 0) return { ok: false, error: 'Укажите количество больше нуля' };
  if (operation === 'consumption') {
    return { ok: true, input: { reason: 'consumption', delta: -value, comment: commentValue } };
  }
  return {
    ok: true,
    input: {
      reason: 'print',
      delta: value,
      printedAt: printedAt || undefined,
      layoutChanged,
      comment: commentValue,
    },
  };
}

/** Текст для live-области после операции: его услышит пользователь скринридера. */
export function describeOperationResult(operation: StockOperation, result: MovementResult): string {
  const { label, movement } = result;
  const remainder = `остаток ${formatQuantity(label.quantity)} шт.`;
  if (!movement) return `Остаток не изменился: ${remainder}`;
  const amount = formatQuantity(Math.abs(movement.delta));
  switch (operation) {
    case 'consumption':
      return `Списано ${amount} шт., ${remainder}`;
    case 'print':
      return `Допечатано ${amount} шт., ${remainder}`;
  }
}
