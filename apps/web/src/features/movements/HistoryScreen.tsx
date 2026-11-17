import { useId, useState } from 'react';
import { useDebouncedValue } from '../../shared/use-debounced-value';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { Pagination } from '../../shared/ui/Pagination';
import { SearchField } from '../../shared/ui/SearchField';
import { useBarcodeScanner } from '../scanner/useBarcodeScanner';
import { useMovements } from './api';
import { MovementHistoryTable } from './MovementHistoryTable';

const SEARCH_DEBOUNCE_MS = 300;

export function HistoryScreen() {
  const headingId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const params = { search: debouncedSearch || undefined, page };
  const { data, error, failureReason, isPending, isFetching } = useMovements(params);

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  useBarcodeScanner({ onScan: changeSearch });

  return (
    <section aria-labelledby={headingId} className="screen">
      <h2 id={headingId}>История изменений</h2>
      <SearchField
        value={search}
        onChange={changeSearch}
        label="Поиск по истории"
        placeholder="Номер макета или штрихкод"
        scannerTarget
      />
      <ErrorAlert error={error ?? failureReason} retrying={isFetching} />
      {isPending && !failureReason && <p>Загружаем…</p>}
      {data &&
        (data.total === 0 ? (
          <p className="empty-state">
            {debouncedSearch
              ? 'Ничего не найдено. Измените условия поиска.'
              : 'Изменений остатка пока не было.'}
          </p>
        ) : (
          <>
            <MovementHistoryTable items={data.items} total={data.total} />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        ))}
    </section>
  );
}
