import {
  ERROR_CODES,
  INT32_MAX,
  type CreateMovementData,
  type Movement,
  type MovementResult,
  type Paginated,
} from '@label-stock/shared';
import type { Database, Transaction } from '../../db/client';
import type { LabelRow, MovementRow } from '../../db/schema';
import { AppError, labelDeleted, negativeStock, notFound } from '../../shared/errors';
import { LabelsRepository } from '../labels/labels.repository';
import { toLabelDto } from '../labels/label.mapper';
import { MovementsRepository } from './movements.repository';

const labelNotFound = () => notFound('Позиция не найдена');

export function toMovementDto(row: MovementRow): Movement {
  return {
    id: row.id,
    labelId: row.labelId,
    delta: row.delta,
    quantityAfter: row.quantityAfter,
    reason: row.reason,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

type DeltaOperation = Exclude<CreateMovementData, { reason: 'inventory' }>;
type InventoryOperation = Extract<CreateMovementData, { reason: 'inventory' }>;

/** Остаток меняется только здесь: изменение и запись в журнал идут одной транзакцией. */
export class MovementsService {
  private readonly labels: LabelsRepository;

  constructor(private readonly db: Database) {
    this.labels = new LabelsRepository(db);
  }

  async apply(labelId: string, operation: CreateMovementData): Promise<MovementResult> {
    const movement = await this.db.transaction((tx) =>
      operation.reason === 'inventory'
        ? this.applyInventory(tx, labelId, operation)
        : this.applyDelta(tx, labelId, operation),
    );
    const label = await this.labels.findById(labelId);
    if (!label) throw labelNotFound();
    return { label: toLabelDto(label), movement: movement ? toMovementDto(movement) : null };
  }

  async list(labelId: string, page: number, pageSize: number): Promise<Paginated<Movement>> {
    if (!(await this.labels.findById(labelId))) throw labelNotFound();
    const { rows, total } = await new MovementsRepository(this.db).listByLabel(
      labelId,
      page,
      pageSize,
    );
    return { items: rows.map(toMovementDto), total, page, pageSize };
  }

  private async applyDelta(
    tx: Transaction,
    labelId: string,
    operation: DeltaOperation,
  ): Promise<MovementRow> {
    const movements = new MovementsRepository(tx);
    const printedAt = operation.reason === 'print' ? operation.printedAt : undefined;
    let updated = await movements.applyDelta(labelId, operation.delta, printedAt);
    if (!updated) {
      // Между отклонённым UPDATE и проверкой остаток могла поменять параллельная операция:
      // проверяем под блокировкой строки и, если дельта теперь допустима, применяем её.
      assertDeltaAllowed(await movements.lockLabel(labelId), operation.delta);
      updated = await movements.applyDelta(labelId, operation.delta, printedAt);
      if (!updated) throw new Error('UPDATE отклонён под блокировкой строки');
    }
    return movements.insert({
      labelId,
      delta: operation.delta,
      quantityAfter: updated.quantity,
      reason: operation.reason,
      comment: operation.comment ?? null,
    });
  }

  /** Инвентаризация задаёт точное значение; в журнал пишется пересчитанная дельта. */
  private async applyInventory(
    tx: Transaction,
    labelId: string,
    operation: InventoryOperation,
  ): Promise<MovementRow | null> {
    const movements = new MovementsRepository(tx);
    const locked = await movements.lockLabel(labelId);
    assertActive(locked);
    const delta = operation.setQuantity - locked.quantity;
    if (delta === 0) return null;
    await movements.setQuantity(labelId, operation.setQuantity);
    return movements.insert({
      labelId,
      delta,
      quantityAfter: operation.setQuantity,
      reason: 'inventory',
      comment: operation.comment ?? null,
    });
  }
}

function assertDeltaAllowed(label: LabelRow | undefined, delta: number): void {
  assertActive(label);
  const result = label.quantity + delta;
  if (result < 0) throw negativeStock();
  if (result > INT32_MAX) {
    throw new AppError(422, ERROR_CODES.validation, 'Остаток получится слишком большим');
  }
}

function assertActive(label: LabelRow | undefined): asserts label is LabelRow {
  if (!label) throw labelNotFound();
  if (label.deletedAt) throw labelDeleted();
}
