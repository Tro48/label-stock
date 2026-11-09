import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Counterparty } from '@label-stock/shared';
import { apiRequest } from '../../shared/api/client';

export const counterpartyKeys = {
  all: ['counterparties'] as const,
  search: (search: string) => [...counterpartyKeys.all, 'search', search] as const,
};

export function useCounterpartySuggestions(search: string) {
  return useQuery({
    queryKey: counterpartyKeys.search(search),
    queryFn: ({ signal }) =>
      apiRequest<Counterparty[]>('/counterparties', { params: { search }, signal }),
    placeholderData: keepPreviousData,
  });
}

/** Возвращает существующего контрагента с таким именем или создаёт нового. */
export function ensureCounterparty(name: string): Promise<Counterparty> {
  return apiRequest<Counterparty>('/counterparties', { method: 'POST', body: { name } });
}
