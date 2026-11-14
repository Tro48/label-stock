import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { normalizeBarcode, type LabelSortField, type ListLabelsQuery } from '@label-stock/shared';
import { counterparties, labels, type LabelRow } from '../../db/schema';
import type { DbExecutor } from '../../db/client';
import { escapeLikePattern } from '../../shared/like';

export interface LabelWithCounterparty {
  label: LabelRow;
  counterpartyName: string;
}

export type UniqueLabelField = 'layoutNumber' | 'barcode';

export type NewLabelValues = Pick<
  LabelRow,
  'counterpartyId' | 'layoutNumber' | 'barcode' | 'printedAt' | 'quantity' | 'comment'
>;

export type LabelPatch = Partial<
  Pick<LabelRow, 'counterpartyId' | 'layoutNumber' | 'barcode' | 'printedAt' | 'comment'>
>;

const selection = { label: labels, counterpartyName: counterparties.name };

// Номер макета сортируется по длине, затем по строке: `9` раньше `10`, ведущие нули не теряются.
const SORT_EXPRESSIONS: Record<LabelSortField, SQL[]> = {
  counterparty: [sql`lower(${counterparties.name})`],
  layoutNumber: [sql`length(${labels.layoutNumber})`, sql`${labels.layoutNumber}`],
  barcode: [sql`${labels.barcode}`],
  printedAt: [sql`${labels.printedAt}`],
  quantity: [sql`${labels.quantity}`],
  updatedAt: [sql`${labels.updatedAt}`],
};

/**
 * Штрихкод ищется по началу или по концу: обычно набирают его последние цифры.
 * Середину не ищем, иначе короткий ввод цепляет случайные совпадения внутри кодов.
 */
function buildBarcodeCondition(search: string): SQL | undefined {
  const barcode = escapeLikePattern(normalizeBarcode(search));
  if (!barcode) return undefined;
  return or(like(labels.barcode, `${barcode}%`), like(labels.barcode, `%${barcode}`));
}

function buildSearchCondition(search: string): SQL | undefined {
  const escaped = escapeLikePattern(search);
  return or(
    ilike(counterparties.name, `%${escaped}%`),
    like(labels.layoutNumber, `${escaped}%`),
    buildBarcodeCondition(search),
  );
}

export class LabelsRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(query: ListLabelsQuery): Promise<{ rows: LabelWithCounterparty[]; total: number }> {
    const where = and(
      query.deleted ? isNotNull(labels.deletedAt) : isNull(labels.deletedAt),
      query.counterpartyId ? eq(labels.counterpartyId, query.counterpartyId) : undefined,
      query.counterpartyName
        ? ilike(counterparties.name, `%${escapeLikePattern(query.counterpartyName)}%`)
        : undefined,
      query.onlyEmpty ? eq(labels.quantity, 0) : undefined,
      query.search ? buildSearchCondition(query.search) : undefined,
    );
    const direction = query.order === 'desc' ? sql`DESC NULLS LAST` : sql`ASC NULLS LAST`;
    const orderBy = SORT_EXPRESSIONS[query.sort].map(
      (expression) => sql`${expression} ${direction}`,
    );

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select(selection)
        .from(labels)
        .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
        .where(where)
        .orderBy(...orderBy, asc(labels.createdAt), asc(labels.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: count() })
        .from(labels)
        .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
        .where(where),
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  }

  async findById(id: string): Promise<LabelWithCounterparty | undefined> {
    const [row] = await this.db
      .select(selection)
      .from(labels)
      .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
      .where(eq(labels.id, id));
    return row;
  }

  async findByIds(ids: readonly string[]): Promise<LabelWithCounterparty[]> {
    if (ids.length === 0) return [];
    return this.db
      .select(selection)
      .from(labels)
      .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
      .where(inArray(labels.id, [...ids]));
  }

  async findActiveByBarcode(barcode: string): Promise<LabelWithCounterparty | undefined> {
    const [row] = await this.db
      .select(selection)
      .from(labels)
      .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
      .where(and(eq(labels.barcode, barcode), isNull(labels.deletedAt)));
    return row;
  }

  /** ID активной позиции, которая уже занимает значение уникального поля. */
  async findActiveIdByUniqueField(
    field: UniqueLabelField,
    value: string,
    excludeId?: string,
  ): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: labels.id })
      .from(labels)
      .where(
        and(
          eq(labels[field], value),
          isNull(labels.deletedAt),
          excludeId ? ne(labels.id, excludeId) : undefined,
        ),
      );
    return row?.id;
  }

  /** Активная позиция по номеру макета или штрихкоду, с блокировкой строки до конца транзакции. */
  async lockActiveByUniqueField(
    field: UniqueLabelField,
    value: string,
  ): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .select()
      .from(labels)
      .where(and(eq(labels[field], value), isNull(labels.deletedAt)))
      .for('update');
    return row;
  }

  /** Номера макетов, которые заняты больше чем одной активной позицией. */
  async findDuplicateLayoutNumbers(): Promise<string[]> {
    const rows = await this.db
      .select({ layoutNumber: labels.layoutNumber })
      .from(labels)
      .where(and(isNull(labels.deletedAt), isNotNull(labels.layoutNumber)))
      .groupBy(labels.layoutNumber)
      .having(gt(count(), 1));
    return rows.map((row) => row.layoutNumber!);
  }

  /** Активные позиции с этими номерами, заблокированные до конца транзакции, от старых к новым. */
  async lockActiveByLayoutNumbers(numbers: readonly string[]): Promise<LabelRow[]> {
    if (numbers.length === 0) return [];
    return this.db
      .select()
      .from(labels)
      .where(and(isNull(labels.deletedAt), inArray(labels.layoutNumber, [...numbers])))
      .orderBy(asc(labels.layoutNumber), asc(labels.createdAt), asc(labels.id))
      .for('update');
  }

  async insert(values: NewLabelValues): Promise<LabelRow> {
    const [row] = await this.db.insert(labels).values(values).returning();
    return row!;
  }

  /** Обновляет активную позицию при совпадении версии; undefined — версия устарела или позиции нет. */
  async updateWithVersion(
    id: string,
    version: number,
    patch: LabelPatch,
  ): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .update(labels)
      .set({ ...patch, version: sql`${labels.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(labels.id, id), eq(labels.version, version), isNull(labels.deletedAt)))
      .returning();
    return row;
  }

  async softDelete(id: string): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .update(labels)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()`, version: sql`${labels.version} + 1` })
      .where(and(eq(labels.id, id), isNull(labels.deletedAt)))
      .returning();
    return row;
  }

  async restore(id: string): Promise<LabelRow | undefined> {
    const [row] = await this.db
      .update(labels)
      .set({ deletedAt: null, updatedAt: sql`now()`, version: sql`${labels.version} + 1` })
      .where(and(eq(labels.id, id), isNotNull(labels.deletedAt)))
      .returning();
    return row;
  }

  /** Все активные позиции для выгрузки, в порядке таблицы по умолчанию. */
  listActiveForExport(): Promise<LabelWithCounterparty[]> {
    return this.db
      .select(selection)
      .from(labels)
      .innerJoin(counterparties, eq(labels.counterpartyId, counterparties.id))
      .where(isNull(labels.deletedAt))
      .orderBy(
        sql`lower(${counterparties.name})`,
        sql`length(${labels.layoutNumber}) NULLS LAST`,
        asc(labels.layoutNumber),
        desc(labels.printedAt),
      );
  }
}
