import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { INT32_MAX, type MovementReason } from '@label-stock/shared';
import { labels, stockMovements, type LabelRow, type MovementRow } from '../../db/schema';
import type { DbExecutor } from '../../db/client';

export interface NewMovementValues {
  labelId: string;
  delta: number;
  quantityAfter: number;
  reason: MovementReason;
  comment: string | null;
}

export interface DeltaOptions {
  printedAt?: string | undefined;
  /** Допечатка нового макета: весь остаток до неё становится подлежащим утилизации. */
  layoutChanged?: boolean;
  /** Списание и перемещение берут только годный остаток: старый макет уходит лишь утилизацией. */
  usableOnly?: boolean;
}

export class MovementsRepository {
  constructor(private readonly db: DbExecutor) {}

  async insert(values: NewMovementValues): Promise<MovementRow> {
    const [row] = await this.db.insert(stockMovements).values(values).returning();
    return row!;
  }

  /**
   * Атомарное изменение остатка одним UPDATE: параллельные списания не затирают друг друга.
   * Сумма считается в bigint, чтобы переполнение int4 не превращалось в 500.
   * undefined — позиции нет, она удалена или остаток вышел бы за допустимые границы.
   */
  async applyDelta(
    labelId: string,
    delta: number,
    { printedAt, layoutChanged = false, usableOnly = false }: DeltaOptions = {},
  ): Promise<LabelRow | undefined> {
    const floor = usableOnly ? sql`${labels.obsoleteQuantity}` : sql`0`;
    const [row] = await this.db
      .update(labels)
      .set({
        quantity: sql`${labels.quantity} + ${delta}`,
        // В SET справа старые значения: при смене макета в утилизацию уходит остаток до допечатки.
        // Иначе уменьшение остатка (исправление) не даёт «старому» превысить весь остаток.
        obsoleteQuantity: layoutChanged
          ? sql`${labels.quantity}`
          : sql`LEAST(${labels.obsoleteQuantity}, ${labels.quantity} + ${delta})`,
        updatedAt: sql`now()`,
        // Дата печати входит в редактируемые поля, поэтому её смена поднимает версию.
        ...(printedAt ? { printedAt, version: sql`${labels.version} + 1` } : {}),
      })
      .where(
        and(
          eq(labels.id, labelId),
          isNull(labels.deletedAt),
          sql`${labels.quantity}::bigint + ${delta} BETWEEN ${floor} AND ${INT32_MAX}`,
        ),
      )
      .returning();
    return row;
  }

  /** Списывает весь старый макет. Вызывается под lockLabel, поэтому объём известен заранее. */
  async disposeObsolete(labelId: string): Promise<LabelRow> {
    const [row] = await this.db
      .update(labels)
      .set({
        quantity: sql`${labels.quantity} - ${labels.obsoleteQuantity}`,
        obsoleteQuantity: 0,
        updatedAt: sql`now()`,
      })
      .where(eq(labels.id, labelId))
      .returning();
    return row!;
  }

  /**
   * Переносит остаток сливаемой позиции: количество и «старый макет» растут вместе,
   * поэтому инварант obsoleteQuantity <= quantity сохраняется. undefined — сумма вылезает за int4.
   */
  async absorbStock(
    labelId: string,
    quantity: number,
    obsoleteQuantity: number,
  ): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .update(labels)
      .set({
        quantity: sql`${labels.quantity} + ${quantity}`,
        obsoleteQuantity: sql`${labels.obsoleteQuantity} + ${obsoleteQuantity}`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(labels.id, labelId),
          sql`${labels.quantity}::bigint + ${quantity} BETWEEN 0 AND ${INT32_MAX}`,
        ),
      )
      .returning();
    return row;
  }

  /** Блокирует строку до конца транзакции: инвентаризация считает дельту от актуального остатка. */
  async lockLabel(labelId: string): Promise<LabelRow | undefined> {
    const [row] = await this.db.select().from(labels).where(eq(labels.id, labelId)).for('update');
    return row;
  }

  async setQuantity(labelId: string, quantity: number): Promise<LabelRow> {
    const [row] = await this.db
      .update(labels)
      .set({
        quantity,
        obsoleteQuantity: sql`LEAST(${labels.obsoleteQuantity}, ${quantity})`,
        updatedAt: sql`now()`,
      })
      .where(eq(labels.id, labelId))
      .returning();
    return row!;
  }

  async listByLabel(
    labelId: string,
    page: number,
    pageSize: number,
  ): Promise<{ rows: MovementRow[]; total: number }> {
    const where = eq(stockMovements.labelId, labelId);
    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select()
        .from(stockMovements)
        .where(where)
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(stockMovements).where(where),
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  }
}
