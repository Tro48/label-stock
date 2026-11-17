# Review Task 1: Shared Contracts and Global Movements API

Дата review: 2026-11-17.
Reviewer: независий pевiewer (Task 1 only).
Materialy: `task-1-brief.md` (тrequirements), `task-1-report.md` (implementation y test-эvidence), `task-1-review.diff` (full working-tree diff).

## Кросс-check diff

Working tree (git status 2026-11-17 16:52, branch `main`, HEAD `d813f0a`): 6 modified files, no commits created — constraint «Do not create git commits» respected.
`git diff --stat`: 229 insertions, 6 deletions — matches the report.
Every added/removed line in `task-1-review.diff` is identical to the current `git diff` (all 6 deletion lines are prettier re-wrap of import statements; the saved diff only carries wider overlapping hunks). No code was removed by accident.

## Point-by-point verification

### 1. DTO contract

- `movementListItemSchema` (movement.ts:97–105) = `movementSchema.extend({ label: labelSchema.pick(...) })` with exactly five label fields: `id`, `counterparty`, `layoutNumber`, `barcode`, `deletedAt`. Matches spec §API (docs/superpowers/specs/2026-11-17-stock-movement-history-design.md:30–36).
- `labelSchema.pick({counterparty: true})` (label.ts:15) keeps the nested `counterparty: { id, name }` — DTO shape `counterparty: { id, name }` satisfied.
- Mapper `toMovementListItemDto` (movements.service.ts:32–43) builds exactly this shape: `deletedAt` is ISO string or null (`row.label.deletedAt?.toISOString() ?? null`), nullable per labelSchema (label.ts:27).
- Route response: `paginatedSchema(movementListItemSchema)` (movements.routes.ts:64) — items/total/page/pageSize per common.ts:44–51.
- Query contract `listMovementsQuerySchema` (movement.ts:107–109) = page/pageSize defaults 1/50, pageSize max 200 (common.ts:36–42) + optional trimmed `search` max 200 (fields.ts:23). Test asserts `{}` → `{page:1, pageSize:50}` (movement.test.ts:117) and rejection of `pageSize: 201` (movement.test.ts:143–145).
- `MovementListItem` / `ListMovementsQuery` exported (movement.ts:111–112) and consumed by service/repository (movements.service.ts:5, movements.repository.ts:5). `ListMovementsParams` (movement.ts:114–118) is intentionally unused: client-side interface for Tasks 2/3, mirrors `ListLabelsParams` (label.ts:92–100). Not a defect.

All five "Produces" interfaces exist exactly as brief specified, verbatim: `movementListItemSchema`, `listMovementsQuerySchema`, `MovementListItem`, `ListMovementsQuery`, `ListMovementsParams`, `MovementsService.listAll` (movements.service.ts:77–85), `GET /api/movements` (movements.routes.ts:57–68; `/api` prefix comes from app.ts:89–96).

### 2. Newest-first deterministic ordering

`.orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))` (movements.repository.ts:188) — exactly spec §API:40 `createdAt DESC, id DESC`. `id` is a uuid primary key (db/schema.ts:81) — ordering is deterministic (stable tie-break), matching per-label history `listByLabel` (movements.repository.ts:153–170, untouched). New tests assert delta order `[-5, 40, 100]` (test 184) and pagination `page=2&pageSize=2 → 1 item` (test 213–215). No user sort parameters accepted — constraint respected.

### 3. Layout-prefix and barcode prefix/suffix search

`buildGlobalSearchCondition` (movements.repository.ts:40–49):
- layout: `like(labels.layoutNumber, '<escaped search>%')` — prefix only, raw text: leading zeros preserved because `layout_number` is text with digits check (db/schema.ts:42–43, check at :58). Test `?search=001` → two `first`-label items, second excluded (test 199–206).
- barcode: `like(barcode, '<normalized>%') OR like(barcode, '%<normalized>')` — prefix or suffix, per spec §API:45. Test `?search=23456` → total 2 (test 208–209).
- normalized-empty guard: `barcode ? ... : undefined` — when `normalizeBarcode(search)` is empty, barcode branch dropped (same shape as labels.repository.ts:55–59).
- Counterparty and comment excluded from search — spec §API:46; test asserts `?search=Ромашка → total 0` (test 210–211). Note: the layout branch of a Cyrillic query would LIKE-compare against digit-only column, and the barcode branch searches keyboard-layout-normalized 'RJVFIRF' — deterministic miss, correct per contract.
- Behavior parity with main-screen search: the layout/barcode clauses are literally the same as labels.repository.ts:55–68 minus the `ilike(counterparties.name)` clause — exactly what the spec intends ("History scans only replace the history filter", main screen untouched).

### 4. LIKE escaping

