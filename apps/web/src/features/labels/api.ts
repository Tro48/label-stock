import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateLabelInput,
  CreateLabelResult,
  CreateMovementInput,
  Label,
  ListLabelsParams,
  MergeDuplicatesResult,
  Movement,
  MovementResult,
  Paginated,
  UpdateLabelInput,
} from '@label-stock/shared';
import { apiRequest } from '../../shared/api/client';

export const labelKeys = {
  all: ['labels'] as const,
  lists: () => [...labelKeys.all, 'list'] as const,
  list: (params: ListLabelsParams) => [...labelKeys.lists(), params] as const,
  detail: (id: string) => [...labelKeys.all, 'detail', id] as const,
  movements: (id: string) => [...labelKeys.all, 'movements', id] as const,
};

export function useLabels(params: ListLabelsParams) {
  return useQuery({
    queryKey: labelKeys.list(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Label>>('/labels', { params: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
}

export function useLabel(id: string, initialData?: Label) {
  return useQuery({
    queryKey: labelKeys.detail(id),
    queryFn: ({ signal }) => apiRequest<Label>(`/labels/${id}`, { signal }),
    initialData,
  });
}

export function useLabelMovements(id: string) {
  return useQuery({
    queryKey: labelKeys.movements(id),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<Movement>>(`/labels/${id}/movements`, {
        params: { pageSize: 100 },
        signal,
      }),
  });
}

export function findLabelByBarcode(code: string): Promise<Label> {
  return apiRequest<Label>(`/labels/by-barcode/${encodeURIComponent(code)}`);
}

/** После любой записи таблица и карточка перечитываются: данные могли поменять с другого компьютера. */
export function useLabelMutation<Variables, Result>(
  mutationFn: (variables: Variables) => Promise<Result>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: labelKeys.all }),
  });
}

export function useCreateLabel() {
  return useLabelMutation((input: CreateLabelInput) =>
    apiRequest<CreateLabelResult>('/labels', { method: 'POST', body: input }),
  );
}

export function useUpdateLabel() {
  return useLabelMutation(({ id, input }: { id: string; input: UpdateLabelInput }) =>
    apiRequest<Label>(`/labels/${id}`, { method: 'PATCH', body: input }),
  );
}

export function useDeleteLabel() {
  return useLabelMutation((id: string) => apiRequest<void>(`/labels/${id}`, { method: 'DELETE' }));
}

export function useRestoreLabel() {
  return useLabelMutation((id: string) =>
    apiRequest<Label>(`/labels/${id}/restore`, { method: 'POST' }),
  );
}

export function useCreateMovement() {
  return useLabelMutation(({ id, input }: { id: string; input: CreateMovementInput }) =>
    apiRequest<MovementResult>(`/labels/${id}/movements`, { method: 'POST', body: input }),
  );
}

/** Сводит активные позиции с одинаковым номером макета к одной позиции на номер. */
export function useMergeDuplicateLayouts() {
  return useLabelMutation(() =>
    apiRequest<MergeDuplicatesResult>('/labels/merge-duplicates', { method: 'POST' }),
  );
}
