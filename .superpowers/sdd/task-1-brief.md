# Task 1: Shared Contracts and Global Movements API

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
  expect(byLayout.json().items.every((item: { labelId: string }) => item.labelId !== second.id)).toBe(true);

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
