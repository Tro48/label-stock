# Stock Movement History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-level History page that lists the latest stock movements across all labels and quickly filters them by layout number or barcode.

**Architecture:** Add `GET /api/movements` over the existing `stock_movements` table, joining current label and counterparty data. Add a hash-routed React screen backed by TanStack Query, extract the main search field into a shared component, and keep all mutations' existing label invalidation so the global history refreshes automatically.

**Tech Stack:** TypeScript strict, Zod 4, Fastify 5, Drizzle ORM/PostgreSQL, React 19, TanStack Query 5, Vitest/Testing Library, Playwright/axe.

## Global Constraints

- Follow `docs/superpowers/specs/2026-11-17-stock-movement-history-design.md`; no separate audit log and no database migration.
- Do not add dependencies. Reuse existing UI, formatting, scanner, query, and test utilities.
- Preserve leading zeroes in layout numbers and use existing barcode normalization and `LIKE` escaping.
- The global list is always newest-first and includes movements of softly deleted labels.
- Main-screen search text and scanner behavior must remain unchanged. History scans only replace the history filter.
- Use the exact Russian copy from the specification.
- Write failing tests before implementation and run each task's focused tests before broader checks.
- Implementation tasks are delegated to opencode with English prompts. The coordinating agent reviews each task.
- Do not create git commits: no commit was requested. Leave all changes in the working tree for review.

---

## File Map

- Modify `packages/shared/src/schemas/movement.ts`: global-list query, item DTO, and client parameter types.
- Modify `packages/shared/src/schemas/movement.test.ts`: schema boundary tests.
- Modify `apps/server/src/modules/movements/movements.repository.ts`: joined, filtered, paginated global query.
- Modify `apps/server/src/modules/movements/movements.service.ts`: global DTO mapping and service method.
- Modify `apps/server/src/modules/movements/movements.routes.ts`: public endpoint.
- Modify `apps/server/test/movements.test.ts`: real PostgreSQL API coverage.
- Create `apps/web/src/shared/ui/SearchField.tsx`: shared large search form/input.
- Modify `apps/web/src/features/labels/LabelsToolbar.tsx`: use `SearchField` without changing behavior.
- Create `apps/web/src/features/movements/api.ts`: global-history query key and hook.
- Create `apps/web/src/features/movements/MovementHistoryTable.tsx`: read-only global table.
- Create `apps/web/src/features/movements/HistoryScreen.tsx`: search, scanner, pagination, and request states.
- Create `apps/web/src/features/movements/HistoryScreen.test.tsx`: rendering and debounced filtering.
- Modify `apps/web/src/shared/use-hash-route.ts` and `apps/web/src/App.tsx`: route and navigation.
- Modify `apps/web/src/styles/global.css`: eight-column history grid only.
- Create `e2e/tests/history.spec.ts`: end-to-end operation/search/accessibility scenario.
- Modify `docs/user-guide.md`: document global history.

### Task 1: Shared Contracts and Global Movements API

**Files:**

- Modify: `packages/shared/src/schemas/movement.ts`
- Test: `packages/shared/src/schemas/movement.test.ts`
- Modify: `apps/server/src/modules/movements/movements.repository.ts`
- Modify: `apps/server/src/modules/movements/movements.service.ts`
- Modify: `apps/server/src/modules/movements/movements.routes.ts`
- Test: `apps/server/test/movements.test.ts`

**Interfaces:**

- Consumes: existing `Movement`, `MovementRow`, `paginatedSchema`, `paginationQuerySchema`, `normalizeBarcode`, `escapeLikePattern`, and test helpers.
- Produces: `movementListItemSchema`, `listMovementsQuerySchema`, `MovementListItem`, `ListMovementsQuery`, `ListMovementsParams`, `MovementsService.listAll(query)`, and `GET /api/movements`.

- [ ] **Step 1: Add failing shared-schema tests**

Append tests to `packages/shared/src/schemas/movement.test.ts`, importing the two new schemas from `./movement`:

