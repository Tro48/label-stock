import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './client';

const MAX_SERVER_ERROR_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 10_000;

/**
 * При обрыве связи запросы повторяются бесконечно с растущей паузой — интерфейс показывает
 * «Нет связи с сервером, повторяем…». Ответы 4xx не повторяются: повтор их не исправит.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (!(error instanceof ApiError)) return failureCount < MAX_SERVER_ERROR_RETRIES;
  if (error.isNetworkError) return true;
  return error.status >= 500 && failureCount < MAX_SERVER_ERROR_RETRIES;
}

export function retryDelay(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, retryDelay, staleTime: 5_000 },
      mutations: { retry: false },
    },
  });
}
