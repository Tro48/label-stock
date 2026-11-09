import type { ErrorResponse } from '@label-stock/shared';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

/** Ошибка запроса к API: либо ответ сервера в формате `{ code, message, details }`, либо обрыв связи. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.code === NETWORK_ERROR_CODE;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: QueryParams;
  signal?: AbortSignal;
}

export async function apiRequest<Result>(
  path: string,
  { method = 'GET', body, params, signal }: RequestOptions = {},
): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(buildUrl(`/api${path}`, params), {
      method,
      signal: signal ?? null,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, NETWORK_ERROR_CODE, 'Нет связи с сервером');
  }

  if (response.status === 204) return undefined as Result;
  const payload: unknown = await response.json().catch(() => undefined);
  if (response.ok) return payload as Result;

  const error = isErrorResponse(payload)
    ? payload
    : { code: 'HTTP_ERROR', message: `Ошибка сервера (${response.status})` };
  throw new ApiError(response.status, error.code, error.message, error.details);
}

function isErrorResponse(payload: unknown): payload is ErrorResponse {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as ErrorResponse).code === 'string' &&
    typeof (payload as ErrorResponse).message === 'string'
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Что-то пошло не так. Попробуйте ещё раз';
}
