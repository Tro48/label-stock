# Task 2: Shared Search and History Screen

**Files:**
- Create: `apps/web/src/shared/ui/SearchField.tsx`
- Modify: `apps/web/src/features/labels/LabelsToolbar.tsx`
- Create: `apps/web/src/features/movements/api.ts`
- Create: `apps/web/src/features/movements/MovementHistoryTable.tsx`
- Create: `apps/web/src/features/movements/HistoryScreen.tsx`
- Test: `apps/web/src/features/movements/HistoryScreen.test.tsx`
- Modify: `apps/web/src/shared/use-hash-route.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles/global.css`

**Interfaces:**
- Consumes: `MovementListItem`, `ListMovementsParams`, `GET /api/movements`, existing formatters, scanner, error, pagination, and test utilities.
- Produces: `SearchField`, `useMovements(params)`, `HistoryScreen`, and route `#/history`.

- [ ] **Step 1: Write failing screen tests**

Create `HistoryScreen.test.tsx` with a complete paginated fixture and these tests:

```ts
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MovementListItem } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { renderWithProviders } from '../../test/render';
import { HistoryScreen } from './HistoryScreen';

const movement: MovementListItem = {
  id: 'movement-1',
  labelId: 'label-1',
  delta: -5,
  quantityAfter: 95,
  reason: 'consumption',
  comment: 'Заказ',
  createdAt: '2026-11-17T10:00:00.000Z',
  label: {
    id: 'label-1',
    counterparty: { id: 'counterparty-1', name: 'Ромашка' },
    layoutNumber: '00123',
    barcode: 'ABC123456',
    deletedAt: null,
  },
};

function page(items: MovementListItem[] = [movement]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe('HistoryScreen', () => {
  it('показывает операцию и ищет по введённому значению с debounce', async () => {
    const { requests } = mockFetchRoutes({
      'GET /api/movements': () => jsonResponse(200, page()),
    });
    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText('Списание')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'История изменений' })).toBeInTheDocument();
    expect(screen.getByText('00123')).toBeInTheDocument();
    expect(screen.getByText('ABC123456')).toBeInTheDocument();
    expect(screen.getByText('−5')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();

    const input = screen.getByRole('searchbox', { name: 'Поиск по истории' });
    fireEvent.change(input, { target: { value: ' 00123 ' } });
    await waitFor(() => {
      expect(
        requests.some((request) => new URL(request.url, 'http://localhost').searchParams.get('search') === '00123'),
      ).toBe(true);
    });
  });

  it('показывает пустой результат поиска', async () => {
    mockFetchRoutes({
      'GET /api/movements': ({ url }) =>
        jsonResponse(
          200,
          new URL(url, 'http://localhost').searchParams.has('search') ? page([]) : page(),
        ),
    });
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Списание')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по истории' }), {
      target: { value: '00123' },
    });
    expect(
      await screen.findByText('Ничего не найдено. Измените условия поиска.'),
    ).toBeInTheDocument();
  });

  it('показывает пустой журнал', async () => {
    mockFetchRoutes({ 'GET /api/movements': () => jsonResponse(200, page([])) });
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Изменений остатка пока не было.')).toBeInTheDocument();
  });

  it('сбрасывает страницу при изменении поиска', async () => {
    const { requests } = mockFetchRoutes({
      'GET /api/movements': ({ url }) => {
        const params = new URL(url, 'http://localhost').searchParams;
        return jsonResponse(200, {
          items: [movement],
          total: 100,
          page: Number(params.get('page') ?? 1),
          pageSize: 50,
        });
      },
    });
    renderWithProviders(<HistoryScreen />);
    await screen.findByText('Списание');
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    await waitFor(() => {
      expect(requests.some((request) => request.url.includes('page=2'))).toBe(true);
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по истории' }), {
      target: { value: '00123' },
    });
    await waitFor(() => {
      expect(
        requests.some((request) => {
          const params = new URL(request.url, 'http://localhost').searchParams;
          return params.get('search') === '00123' && params.get('page') === '1';
        }),
      ).toBe(true);
    });
  });

  it('показывает загрузку и ошибку запроса', async () => {
    mockFetchRoutes({
      'GET /api/movements': () => errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка'),
    });
    renderWithProviders(<HistoryScreen />);
    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
  });
});
```

- [ ] **Step 2: Run the focused UI test and confirm failure**

Run: `pnpm --filter @label-stock/web exec vitest run src/features/movements/HistoryScreen.test.tsx`

Expected: FAIL because `./HistoryScreen` does not exist.

- [ ] **Step 3: Extract the shared search field**

Create `apps/web/src/shared/ui/SearchField.tsx`:

```tsx
import { useId, type Ref } from 'react';

interface SearchFieldProps {
  searchRef?: Ref<HTMLInputElement> | undefined;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  scannerTarget?: boolean | undefined;
}

export function SearchField({
  searchRef,
  value,
  onChange,
  label,
  placeholder,
  scannerTarget = false,
}: SearchFieldProps) {
  const id = useId();
  return (
    <form role="search" className="toolbar__search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <input
        id={id}
        ref={searchRef}
        type="search"
        className="input input--large"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-scanner-target={scannerTarget ? '' : undefined}
      />
    </form>
  );
}
```

