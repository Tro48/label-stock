import { ERROR_CODES, duplicateDetailsSchema, type DuplicateDetails } from '@label-stock/shared';
import { ApiError, errorMessage } from '../../shared/api/client';

export interface ServerErrorOutcome {
  /** Ошибки конкретных полей: показываются под полем. */
  fieldErrors: Record<string, string>;
  /** Общая ошибка формы — в role="alert" над кнопками. */
  formError?: string;
  /** Значение занято другой позицией: фронт даёт ссылку на неё. */
  duplicate?: DuplicateDetails;
  versionConflict: boolean;
}

export function interpretServerError(error: unknown): ServerErrorOutcome {
  const outcome: ServerErrorOutcome = { fieldErrors: {}, versionConflict: false };
  if (!(error instanceof ApiError)) return { ...outcome, formError: errorMessage(error) };

  if (error.code === ERROR_CODES.duplicate) {
    const parsed = duplicateDetailsSchema.safeParse(error.details);
    if (parsed.success) {
      outcome.duplicate = parsed.data;
      outcome.fieldErrors[parsed.data.field] = error.message;
      return outcome;
    }
  }
  if (error.code === ERROR_CODES.versionConflict) {
    return { ...outcome, versionConflict: true, formError: error.message };
  }
  if (error.code === ERROR_CODES.validation && error.details) {
    for (const [field, message] of Object.entries(error.details)) {
      if (typeof message === 'string') outcome.fieldErrors[field] = message;
    }
    if (Object.keys(outcome.fieldErrors).length > 0) return outcome;
  }
  return { ...outcome, formError: error.message };
}
