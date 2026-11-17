import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ListMovementsParams, MovementListItem, Paginated } from '@label-stock/shared';
import { apiRequest } from '../../shared/api/client';
import { labelKeys } from '../labels/api';

export const movementKeys = {
  all: [...labelKeys.all, 'movements'] as const,
  list: (params: ListMovementsParams) => [...movementKeys.all, 'list', params] as const,
};

export function useMovements(params: ListMovementsParams) {
  return useQuery({
    queryKey: movementKeys.list(params),
    queryFn: ({ signal }) =>
      apiRequest<Paginated<MovementListItem>>('/movements', { params: { ...params }, signal }),
    placeholderData: keepPreviousData,
  });
}