`escapeLikePattern` (apps/server/src/shared/like.ts:1–4, escapes `%`, `_`, `\`) applied to both the raw search (layout branch) and `normalizeBarcode(search)` (barcode branch) *before* embedding wildcards (movements.repository.ts:41–42, 44–46). The pattern is then passed as drizzle template literal — drizzle emits the literal as a SQL parameter, so the injection surface is clean; only the LIKE metacharacters needed escaping, and they are escaped. Reuse-only constraint satisfied: no new helper, no new dependency.
The escaping mechanism itself already has coverage via labels-list tests (`labels-list.test.ts:199–201`, `:255`, `:289–292`); no `/api/movements`-level case asserting a literal `%`/`_` search was added — see Minor findings.

### 5. Pagination totals

Two queries in `Promise.all` (movements.repository.ts:181–196): rows with `limit/offset`, total via `count()`. The total count omits the `counterparties` join while the rows query has it. Verified safe: `stockMovements.labelId` is NOT NULL FK (db/schema.ts:82–84) and `labels.counterpartyId` is NOT NULL FK (db/schema.ts:39–41), and the whole codebase contains exactly one hard-delete — none for counterparties (grep `delete(` in apps/server/src found only `labels.routes.ts:109`, which is soft). So both joins are 1:1 and totals cannot disagree with joinable rows. `totalRow?.total ?? 0` guards empty count.
Non-atomicity between the rows and total queries under a concurrent insert — same established pattern as `listByLabel` (153–170) and `LabelsRepository.list` (labels.repository.ts:88–100); see Minor findings.

### 6. Soft-deleted labels

DELETE `/labels/:id` is soft (labels.routes.ts:109–123 → `softDelete`, sets `deletedAt`; db/schema.ts:55 nullable timestamp). `listAll` uses `innerJoin(labels, ...)` (movements.repository.ts:185/194) which keeps rows of soft-deleted labels, and DTO carries `deletedAt`. Test deletes `first` label and asserts total 2 and non-null `deletedAt` (test 217–220). The report's concern that movements of *hard*-deleted labels would vanish is accurate but out of scope — the product has no label hard-deletion.

### 7. Preservation of per-label history

`listByLabel` (movements.repository.ts:153–170) byte-identical to pre-change context in the saved diff; `GET /labels/:id/movements` (movements.routes.ts:43–55) and `MovementsService.list` (movements.service.ts:67–75) unchanged; pre-existing server tests for per-label history still present (movements.test.ts:140–162). The 6 git-deletion lines are import re-wraps only. e2e/web packages untouched (git status: only 6 Task-1 files). Constraint satisfied.

### 8. Test evidence and TDD sequence (from the report, arithmetic checked)

- shared: FAIL 2 failed/41 passed (contracts absent) → PASS 43 passed: 41+2 = 43 ✓ (two tests added).
- server: FAIL 1 failed (HTTP 404) / 26 passed → PASS 27 passed ✓.
- full suite 1273 = 312 shared + 462 server + 499 web = baseline 1270 + 3 new ✓.
- typecheck all packages clean, `eslint .` clean, `prettier --check` clean for sources (4 warnings are brief .md files, acceptable).
- TDD order (failing tests first, focused before broad) followed per brief Steps 1–9.

## Findings

### Critical

None.

### Important

None.

### Minor

1. **Test coverage gap (optional improvement, not a spec requirement)** — literal `%`/`_` LIKE-escape is not exercised through the new route `/api/movements`; the shared `escapeLikePattern` is covered only via labels-list tests (`apps/server/test/labels-list.test.ts:199–201, 255, 289–292`). One `inject({url: '/api/movements?search=%'})`-style case would cover the new call site directly. The brief did not prescribe it, so it is not a missing requirement.
2. **Search logic duplication** — barcode prefix/suffix clause exists twice: `buildBarcodeCondition` (labels.repository.ts:55–59) and inside `buildGlobalSearchCondition` (movements.repository.ts:45–47). It could move next to `escapeLikePattern` in `apps/server/src/shared/` and be shared by both repositories (DRY per global instructions). Counterarguments: the brief prescribes this code verbatim, the label-list semantics differ (extra `ilike` counterparty clause), and cross-repository coupling of repository-level SQL conditions was not established in the codebase. Suggest for the next round, not required now.
3. **Non-atomic rows+total pair** — `rows` and `total` are two parallel queries without a snapshot (movements.repository.ts:181–196): a movement inserted between them makes `total` inconsistent with the returned page (e.g., last page length computation). Same pattern as `listByLabel` and `LabelsRepository.list`, and the UI mitigates via `keepPreviousData` (spec §Стоятния). Informational only.
4. **Empty `?search=` is silently "no filter"** — `searchTextSchema` has no `min(1)` (fields.ts:23), so `?search=%20` parses to `''` and `query.search ? ... : undefined` (movements.repository.ts:175) treats it as absent. Same pattern as labels list (labels.repository.ts:81). Harmless edge, untested; consistent product-wide.
5. **Barcode search is case-sensitive** — PostgreSQL `like` on 'abc123456' won't match stored 'ABC123456' because `normalizeBarcode` folds Cyrillic key positions but not letter case (packages/shared/src/barcode.ts:18–24). The main-screen label search has the identical limitation (labels.repository.ts:58 uses `like` too), so behavior parity holds and the spec ("existing normalization") is met. Flagging only so the team knows the limitation is shared, not new.
6. **`ListMovementsParams` currently unused** (movement.ts:114–118) — intentional per report and mirrors `ListLabelsParams`; will be consumed by Tasks 2/3 client side. No action.

## Missing requirements

None found. All spec §API elements (parameters and defaults, DTO fields, ordering, search semantics, soft-deleted inclusion, reuse-only, no migration, no commits) are implemented and match the brief verbatim.

## Optional improvements

Items 1–2 of the Minor list (extra route-level escape test; extract shared barcode condition) are the two worth doing; the rest are informational notes about shared pre-existing patterns.

## Not independently verified (and why)

- Test runs were not re-executed per review instructions — report evidence (counts, 404-before/route-after, suite 1273) cross-checked arithmetically against the 3 added tests and passed.
- Docker/Testcontainers runtime behavior not reproduced; correctness of ordering/search/escaping was verified by reading source against PostgreSQL semantics, not by running the endpoint.
- `eslint`/`prettier`/`typecheck` cleanliness taken from the report; the changed files were read and show no lint-visible defects (imports all used, ordering consistent with neighboring files).

## Verdicts

SPEC_COMPLIANCE PASS
CODE_QUALITY APPROVED
