import { describe, expect, it } from 'vitest';
import { ApiError, NETWORK_ERROR_CODE } from './client';
import { createQueryClient, retryDelay, shouldRetry } from './query-client';

const networkError = new ApiError(0, NETWORK_ERROR_CODE, 'Нет связи с сервером');
const serverError = (status: number) => new ApiError(status, 'INTERNAL_ERROR', 'Ошибка');

describe('shouldRetry', () => {
  it.each([0, 1, 2, 10, 1_000])(
    'сетевая ошибка повторяется всегда (попытка %s)',
    (failureCount) => {
      expect(shouldRetry(failureCount, networkError)).toBe(true);
    },
  );

  it.each([500, 502, 503, 599])('%s повторяется до 2 раз', (status) => {
    expect(shouldRetry(0, serverError(status))).toBe(true);
    expect(shouldRetry(1, serverError(status))).toBe(true);
    expect(shouldRetry(2, serverError(status))).toBe(false);
    expect(shouldRetry(3, serverError(status))).toBe(false);
  });

  it.each([400, 404, 409, 422, 429, 499])('%s не повторяется никогда', (status) => {
    expect(shouldRetry(0, serverError(status))).toBe(false);
  });

  it('не ApiError повторяется до 2 раз', () => {
    expect(shouldRetry(0, new Error('x'))).toBe(true);
    expect(shouldRetry(1, new Error('x'))).toBe(true);
    expect(shouldRetry(2, new Error('x'))).toBe(false);
  });
});

describe('retryDelay', () => {
  it('растёт вдвое', () => {
    expect(retryDelay(0)).toBe(1_000);
    expect(retryDelay(1)).toBe(2_000);
    expect(retryDelay(2)).toBe(4_000);
    expect(retryDelay(3)).toBe(8_000);
  });

  it('упирается в потолок 10 с', () => {
    expect(retryDelay(4)).toBe(10_000);
    expect(retryDelay(50)).toBe(10_000);
    expect(retryDelay(10_000)).toBe(10_000);
  });
});

describe('createQueryClient', () => {
  it('запросы повторяются по shouldRetry, мутации — никогда', () => {
    const options = createQueryClient().getDefaultOptions();
    expect(options.queries?.retry).toBe(shouldRetry);
    expect(options.queries?.retryDelay).toBe(retryDelay);
    expect(options.mutations?.retry).toBe(false);
  });
});
