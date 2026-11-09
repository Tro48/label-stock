import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ImportResult } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { createTestQueryClient } from '../../test/render';
import { useImportCsv } from './api';

const RESULT: ImportResult = {
  applied: true,
  created: 1,
  updated: 0,
  unchanged: 0,
  errors: [],
  errorsTruncated: false,
};

function setup(response: () => Response) {
  const fetchMocks = mockFetchRoutes({ 'POST /api/import.csv': response });
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useImportCsv(), { wrapper });
  return { ...fetchMocks, invalidate, hook };
}

describe('useImportCsv', () => {
  it('шлёт CSV как есть с text/csv и dryRun в query string', async () => {
    const { hook, requests, fetchMock } = setup(() =>
      jsonResponse(200, { ...RESULT, applied: false }),
    );
    const csv = 'Контрагент;Дата печати;Остаток\r\nРомашка;01.11.2026;1\r\n';
    await hook.result.current.mutateAsync({ csv, dryRun: true });
    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/import.csv?dryRun=true',
        body: csv,
      },
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'text/csv; charset=utf-8',
    });
  });

  it('dryRun=false тоже попадает в query string', async () => {
    const { hook, requests } = setup(() => jsonResponse(200, RESULT));
    await hook.result.current.mutateAsync({ csv: 'x', dryRun: false });
    expect(requests[0]?.url).toBe('/api/import.csv?dryRun=false');
  });

  it('applied → инвалидирует позиции и контрагентов', async () => {
    const { hook, invalidate } = setup(() => jsonResponse(200, RESULT));
    await expect(hook.result.current.mutateAsync({ csv: 'x', dryRun: false })).resolves.toEqual(
      RESULT,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['labels'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['counterparties'] });
  });

  it('не applied (пробный прогон или ошибки) → кэш не трогается', async () => {
    const { hook, invalidate } = setup(() =>
      jsonResponse(200, { ...RESULT, applied: false, errors: [{ line: 2, message: 'x' }] }),
    );
    await hook.result.current.mutateAsync({ csv: 'x', dryRun: false });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('ошибка сервера → ApiError, кэш не трогается', async () => {
    const { hook, invalidate } = setup(() =>
      errorResponse(400, 'VALIDATION_ERROR', 'В файле нет строк с данными'),
    );
    await expect(hook.result.current.mutateAsync({ csv: 'x', dryRun: true })).rejects.toMatchObject(
      { status: 400, message: 'В файле нет строк с данными' },
    );
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