```ts
it('общий журнал: параметры по умолчанию и DTO позиции', () => {
  expect(listMovementsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
  expect(listMovementsQuerySchema.parse({ search: ' 00123 ', pageSize: '200' })).toEqual({
    search: '00123',
    page: 1,
    pageSize: 200,
  });

  const item = {
    id: 'movement-1',
    labelId: 'label-1',
    delta: -5,
    quantityAfter: 95,
    reason: 'consumption',
    comment: null,
    createdAt: '2026-11-17T10:00:00.000Z',
    label: {
      id: 'label-1',
      counterparty: { id: 'counterparty-1', name: 'Ромашка' },
      layoutNumber: '00123',
      barcode: 'ABC123456',
      deletedAt: null,
    },
  };
  expect(movementListItemSchema.parse(item)).toEqual(item);
});

it('общий журнал: pageSize больше 200 отклоняется', () => {
  expect(listMovementsQuerySchema.safeParse({ pageSize: 201 }).success).toBe(false);
});
```

- [ ] **Step 2: Run the shared test and confirm the contracts are missing**

Run: `pnpm --filter @label-stock/shared exec vitest run src/schemas/movement.test.ts`

Expected: FAIL because `listMovementsQuerySchema` and `movementListItemSchema` are not exported.

- [ ] **Step 3: Implement the shared contracts**

In `packages/shared/src/schemas/movement.ts`, import `paginationQuerySchema`, `paginatedSchema` usage remains in the route, and `searchTextSchema`; add:

```ts
export const movementListItemSchema = movementSchema.extend({
  label: labelSchema.pick({
    id: true,
    counterparty: true,
    layoutNumber: true,
    barcode: true,
    deletedAt: true,
  }),
});

export const listMovementsQuerySchema = paginationQuerySchema.extend({
  search: searchTextSchema,
});

export type MovementListItem = z.infer<typeof movementListItemSchema>;
export type ListMovementsQuery = z.output<typeof listMovementsQuerySchema>;
export interface ListMovementsParams {
  search?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}
```

Keep the existing per-label schemas and exports unchanged; `packages/shared/src/index.ts` already re-exports this module.

- [ ] **Step 4: Run the shared test and confirm it passes**

Run: `pnpm --filter @label-stock/shared exec vitest run src/schemas/movement.test.ts`

Expected: PASS, including all pre-existing movement schema tests.

- [ ] **Step 5: Add failing API coverage**

Append this test to the existing `describe` in `apps/server/test/movements.test.ts`:

```ts
it('общая история: новые сверху, поиск, пагинация и удалённые позиции', async () => {
  const first = await createLabel(context.app, {
    layoutNumber: '00123',
    barcode: 'ABC123456',
    quantity: 100,
  });
  const second = await createLabel(context.app, {
    layoutNumber: '00999',
    barcode: 'XYZ999999',
    quantity: 40,
  });
  await postMovement(context.app, first.id, {
    reason: 'consumption',
    delta: -5,
    comment: 'Заказ',
  });

  const all = await context.app.inject({ url: '/api/movements' });
  expect(all.statusCode, all.body).toBe(200);
  expect(all.json()).toMatchObject({ total: 3, page: 1, pageSize: 50 });
  expect(all.json().items.map((item: { delta: number }) => item.delta)).toEqual([-5, 40, 100]);
  expect(all.json().items[0]).toMatchObject({
    labelId: first.id,
    quantityAfter: 95,
    reason: 'consumption',
    comment: 'Заказ',
    label: {
      id: first.id,
      counterparty: { name: 'Ромашка' },
      layoutNumber: '00123',
      barcode: 'ABC123456',
      deletedAt: null,
    },
  });

  const byLayout = await context.app.inject({ url: '/api/movements?search=001' });
  expect(byLayout.json().items.map((item: { labelId: string }) => item.labelId)).toEqual([
    first.id,
    first.id,
  ]);
  expect(
    byLayout.json().items.every((item: { labelId: string }) => item.labelId !== second.id),
  ).toBe(true);

  const byBarcodeSuffix = await context.app.inject({ url: '/api/movements?search=23456' });
  expect(byBarcodeSuffix.json().total).toBe(2);
  const byCounterparty = await context.app.inject({ url: '/api/movements?search=Ромашка' });
  expect(byCounterparty.json().total).toBe(0);

  const secondPage = await context.app.inject({ url: '/api/movements?page=2&pageSize=2' });
  expect(secondPage.json()).toMatchObject({ total: 3, page: 2, pageSize: 2 });
  expect(secondPage.json().items).toHaveLength(1);

  await context.app.inject({ method: 'DELETE', url: `/api/labels/${first.id}` });
  const afterDelete = await context.app.inject({ url: '/api/movements?search=00123' });
  expect(afterDelete.json().total).toBe(2);
  expect(afterDelete.json().items[0].label.deletedAt).not.toBeNull();
});
```