Replace the search form in `LabelsToolbar.tsx` with:

```tsx
<SearchField
  searchRef={searchRef}
  value={search}
  onChange={onSearchChange}
  label="Найти или отсканировать штрихкод"
  placeholder="Контрагент, номер макета или последние цифры штрихкода"
  scannerTarget
/>
```

Add the `SearchField` import and remove the now-unused search markup only; retain the counterparty and buttons.

- [ ] **Step 4: Add the global-history query hook**

Create `apps/web/src/features/movements/api.ts`:

```ts
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
```

Nesting the key under `labelKeys.all` intentionally makes existing label, stock-request, merge, and applied-import invalidation cover global history too.

- [ ] **Step 5: Implement the read-only table**

Create `MovementHistoryTable.tsx` using explicit table roles like `LabelsTable` for Safari:

```tsx
import { MOVEMENT_REASON_LABELS, type MovementListItem } from '@label-stock/shared';
import { EMPTY_VALUE, formatDateTime, formatDelta, formatQuantity } from '../../shared/format';

export function MovementHistoryTable({
  items,
  total,
}: {
  items: readonly MovementListItem[];
  total: number;
}) {
  return (
    <div className="table-scroll">
      <table role="table" className="table table--grid movement-history-table">
        <caption className="table__caption">История изменений: {total}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Дата</th>
            <th scope="col" role="columnheader">Контрагент</th>
            <th scope="col" role="columnheader">№ макета</th>
            <th scope="col" role="columnheader">Штрихкод</th>
            <th scope="col" role="columnheader">Операция</th>
            <th scope="col" role="columnheader" className="table__cell--numeric">Изменение</th>
            <th scope="col" role="columnheader" className="table__cell--numeric">Остаток после</th>
            <th scope="col" role="columnheader">Комментарий</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((movement) => (
            <tr key={movement.id} role="row">
              <td role="cell">
                <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time>
              </td>
              <td role="cell">{movement.label.counterparty.name}</td>
              <td role="cell">{movement.label.layoutNumber ?? EMPTY_VALUE}</td>
              <td role="cell">{movement.label.barcode ?? EMPTY_VALUE}</td>
              <td role="cell">{MOVEMENT_REASON_LABELS[movement.reason]}</td>
              <td role="cell" className="table__cell--numeric">{formatDelta(movement.delta)}</td>
              <td role="cell" className="table__cell--numeric">{formatQuantity(movement.quantityAfter)}</td>
              <td role="cell">{movement.comment ?? EMPTY_VALUE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Add to `global.css`:

```css
.movement-history-table {
  grid-template-columns:
    minmax(10rem, auto) minmax(10rem, 1.5fr) minmax(7rem, 1fr)
    minmax(9rem, 1fr) minmax(8rem, auto) minmax(7rem, auto)
    minmax(8rem, auto) minmax(12rem, 2fr);
}
```

- [ ] **Step 6: Implement screen state, scanner, loading, errors, and pagination**

Create `HistoryScreen.tsx`:

```tsx
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
```

- [ ] **Step 7: Add route and navigation**

In `use-hash-route.ts`, use exactly:

```ts
export type Route = 'stock' | 'history' | 'deleted';

export const ROUTE_HREFS: Readonly<Record<Route, string>> = {
  stock: '#/',
  history: '#/history',
  deleted: '#/deleted',
};

function readRoute(): Route {
  if (window.location.hash === ROUTE_HREFS.history) return 'history';
  if (window.location.hash === ROUTE_HREFS.deleted) return 'deleted';
  return 'stock';
}
```

In `App.tsx`, import `HistoryScreen`, add `{ route: 'history', text: 'История' }` between stock and deleted, and render exclusively:

```tsx
{route === 'stock' && <StockScreen />}
{route === 'history' && <HistoryScreen />}
{route === 'deleted' && <DeletedScreen />}
```

- [ ] **Step 8: Run frontend tests and checks**

Run:

```sh
pnpm --filter @label-stock/web exec vitest run src/features/movements/HistoryScreen.test.tsx src/features/labels/LabelsToolbar.test.tsx
pnpm --filter @label-stock/web typecheck
pnpm --filter @label-stock/web test
```

Expected: all PASS with zero TypeScript errors. Verify the main toolbar keeps its existing accessible name, placeholder, ref, and scanner target; review the diff before Task 3.

## Binding Global Constraints

- Follow `docs/superpowers/specs/2026-11-17-stock-movement-history-design.md`; no separate audit log and no database migration.
- Do not add dependencies. Reuse existing UI, formatting, scanner, query, and test utilities.
- Preserve leading zeroes in layout numbers and use existing barcode normalization and `LIKE` escaping.
- The global list is always newest-first and includes movements of softly deleted labels.
- Main-screen search text and scanner behavior must remain unchanged. History scans only replace the history filter.
- Use the exact Russian copy from the specification.
- Write failing tests before implementation and run each task's focused tests before broader checks.
- Implementation tasks are delegated to opencode with English prompts. The coordinating agent reviews each task.
- Do not create git commits: no commit was requested. Leave all changes in the working tree for review.
