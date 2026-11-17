# Task 3 report: e2e test for history + guide entry

## Status

DONE

## What was done

Implemented Task 3 per `.superpowers/sdd/task-3-brief.md`, Steps 1–2 only. Brief's code blocks were extracted programmatically from the brief file and inserted verbatim so that the Russian UI copy stays byte-exact. Docker containers were not touched and browser e2e was not run (Step 3 belongs to the coordinator).

1. New Playwright test `e2e/tests/history.spec.ts` (40 lines, byte-exact from the brief's code block). Scenario: create a label with the `createLabelViaApi` fixture (quantity 100), POST a `consumption` movement (delta −7, comment `E2E история`), open `#/history`, assert a two-row table matching the unique layout number with `Списание`, `−7`, `93`, `E2E история` in the newest row; then search filtering — `no-such-layout` gives the empty state `Ничего не найдено. Измените условия поиска.`, layout number and last-8 barcode suffix (`label.barcode!.slice(-8)`) both keep the two rows, clearing the search returns to full history; scanner fill via `scanBarcode` sets the searchbox value to the full barcode and re-renders the two rows; no `dialog` elements; `expectNoAxeViolations(page)` on the history screen.
2. `docs/user-guide.md` — line 22 `Все изменения остатка видны на вкладке «История» в карточке.` replaced with the full paragraph from the brief (3 sentences: global history at `#/history`, what shows in each row (time, layout number, counterparty, action type, change, remainder after action, comment), search by layout number and barcode (including last digits), and scanner codes go into the same field). Paragraph verified byte-equal to the brief's block (298 characters).

Self-review of the test against app sources before writing:
- `getByRole('table', { name: /История изменений:/ })` — accessible name comes from `<caption>` `История изменений: {total}` in `apps/web/src/features/movements/MovementHistoryTable.tsx`.
- `getByRole('searchbox', { name: 'Поиск по истории' })` — `SearchField` accessible name in `HistoryScreen.tsx`.
- Row filter by `label.layoutNumber!` — server `buildGlobalSearchCondition` in `apps/server/src/modules/movements/movements.repository.ts` matches layout-number prefix and barcode prefix/suffix (`LIKE %suffix`), which covers `slice(-8)`.
- `row.first()` is the newest row — ordering is `desc(createdAt), desc(id)` (newest first).
- Empty-state text and `−7` assertion match `HistoryScreen.tsx` copy and `formatDelta` exactly (minus in the assertion is U+2212, same character `formatDelta` emits).
- `dialog` count 0 — no modals on the screen; axe helper is the shared `expectNoAxeViolations` from `e2e/tests/fixtures.ts`.

## Changed files

New:

- `e2e/tests/history.spec.ts` (40 lines)

Modified (`git diff --numstat`):

- `docs/user-guide.md` (1 line replaced, +1 / -1)

No other files touched. No new dependencies, no Docker/Playwright process started, no commits — changes left in the working tree.

## Commands and results

All pnpm invocations were run as `npx --yes pnpm@10.12.1 …` (pnpm binary is not on PATH; version pinned to the repo's `pnpm@10.12.1`).

1. `npx --yes pnpm@10.12.1 --filter @label-stock/e2e typecheck` (`tsc -p tsconfig.json`) → no output, exit=0.
2. `npx --yes pnpm@10.12.1 exec prettier --check e2e/tests/history.spec.ts docs/user-guide.md` → `All matched files use Prettier code style!`, exit=0.
3. `git diff --numstat docs/user-guide.md` → `1 1` (exactly one line changed).

Not run, per brief (coordinator's Step 3): `E2E_BASE_URL=http://localhost:8080 … playwright test tests/history.spec.ts` — real-browser run and axe results on the history screen are pending.

## Concerns

- Test code and the guide paragraph are byte-exact from the brief, so no formatting compromises; the only addition is the two-line English comment above the table locator (derived from the brief's sentence about the two matching rows) — harmless for Playwright.
- `getByRole('table', { name: /История изменений:/ })` relies on the accessible name coming from `<caption>`; no other existing spec exercises `table` by name, so this locator is only proven by the real-browser run.
- Barcode suffix search path (`LIKE %suffix`) and the `#/history` route, scanner fill, and axe on the history screen are unverified in a real browser here — deliberately deferred to the coordinator's Step 3; if any of these fail, the fix is expected in app/server code, not in this test.
- The scanner fill assertion assumes `useBarcodeScanner` ends the code with Enter and `HistoryScreen` trims the value — same wiring as the toolbar, but again only the real run proves it.
