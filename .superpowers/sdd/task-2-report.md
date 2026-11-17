# Task 2 report: shared search field + history screen + `#/history` route

## Status

DONE

## What was done

Implemented Task 2 per `.superpowers/sdd/task-2-brief.md` with strict TDD (failing focused tests first, then minimal implementation, then focused + broader checks). Code blocks were extracted from the brief programmatically and inserted verbatim to keep the Russian copy byte-exact.

1. Focused test written first: `apps/web/src/features/movements/HistoryScreen.test.tsx` (5 tests, verbatim from the brief).
2. Shared search field `apps/web/src/shared/ui/SearchField.tsx` — same markup the toolbar used before (`form role="search"`, `label`, `input type="search"` with `input input--large`, `autocomplete="off"`, `ref`, `data-scanner-target`).
3. History client query `apps/web/src/features/movements/api.ts` — `useMovements`, `movementKeys.all` nested under `labelKeys.all`, `keepPreviousData`.
4. `apps/web/src/features/movements/MovementHistoryTable.tsx` — 8-column grid table (`table table--grid movement-history-table`) with `<caption>`, `<time dateTime>`, numeric-cell classes.
5. `apps/web/src/features/movements/HistoryScreen.tsx` — `useMovements` + `useDebouncedValue` (300 ms) + `useBarcodeScanner` + `ErrorAlert` + `Pagination`; loading text, two empty states, table.
6. `apps/web/src/features/labels/LabelsToolbar.tsx` — inline `<form role="search">` replaced by `SearchField` with the same accessible name, placeholder, `ref`, and scanner target.
7. `apps/web/src/styles/global.css` — `.movement-history-table` grid columns after `.labels-table--selectable`.
8. `apps/web/src/shared/use-hash-route.ts` — `Route` extended with `'history'`, `ROUTE_HREFS.history = '#/history'`, `readRoute()` per the brief; doc comment updated to "Три экрана".
9. `apps/web/src/App.tsx` — `HistoryScreen` import, `{ route: 'history', text: 'История' }` between stock and deleted, screens now rendered exclusively (`&&` instead of ternary).

No server or shared-schema files touched by this task (they carry Task 1 changes). No new dependencies.

## Changed files

New:

- `apps/web/src/features/movements/HistoryScreen.test.tsx` (118 lines)
- `apps/web/src/shared/ui/SearchField.tsx` (40 lines)
- `apps/web/src/features/movements/api.ts` (18 lines)
- `apps/web/src/features/movements/MovementHistoryTable.tsx` (66 lines)
- `apps/web/src/features/movements/HistoryScreen.tsx` (58 lines)

Modified (`git diff --stat` for frontend only):

- `apps/web/src/App.tsx` (+5 / -1)
- `apps/web/src/features/labels/LabelsToolbar.tsx` (+9 / -17)
- `apps/web/src/shared/use-hash-route.ts` (+6 / -3)
- `apps/web/src/styles/global.css` (+7 / -0)

Frontend totals: 5 new files (300 lines), 4 modified files, `git diff --shortstat` = 27 insertions / 21 deletions.

## Commands and results

All pnpm invocations were run as `npx --yes pnpm@10.12.1 …` (pnpm binary is not on PATH; version pinned to the repo's `pnpm@10.12.1`).

1. Focused tests before implementation:
   `npx --yes pnpm@10.12.1 --filter @label-stock/web exec vitest run src/features/movements/HistoryScreen.test.tsx src/features/labels/LabelsToolbar.test.tsx`
   → FAIL as expected: `Test Files 1 failed (2)`, `Tests no tests` — `Error: Failed to resolve import "./HistoryScreen" from "src/features/movements/HistoryScreen.test.tsx". Does the file exist?` (LabelsToolbar file itself stayed green).
2. Focused tests after implementation (same command) → `Test Files 2 passed (2)`, `Tests 8 passed (8)` (5 new + 3 existing LabelsToolbar).
3. `npx --yes pnpm@10.12.1 --filter @label-stock/web typecheck` (`tsc -p tsconfig.json`) → no output, zero errors.
4. `npx --yes pnpm@10.12.1 --filter @label-stock/web test` (`vitest run`) → `Test Files 31 passed (31)`, `Tests 504 passed (504)` (was 30 files / 499 tests).
5. Monorepo suite: `npx --yes pnpm@10.12.1 test` → shared 312, server 462, web 504 = 1278 passed, 0 failed (Task 1 ledger 1273 + 5 new).
6. `npx --yes pnpm@10.12.1 -r typecheck` → shared, server, web, e2e all "Done", zero errors.
7. `npx --yes eslint .` → clean (no findings).
8. `npx --yes prettier --check .` → all source files clean; the only 4 warnings are the unchanged brief files `.superpowers/sdd/task-1-brief.md`, `task-1-review.md`, `task-2-brief.md`, `task-3-brief.md`.

Main-toolbar verification (brief step 8): `git diff` shows the toolbar's search field keeps accessible name `Найти или отсканировать штрихкод`, placeholder `Контрагент, номер макета или последние цифры штрихкода`, `searchRef`, `data-scanner-target`; `LabelsToolbar.test.tsx` asserts `screen.getByRole('searchbox', { name: 'Найти или отсканировать штрихкод' })` and `type="search"`, and passes.

## Concerns

- Brief's blocks for `MovementHistoryTable.tsx` and `HistoryScreen.test.tsx` exceed `printWidth: 100`, so `prettier --write` was applied to those two files (line breaks around JSX text only, no token changes; Russian strings verified byte-identical by diffing against the brief blocks). Everything else is byte-exact from the brief.
- `SearchField.tsx` has one extra doc comment on the `scannerTarget` prop (`Set, если это единственное поле, куда сканер может вводить код, см. useBarcodeScanner.`) — the comment deleted from `LabelsToolbar.tsx` was preserved there instead of lost.
- `#/history` is hash-routed like `#/deleted`; static hosting and the dev server need no route registration. Not exercised in a real browser here (see next item).
- e2e (`@label-stock/e2e`, Playwright + axe-core) was NOT run: `e2e/playwright.config.ts` targets an already-running app (`E2E_BASE_URL`, default `http://localhost:8080`, docker compose or `pnpm dev:server` + built frontend), which is not started in this environment. Read-only check of `e2e/tests`: no assertion depends on nav-item count or the deleted-screen route shape (`labels.spec.ts` clicks link `Остатки`, `accessibility.spec.ts` goes to `#/deleted` and expects heading `Удалённые позиции` — both still present). Axe violations for the new history screen are not verified; Task 3 should cover that screen.
- `useBarcodeScanner` is a global `document` keydown hook and the scanner target is found by the `data-scanner-target` attribute; `App.tsx` renders exactly one screen at a time, so there is still exactly one scanner target per page.
- Search behavior: `search.trim()` debounced 300 ms, empty value becomes `undefined` (full history), and `apiRequest.buildUrl` skips empty params so unfiltered requests carry only `page`. Search matches layout number / barcode per Task 1 server contract; counterparty name is not searchable from the history screen either.
- `movementKeys.all` nests `labelKeys.all`, so any label mutation (including the Task 1 label-movement writes) invalidates the global history list. Coarse by design, matches the existing labels pattern.
- No focused test drives the barcode scanner on the history screen (the brief's test set does not include it); scanner wiring is only asserted by the shared `useBarcodeScanner` unit tests.
