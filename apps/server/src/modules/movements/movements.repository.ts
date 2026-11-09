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
    printedAt: string | undefined,
  ): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .update(labels)
      .set({
        quantity: sql`${labels.quantity} + ${delta}`,
        updatedAt: sql`now()`,
        // Дата печати входит в редактируемые поля, поэтому её смена поднимает версию.
        ...(printedAt ? { printedAt, version: sql`${labels.version} + 1` } : {}),
      })
      .where(
        and(
          eq(labels.id, labelId),
          isNull(labels.deletedAt),
          sql`${labels.quantity}::bigint + ${delta} BETWEEN 0 AND ${INT32_MAX}`,
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
      .set({ quantity, updatedAt: sql`now()` })
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