- [ ] **Step 6: Run the API test and confirm the endpoint is absent**

Run: `pnpm --filter @label-stock/server exec vitest run test/movements.test.ts`

Expected: the new test FAILS with HTTP 404; existing tests should remain green. Docker must be available for Testcontainers.

- [ ] **Step 7: Implement the repository query**

In `movements.repository.ts`, additionally import `like`, `or`, `type SQL`, `normalizeBarcode`, `ListMovementsQuery`, `counterparties`, and `escapeLikePattern`. Add these exported types and helper:

```ts
export interface MovementWithLabelRow {
  movement: MovementRow;
  label: LabelRow;
  counterpartyName: string;
}

function buildGlobalSearchCondition(search: string): SQL | undefined {
  const layout = escapeLikePattern(search);
  const barcode = escapeLikePattern(normalizeBarcode(search));
  return or(
    like(labels.layoutNumber, `${layout}%`),
    barcode
      ? or(like(labels.barcode, `${barcode}%`), like(labels.barcode, `%${barcode}`))
      : undefined,
  );
}
```

Add this method to `MovementsRepository` without changing `listByLabel`:

```ts
async listAll(
  query: ListMovementsQuery,
): Promise<{ rows: MovementWithLabelRow[]; total: number }> {
  const where = query.search ? buildGlobalSearchCondition(query.search) : undefined;
  const selection = {
    movement: stockMovements,
    label: labels,
    counterpartyName: counterparties.name,
  };
  const [rows, [totalRow]] = await Promise.all([
    this.db
      .select(selection)
      .from(stockMovements)
      .innerJoin(labels, eq(stockMovements.labelId, labels.id))
      .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    this.db
      .select({ total: count() })
      .from(stockMovements)
      .innerJoin(labels, eq(stockMovements.labelId, labels.id))
      .where(where),
  ]);
  return { rows, total: totalRow?.total ?? 0 };
}
```

- [ ] **Step 8: Implement DTO mapping, service, and route**

In `movements.service.ts`, import `MovementListItem`, `ListMovementsQuery`, and `MovementWithLabelRow`; add:

```ts
export function toMovementListItemDto(row: MovementWithLabelRow): MovementListItem {
  return {
    ...toMovementDto(row.movement),
    label: {
      id: row.label.id,
      counterparty: { id: row.label.counterpartyId, name: row.counterpartyName },
      layoutNumber: row.label.layoutNumber,
      barcode: row.label.barcode,
      deletedAt: row.label.deletedAt?.toISOString() ?? null,
    },
  };
}
```

Add to `MovementsService`:

```ts
async listAll(query: ListMovementsQuery): Promise<Paginated<MovementListItem>> {
  const { rows, total } = await new MovementsRepository(this.db).listAll(query);
  return {
    items: rows.map(toMovementListItemDto),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
```

In `movements.routes.ts`, import `listMovementsQuerySchema` and `movementListItemSchema`, then register:

```ts
app.get(
  '/movements',
  {
    schema: {
      tags,
      summary: 'Общая история изменений остатков',
      querystring: listMovementsQuerySchema,
      response: { 200: paginatedSchema(movementListItemSchema), 400: errorResponseSchema },
    },
  },
  (request) => service.listAll(request.query),
);
```

- [ ] **Step 9: Run focused tests and static checks**

Run:

```sh
pnpm --filter @label-stock/server exec vitest run test/movements.test.ts
pnpm --filter @label-stock/shared typecheck
pnpm --filter @label-stock/server typecheck
```

Expected: all PASS with zero TypeScript errors. Review the diff for accidental changes to per-label history before starting Task 2.

