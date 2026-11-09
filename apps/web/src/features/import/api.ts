import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportResult } from '@label-stock/shared';
import { apiRequest } from '../../shared/api/client';
import { counterpartyKeys } from '../counterparties/api';
import { labelKeys } from '../labels/api';

export function useImportCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ csv, dryRun }: { csv: string; dryRun: boolean }) =>
      apiRequest<ImportResult>('/import.csv', {
        method: 'POST',
        params: { dryRun },
        rawBody: { content: csv, contentType: 'text/csv; charset=utf-8' },
      }),
    onSuccess: async (result) => {
      if (!result.applied) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: labelKeys.all }),
        queryClient.invalidateQueries({ queryKey: counterpartyKeys.all }),
      ]);
    },
  });
}
