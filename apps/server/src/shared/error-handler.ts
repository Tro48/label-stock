import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ERROR_CODES, type ErrorResponse } from '@label-stock/shared';
import { AppError } from './errors';

const INTERNAL_ERROR_BODY: ErrorResponse = {
  code: ERROR_CODES.internal,
  message: 'Внутренняя ошибка сервера',
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorResponse = { code: error.code, message: error.message };
      if (error.details) body.details = error.details;
      return reply.status(error.statusCode).send(body);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: Record<string, string> = {};
      for (const issue of error.validation) {
        const field = issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || 'request';
        details[field] ??= issue.message ?? 'Некорректное значение';
      }
      return reply.status(400).send({
        code: ERROR_CODES.validation,
        message: 'Проверьте заполнение полей',
        details,
      } satisfies ErrorResponse);
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        code: ERROR_CODES.rateLimited,
        message: 'Слишком много запросов, повторите позже',
      } satisfies ErrorResponse);
    }

    if (error.statusCode === 413) {
      return reply.status(413).send({
        code: ERROR_CODES.validation,
        message: 'Слишком большой запрос: разбейте файл на части',
      } satisfies ErrorResponse);
    }

    // Ошибки самого Fastify с 4xx (битый JSON, слишком большое тело) безопасно отдать как есть.
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        code: ERROR_CODES.validation,
        message: error.message,
      } satisfies ErrorResponse);
    }

    request.log.error({ err: error }, 'Необработанная ошибка');
    return reply.status(500).send(INTERNAL_ERROR_BODY);
  });
}
