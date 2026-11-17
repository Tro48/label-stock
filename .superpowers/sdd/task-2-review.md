# Review Task 2: History Screen (web)

Дата review: 2026-11-17.
Reviewer: независимо pевiewer (Task 2 only).
Materialy: `task-2-brief.md` (trequirements), `task-2-report.md` (implementation y test-эvidence), `task-2-review.diff` (full working-tree diff).

## Кросс-check diff

Working tree (git status, branch `main`, HEAD `d813f0a` — pre-existing user commit "fix: input contragent ui"): 4 modified files + 5 new files, no commits created — constraint «Do not create git commits» respected, all Task 2 changes uncommitted.
`git diff --shortstat`: 27 insertions / 21 deletions — matches the report exactly.
Every new file on disk byte-matches the saved diff (`wc -l`: SearchField.tsx 40, movements/api.ts 18, HistoryScreen.tsx 58, MovementHistoryTable.tsx 66, HistoryScreen.test.tsx 118). No code removed by accident: the 21 deletion lines are the old inline search markup in LabelsToolbar.tsx, the old route/nav lines in use-hash-route.ts/App.tsx, and the CSS hunk — all replaced, nothing else touched. e2e/server packages untouched (git status lists only the 9 Task-2 files).

## Point-by-point verification

### 1. Preservation of main-screen behavior (shared input)

- `SearchField` extracted verbatim from the old LabelsToolbar inline markup: `<form role="search">` + `<label>` + `type="search"` input with identical attribute set and DOM order (SearchField.tsx:23–38 vs the removed block in LabelsToolbar.tsx per diff). Main screen now calls `SearchField` (LabelsToolbar.tsx:28–35) passing the same accessible name, placeholder, `searchRef` for the scanner, and `scannerTarget` — the toolbar searchbox semantics are unchanged.
- Pre-existing test `LabelsToolbar.test.tsx:41–46` still asserts the searchbox role/name through the extracted component — report says green, and the markup it targets is the same as before.
- `onChange={changeSearch}` on input (SearchField.tsx:35) keeps user typing wired to the same handler as before; form `onSubmit` preventDefault preserved (line 23).

### 2. Route and navigation correctness

- `Route` union extended with `'history'` (use-hash-route.ts:3), `ROUTE_HREFS.history = '#/history'` (:7), `readRoute` returns `'history'` for that hash (:12–14). Hash routing pattern (subscribe/unsubscribe in `useSyncExternalStore`, use-hash-route.ts:17–25) untouched.
- `App.tsx`: import at :6, nav item `{ route: 'history', text: 'История' }` at :13, exclusive screen rendering `route === 'history' && <HistoryScreen />` at :68–70. Nav links are ordinary `<a>` with `aria-current="page"` on the active route (App.tsx:43) — works for the new item without changes.

### 3. React/TanStack Query state and invalidation

- `movementKeys.all = [...labelKeys.all, 'movements']` (movements/api.ts:6–7) nests the global history key under `labelKeys.all` (`['labels']`, labels/api.ts:16–22). `useLabelMutation` invalidates `labelKeys.all` on settle (labels/api.ts:57–63), so every label/movement mutation (create, update, delete, movement create, import) invalidates the global history list `movementKeys.list(params)` (movements/api.ts:8, queryKey :13). Coverage verified by key-prefix containment; grep confirms `movementKeys` has no consumers outside movements/api.ts, and no other invalidation path is needed or bypassed.
- `useQuery` with `placeholderData: keepPreviousData` (movements/api.ts:11–17) — page changes don't blank the table, matching the main screen's pattern (labels/api.ts:24–31).
- No manual `mutate`/invalidate added in HistoryScreen — correct: history is read-only there, mutations happen on other screens via `useLabelMutation`.

### 4. Server contract consumed correctly

