# Task 1 report: shared contracts + GET /api/movements

## Status

DONE

## What was done

Implemented Task 1 per `.superpowers/sdd/task-1-brief.md` with strict TDD:

1. Shared contracts in `packages/shared/src/schemas/movement.ts`: `movementListItemSchema`, `listMovementsQuerySchema`, `MovementListItem`, `ListMovementsQuery`, `ListMovementsParams` (verbatim code from the brief).
2. Two shared tests in `packages/shared/src/schemas/movement.test.ts` (describe `общая журнал`).
3. Server repository `listAll` in `apps/server/src/modules/movements/movements.repository.ts`: joins `stockMovements` × `labels` × `counterparties`, global search by layout-number prefix or barcode prefix/suffix (`buildGlobalSearchCondition`), newest-first ordering, pagination + total.
4. DTO mapper `toMovementListItemDto` and service method `listAll` in `apps/server/src/modules/movements/movements.service.ts`.
5. Route `GET /api/movements` registered in `apps/server/src/modules/movements/movements.routes.ts` (`/api` prefix comes from app scope).
6. One API test appended to `apps/server/test/movements.test.ts` (verbatim from the brief).

Per-label history (`/labels/:id/movements`) untouched — verified via `git diff`.

## Changed files

- `packages/shared/src/schemas/movement.ts` (+32)
- `packages/shared/src/schemas/movement.test.ts` (+35)
- `apps/server/src/modules/movements/movements.repository.ts` (+63)
- `apps/server/src/modules/movements/movements.service.ts` (+31)
- `apps/server/src/modules/movements/movements.routes.ts` (+15)
- `apps/server/test/movements.test.ts` (+59)

Totals per `git diff --stat`: 229 insertions, 6 deletions (insertions include prettier re-wrapping of some import lines).

## Commands and results

All pnpm commands run as `npx --yes pnpm@10.12.1 …` (pnpm binary absent from PATH).

1. Shared focused test (after adding tests, before implementation):
   `npx --yes pnpm@10.12.1 --filter @label-stock/shared exec vitest run src/schemas/movement.test.ts`
   → FAIL as expected: 2 failed / 41 passed (`Cannot read properties of undefined`).
2. Shared focused test after implementation:
   same command → PASS 43 passed (43).
3. Server focused test before route existed:
   `npx --yes pnpm@10.12.1 --filter @label-stock/server exec vitest run test/movements.test.ts`
   → FAIL as expected: 1 failed / 26 passed, new test got HTTP 404.
4. Server focused test after implementation:
   same command → PASS 27 passed (27).
5. Full suite: `npx --yes pnpm@10.12.1 -r --workspace-concurrency=1 --filter '!@label-stock/e2e' test`
   → shared 312, server 462, web 499 — 1273 passed, 0 failed (baseline 1270 + 3 new).
6. Typechecks: `npx --yes pnpm@10.12.1 -r typecheck` → shared, server, web, e2e all Done, no errors.
   (Also the brief's per-package typechecks passed.)
7. `eslint .` → clean. `prettier --check .` → clean for all source files (4 remaining warnings are task brief `.md` files, not code).

## Concerns

- `ListMovementsParams` is added per the brief but not consumed yet — it mirrors `ListLabelsParams` and will be used by the client side (Tasks 2/3). Unused exported interface is intentional.
- Search matches layout number by prefix and barcode by prefix or suffix; it deliberately does not match counterparty name (test asserts `search=Ромашка` → total 0). This is the brief's contract.
- `GET /api/movements` joins with `innerJoin(labels)`: movements of labels hard-deleted from DB would disappear from the global history. Deletion here is soft (`deletedAt`), tests rely on that; hard deletion is out of scope.
- Cyrillic comments were inserted programmatically from the brief (generation of Cyrillic proved unreliable in this session); all Russian strings verified by reading files back.
