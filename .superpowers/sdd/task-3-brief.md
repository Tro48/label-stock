# Task 3: End-to-End Scenario, User Guide, and Full Verification

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
