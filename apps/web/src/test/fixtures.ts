import type {
  CreateLabelResult,
  Label,
  Movement,
  MovementResult,
  Paginated,
} from '@label-stock/shared';

export function makeLabel(overrides: Partial<Label> = {}): Label {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    counterparty: { id: 'cp-1', name: 'Ромашка' },
    layoutNumber: '00123',
    barcode: '4600000000017',
    printedAt: '2026-11-01',
    quantity: 1200,
    obsoleteQuantity: 0,
    comment: null,
    version: 3,
    externalId: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

export function makeCreateLabelResult(
  label: Partial<Label> = {},
  overrides: Partial<CreateLabelResult> = {},
): CreateLabelResult {
  return { label: makeLabel(label), merged: false, movement: null, ...overrides };
}

export function makeMovement(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 'mv-1',
    labelId: '11111111-1111-4111-8111-111111111111',
    delta: -30,
    quantityAfter: 1170,
    reason: 'consumption',
    comment: null,
    createdAt: '2026-11-02T10:00:00.000Z',
    ...overrides,
  };
}

export function makeMovementResult(
  label: Partial<Label> = {},
  movement: Movement | null = makeMovement(),
): MovementResult {
  return { label: makeLabel(label), movement };
}

export function makePage<Item>(items: Item[], total = items.length): Paginated<Item> {
  return { items, total, page: 1, pageSize: 50 };
}