### Task 2: Shared Search and History Screen

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
            <th scope="col" role="columnheader">
              Дата
            </th>
            <th scope="col" role="columnheader">
              Контрагент
            </th>
            <th scope="col" role="columnheader">
              № макета
            </th>
            <th scope="col" role="columnheader">
              Штрихкод
            </th>
            <th scope="col" role="columnheader">
              Операция
            </th>
            <th scope="col" role="columnheader" className="table__cell--numeric">
              Изменение
            </th>
            <th scope="col" role="columnheader" className="table__cell--numeric">
              Остаток после
            </th>
            <th scope="col" role="columnheader">
              Комментарий
            </th>
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
              <td role="cell" className="table__cell--numeric">
                {formatDelta(movement.delta)}
              </td>
              <td role="cell" className="table__cell--numeric">
                {formatQuantity(movement.quantityAfter)}
              </td>
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
{
  route === 'stock' && <StockScreen />;
}
{
  route === 'history' && <HistoryScreen />;
}
{
  route === 'deleted' && <DeletedScreen />;
}
```

- [ ] **Step 8: Run frontend tests and checks**

Run:

```sh
pnpm --filter @label-stock/web exec vitest run src/features/movements/HistoryScreen.test.tsx src/features/labels/LabelsToolbar.test.tsx
pnpm --filter @label-stock/web typecheck
pnpm --filter @label-stock/web test
```

Expected: all PASS with zero TypeScript errors. Verify the main toolbar keeps its existing accessible name, placeholder, ref, and scanner target; review the diff before Task 3.

### Task 3: End-to-End Scenario, User Guide, and Full Verification

**Files:**

- Create: `e2e/tests/history.spec.ts`
- Modify: `docs/user-guide.md`

**Interfaces:**

- Consumes: working `#/history`, `POST /api/labels/:id/movements`, `createLabelViaApi`, and `expectNoAxeViolations`.
- Produces: browser proof of the requested user workflow and user-facing documentation.

- [ ] **Step 1: Add the end-to-end scenario**

Create `e2e/tests/history.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { createLabelViaApi, expectNoAxeViolations, scanBarcode } from './fixtures';

test('общая история: операция, поиск по макету и штрихкоду, доступность', async ({
  page,
  request,
}) => {
  const label = await createLabelViaApi(request, { quantity: 100 });
  const movement = await request.post(`/api/labels/${label.id}/movements`, {
    data: { reason: 'consumption', delta: -7, comment: 'E2E история' },
  });
  expect(movement.status()).toBe(201);

  await page.goto('/#/history');
  const table = page.getByRole('table', { name: /История изменений:/ });
  const row = table.getByRole('row').filter({ hasText: label.layoutNumber! });
  await expect(row).toHaveCount(2);
  await expect(row.first()).toContainText('Списание');
  await expect(row.first()).toContainText('−7');
  await expect(row.first()).toContainText('93');
  await expect(row.first()).toContainText('E2E история');

  const search = page.getByRole('searchbox', { name: 'Поиск по истории' });
  await search.fill('no-such-layout');
  await expect(page.getByText('Ничего не найдено. Измените условия поиска.')).toBeVisible();
  await search.fill(label.layoutNumber!);
  await expect(row).toHaveCount(2);
  await search.fill(label.barcode!.slice(-8));
  await expect(row).toHaveCount(2);
  await search.fill('');
  await page.getByRole('heading', { name: 'История изменений' }).click();
  await scanBarcode(page, label.barcode!);
  await expect(search).toHaveValue(label.barcode!);
  await expect(row).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expectNoAxeViolations(page);
});
```

Use the table's two matching data rows because creation and consumption both belong to the unique test label; no other test uses the generated unique values.

- [ ] **Step 2: Update the user guide**

In `docs/user-guide.md`, replace the sentence that limits history to the card with:

```md
Все изменения остатка видны на вкладке «История» в карточке. Общая ссылка «История» вверху показывает последние операции по всем позициям, включая удалённые. Поле «Поиск по истории» ищет по номеру макета и по началу или концу штрихкода; сканирование штрихкода на этом экране только заполняет поиск.
```

- [ ] **Step 3: Run the end-to-end scenario against the built application**

Start the real application using the project's normal development/deployment setup, with its database and API available. Then run:

```sh
E2E_BASE_URL=http://localhost:8080 pnpm --filter @label-stock/e2e exec playwright test tests/history.spec.ts
```

Expected: 1 PASS, including zero axe violations. If port 8080 is not the active app URL, use that same URL in `E2E_BASE_URL`; do not mock API responses in this test.

- [ ] **Step 4: Run all project checks on the final working tree**

Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits 0. If formatting alone fails, run the project's Prettier formatter only on files changed for this feature, then repeat `pnpm format:check` and affected tests.

- [ ] **Step 5: Review the deliverable and workspace**

Inspect `git diff --check`, `git status --short`, and the complete diff. Confirm there is no migration, no new dependency, no change to stock-operation behavior, no generated test artifacts to retain, and no git commit. Exercise the real route once more: open History, perform/search for a movement by layout and barcode suffix, verify newest-first values and empty state, and confirm main-stock search/card scanning still works.