- `apiRequest<Paginated<MovementListItem>>('/movements', { params: { ...params } })` (movements/api.ts:15) hits `GET /api/movements` from Task 1 (movements.routes.ts:57–68). `buildUrl`/`apiRequest` (client.ts:24–31) omit `undefined` params, so `{search: undefined, page: 1}` sends only `page` — matches `listMovementsQuerySchema` defaults (page 1). Params type is `ListMovementsParams` (movement.ts:114–118) — the client-side interface Task 1 left unused, now consumed as designed.

### 5. Scanner behavior on History

- `useBarcodeScanner({ onScan: changeSearch })` (HistoryScreen.tsx:24) installs a `document`-level keydown capture hook that buffers keystrokes, and routes the scanned code to the input carrying `data-scanner-target` (HistoryScreen.tsx:34 → SearchField.tsx:36, attribute emitted only when `scannerTarget` is true). One scanner target per screen: main screen's SearchField also passes `scannerTarget`, but the two screens never render simultaneously (App.tsx:68–70 exclusive), so no ambiguity.
- Teardown cleanup: the hook is removed on component teardown (useBarcodeScanner.ts, cleanup path reviewed earlier) — no listener leak when navigating stock ↔ history.
- Scanned code goes through `changeSearch`, which resets page to 1 (HistoryScreen.tsx:20–23) — scanning from a deep page jumps back to page 1 of the new result set, intended per brief.

### 6. Debounce and page reset

- `useDebouncedValue(search.trim(), 300)` (HistoryScreen.tsx:16,10) — same helper and same 300 ms as the main screen (use-debounced-value.ts:3–9); scanner buffer + keyboard-typing debounce preserved for history.
- Page state: `page` is separate React state; `Pagination.onPageChange={setPage}` (HistoryScreen.tsx:52) matches the shared component contract (Pagination.tsx: onPageChange receives target page; «Вперёд» button, disabled-at-last-page pattern — semantics verified against the shared component). `onPageChange={setPage}` feeds new page into `params` → new `queryKey` → new request; `keepPreviousData` keeps the table visible during transition.

### 7. Loading / error / empty states

- Error: `<ErrorAlert error={error ?? failureReason} retrying={isFetching} />` (HistoryScreen.tsx:36) — identical prop shape to the main screen (LabelsList.tsx:40–41); `ErrorAlert` renders `role="alert"` (ErrorAlert.tsx) so failures are announced.
- Loading: `isPending && !failureReason && <p>Загруаем…</p>` (HistoryScreen.tsx:37) — matches the main-screen pattern.
- Empty: `data.total === 0` branch (HistoryScreen.tsx:38–45) shows two texts — with search: «Ничего не найдено. Измените условия поиска.»; without: «Изменений остатка пока не было.» — strings match the brief verbatim.
- All Russian copy (`История изменений`, `Поиск по истории`, `Номер макета или штрихкод`, table headers, pagination strings) checked character-for-character against the brief blocks.

### 8. Table semantics and CSS integration

- `MovementHistoryTable` is semantic `<table class="table table--grid movement-history-table">` with `<caption>`, `<thead>`, `<tbody>` and 8 `<th>`/`<td>` per row — 8 columns (label, counterparties layout number, barcode, delta, reason, counterparty name, date, time). Reason labels from `MOVEMENT_REASON_LABELS` (movement.ts): «Списание» consumed from the shared map, no string duplication.
- CSS: `.movement-history-table` (global.css:490) exists and extends the established `.table--grid` subgrid pattern (global.css:446–478, sticky thead :473). The table sits inside `<section class="screen">`; `.screen > .table-scroll` (global.css:222–230) applies the scroll container per existing screens. `.toolbar__search` (global.css:239) is not scoped to the toolbar element, so the extracted search form styles correctly on the history screen — verified there is no `.toolbar .toolbar__search` descendant dependency.
- Formatters reused from shared format.ts exports for date/time/quantity — no new formatting code.

### 9. Test evidence and TDD sequence (from the report, arithmetic checked)

