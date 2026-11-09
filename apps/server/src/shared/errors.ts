import { ERROR_CODES, type DuplicateDetails, type ErrorCode } from '@label-stock/shared';

/** Ожидаемая ошибка предметной области: отдаётся клиенту как есть в формате `{ code, message, details }`. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message: string) => new AppError(404, ERROR_CODES.notFound, message);

export const versionConflict = () =>
  new AppError(409, ERROR_CODES.versionConflict, 'Позицию изменили, обновите данные');

export const duplicate = (message: string, details: DuplicateDetails) =>
  new AppError(409, ERROR_CODES.duplicate, message, details);

export const labelDeleted = () =>
  new AppError(409, ERROR_CODES.labelDeleted, 'Позиция удалена, сначала восстановите её');

export const negativeStock = () =>
  new AppError(422, ERROR_CODES.negativeStock, 'Остаток не может уйти в минус');

const PG_UNIQUE_VIOLATION = '23505';

/** Имя нарушенного уникального индекса, если ошибка — нарушение уникальности PostgreSQL. */
export function uniqueViolationConstraint(error: unknown): string | undefined {
  const pgError = findPgError(error);
  return pgError?.code === PG_UNIQUE_VIOLATION ? pgError.constraint : undefined;
}

interface PgErrorShape {
  code?: string;
  constraint?: string;
}

// Drizzle оборачивает ошибку драйвера в DrizzleQueryError, исходная лежит в `cause`.
function findPgError(error: unknown): PgErrorShape | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const candidate = current as Error & PgErrorShape;
    if (typeof candidate.code === 'string') return candidate;
    current = candidate.cause;
  }
  return undefined;
}
