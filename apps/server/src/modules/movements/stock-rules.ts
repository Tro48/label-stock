import { ERROR_CODES, INT32_MAX } from '@label-stock/shared';
import type { LabelRow } from '../../db/schema';
import {
  AppError,
  labelDeleted,
  negativeStock,
  notFound,
  obsoleteStock,
} from '../../shared/errors';

export const labelNotFound = () => notFound('Позиция не найдена');

export function assertActive(label: LabelRow | undefined): asserts label is LabelRow {
  if (!label) throw labelNotFound();
  if (label.deletedAt) throw labelDeleted();
}

/** Объясняет, почему UPDATE из applyDelta отклонён: проверка идёт по заблокированной строке. */
export function assertDeltaAllowed(
  label: LabelRow | undefined,
  delta: number,
  usableOnly: boolean,
): void {
  assertActive(label);
  const result = label.quantity + delta;
  if (usableOnly && label.obsoleteQuantity > 0 && result < label.obsoleteQuantity) {
    throw obsoleteStock(label.quantity - label.obsoleteQuantity, label.obsoleteQuantity);
  }
  if (result < 0) throw negativeStock();
  if (result > INT32_MAX) {
    throw new AppError(422, ERROR_CODES.validation, 'Остаток получится слишком большим');
  }
}
