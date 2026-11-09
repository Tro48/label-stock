import { useState } from 'react';
import type { ListLabelsParams } from '@label-stock/shared';
import { useDebouncedValue } from '../../shared/use-debounced-value';
import type { SortState } from './LabelsTable';

const SEARCH_DEBOUNCE_MS = 300;

/** Состояние фильтров таблицы. Любая смена фильтра возвращает на первую страницу. */
export function useLabelsQueryState(deleted: boolean) {
  const [search, setSearch] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [sortState, setSortState] = useState<SortState>({ sort: 'counterparty', order: 'asc' });
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const debouncedCounterpartyName = useDebouncedValue(counterpartyName.trim(), SEARCH_DEBOUNCE_MS);

  const resetPage =
    <Value>(setter: (value: Value) => void) =>
    (value: Value) => {
      setter(value);
      setPage(1);
    };

  const params: ListLabelsParams = {
    search: debouncedSearch || undefined,
    counterpartyName: debouncedCounterpartyName || undefined,
    onlyEmpty,
    deleted,
    sort: sortState.sort,
    order: sortState.order,
    page,
  };

  return {
    params,
    search,
    setSearch: resetPage(setSearch),
    counterpartyName,
    setCounterpartyName: resetPage(setCounterpartyName),
    onlyEmpty,
    setOnlyEmpty: resetPage(setOnlyEmpty),
    sortState,
    setSortState: resetPage(setSortState),
    page,
    setPage,
    hasFilters: Boolean(debouncedSearch || debouncedCounterpartyName || onlyEmpty),
  };
}
