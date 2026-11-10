import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { MOVEMENT_REASONS } from '@label-stock/shared';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const counterparties = pgTable(
  'counterparties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    externalId: text('external_id').unique(),
    ...timestamps,
  },
  (table) => [
    // «Ромашка» и «ромашка » — один контрагент.
    uniqueIndex('counterparties_name_normalized_uq').on(sql`lower(trim(${table.name}))`),
  ],
);

export const labels = pgTable(
  'labels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    counterpartyId: uuid('counterparty_id')
      .notNull()
      .references(() => counterparties.id),
    // Строка, а не число: ведущие нули значимы, `00123` и `123` — разные макеты.
    layoutNumber: text('layout_number'),
    barcode: text('barcode'),
    // date без времени, чтобы день печати не «съезжал» из-за часовых поясов.
    printedAt: date('printed_at', { mode: 'string' }).notNull(),
    quantity: integer('quantity').notNull(),
    // Часть остатка со старым макетом. Отдельным полем, а не отдельной позицией: штрихкод тот же,
    // и сканер должен находить одну позицию.
    obsoleteQuantity: integer('obsolete_quantity').notNull().default(0),
    comment: text('comment'),
    version: integer('version').notNull().default(1),
    externalId: text('external_id').unique(),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check('labels_layout_number_digits_chk', sql`${table.layoutNumber} ~ '^[0-9]+$'`),
    check('labels_quantity_non_negative_chk', sql`${table.quantity} >= 0`),
    check(
      'labels_obsolete_quantity_range_chk',
      sql`${table.obsoleteQuantity} BETWEEN 0 AND ${table.quantity}`,
    ),
    // Уникальность только среди активных: после мягкого удаления номер и штрихкод освобождаются.
    uniqueIndex('labels_layout_number_active_uq')
      .on(table.layoutNumber)
      .where(sql`${table.deletedAt} IS NULL AND ${table.layoutNumber} IS NOT NULL`),
    uniqueIndex('labels_barcode_active_uq')
      .on(table.barcode)
      .where(sql`${table.deletedAt} IS NULL AND ${table.barcode} IS NOT NULL`),
    index('labels_counterparty_id_idx').on(table.counterpartyId),
    index('labels_updated_at_idx').on(table.updatedAt),
  ],
);

export const movementReason = pgEnum('movement_reason', MOVEMENT_REASONS);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id),
    delta: integer('delta').notNull(),
    quantityAfter: integer('quantity_after').notNull(),
    reason: movementReason('reason').notNull(),
    comment: text('comment'),
    // clock_timestamp(), а не now(): now() — время начала транзакции, и при параллельных
    // операциях история шла бы не в порядке применения. Вставка идёт под блокировкой строки
    // позиции, поэтому время вставки монотонно в пределах одной позиции.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    check('stock_movements_delta_non_zero_chk', sql`${table.delta} <> 0`),
    index('stock_movements_label_id_created_at_idx').on(table.labelId, table.createdAt),
    index('stock_movements_created_at_idx').on(table.createdAt),
  ],
);

export type CounterpartyRow = typeof counterparties.$inferSelect;
export type LabelRow = typeof labels.$inferSelect;
export type MovementRow = typeof stockMovements.$inferSelect;
