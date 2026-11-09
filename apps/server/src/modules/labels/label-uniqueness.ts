import { type AppError, duplicate, uniqueViolationConstraint } from '../../shared/errors';
import type { LabelsRepository, UniqueLabelField } from './labels.repository';

const FIELD_BY_CONSTRAINT: Readonly<Record<string, UniqueLabelField>> = {
  labels_layout_number_active_uq: 'layoutNumber',
  labels_barcode_active_uq: 'barcode',
};

const DUPLICATE_MESSAGES: Readonly<Record<UniqueLabelField, string>> = {
  layoutNumber: 'Номер макета уже занят другой позицией',
  barcode: 'Штрихкод уже занят другой позицией',
};

/** Текст про занятый номер или штрихкод, если ошибка — нарушение уникальности позиции. */
export function describeUniqueViolation(error: unknown): string | undefined {
  const constraint = uniqueViolationConstraint(error);
  const field = constraint ? FIELD_BY_CONSTRAINT[constraint] : undefined;
  return field ? DUPLICATE_MESSAGES[field] : undefined;
}

export interface UniqueValues {
  layoutNumber?: string | null;
  barcode?: string | null;
}

/**
 * Переводит нарушение уникального индекса в 409 с указанием занявшей позиции.
 * Вызывается вне транзакции: после ошибки транзакция PostgreSQL уже прервана.
 */
export async function toDuplicateError(
  error: unknown,
  repository: LabelsRepository,
  values: UniqueValues,
  excludeId?: string,
): Promise<AppError | undefined> {
  const constraint = uniqueViolationConstraint(error);
  const field = constraint ? FIELD_BY_CONSTRAINT[constraint] : undefined;
  if (!field) return undefined;
  const value = values[field];
  const conflictingId = value
    ? await repository.findActiveIdByUniqueField(field, value, excludeId)
    : undefined;
  return duplicate(DUPLICATE_MESSAGES[field], { field, conflictingId: conflictingId ?? '' });
}