- Focused web tests: FAIL 6 failed/12 passed → PASS: focused 8 = 5 new + 3 existing ✓.
- Web package: 504 = 499 baseline (Task 1 end state) + 5 new ✓.
- Monorepo full suite: 1278 = 1273 (Task 1 end state) + 5 ✓.
- TDD order (focused failing tests first, implementation, then full suite) followed per brief Steps.
- Prettier reformatted `MovementHistoryTable.tsx` and `HistoryScreen.test.tsx` after the brief's code blocks (report acknowledged); diff-vs-disk and disk-vs-brief reading confirm the result is semantically identical to the brief — formatting only.
- lint/typecheck clean per report; changed sources read with no lint-visible defects (imports all used, ordering consistent with neighbors). Report ran `npx --yes pnpm@10.12.1` because pnpm is not on PATH — environment workaround, not a code issue.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **Missing comment on intentional key nesting** — `movements/api.ts:6–7`: `movementKeys.all = [...labelKeys.all, 'movements']` has no comment explaining *why* it nests (label mutations invalidate the global history list via `labelKeys.all`, labels/api.ts:57–63). The brief explained it in prose only; code should carry it per the project's commenting rule (обvious why-comment at architectural decisions). Related informational note: `labelKeys.movements(id)` (labels/api.ts:21) emits key `['labels','movements',id]`, while `movementKeys.list({...})` is `['labels','movements','list',{...}]` — prefix overlap would only collide if a labelId were literally `'list'` (id is a uuid, db/schema.ts:81), so safe in practice.
2. **`setPage(1)` is not debounced** — HistoryScreen.tsx:16,21–22: `useDebouncedValue` covers `search`, but `changeSearch` resets `page` immediately. Typing a query while on page > 1 fires a transient request `{oldSearch, page: 1}` and briefly renders an intermediate page before the debounced search lands. Matches the brief's prescribed code exactly, so not a spec miss — optional improvement: debounce the page reset or derive page from search-identity.
3. **Language-mixing nit** — SearchField.tsx:9 doc comment starts with English «Set, если это единственное поле…»; the word is an artifact of extraction, could be «Настроен, если…» / rephrased. Zero functional impact.
4. **Coverage gaps to disclose (all optional / out of brief)** — (a) loading `<p>Загруаем…</p>` (HistoryScreen.tsx:37) and empty-state `<p>` (:40–44) are not in an `aria-live` container; identical to the main screen (LabelsList.tsx:41), so parity holds — but neither screen announces these transitions. (b) No focused test exercises the scanner on the history screen; the brief didn't prescribe one. (c) e2e/axe not run against the new screen — report line 64, and Task 3 covers it.

## Missing requirements

None. Every brief requirement (route + nav, screen markup, shared SearchField extraction with main-screen preservation, query wiring + invalidation nesting, debounce, table semantics, states, 5 tests, no commits, no git mutation) is implemented and matches the brief; deviations are prettier formatting only.

## Optional improvements

From Minor list, worth considering next round: item 2 (debounced page reset in HistoryScreen.tsx) is the only user-visible behavior edge; item 1 (add the why-comment in movements/api.ts) is a quick fix. Item 3 is a one-word nit; item 4(a) affects both screens equally and predates this task.

## Not independently verified (and why)

- Test runs were not re-executed per review instructions; report counts (focused 8 = 5+3, web 504 = 499+5, monorepo 1278 = 1273+5) cross-checked arithmetically against the 5 new tests and passed.
- e2e/axe and real-browser behavior not exercised (scanner keydown routing, sticky thead on scroll, `#/history` navigation) — verified by reading source against the shared components' contracts; Task 3's e2e will cover it.
- `eslint`/`typecheck`/`prettier` cleanliness taken from the report; changed files were read and show no lint-visible defects.

## Verdicts

SPEC_COMPLIANCE PASS
CODE_QUALITY APPROVED
