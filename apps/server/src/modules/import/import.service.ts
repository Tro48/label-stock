import { IMPORT_MAX_REPORTED_ERRORS, type ImportResult } from '@label-stock/shared';
import type { Database, Transaction } from '../../db/client';
import type { LabelRow } from '../../db/schema';
import { CounterpartiesRepository } from '../counterparties/counterparties.repository';
import { describeUniqueViolation } from '../labels/label-uniqueness';
import { LabelsRepository, type LabelPatch } from '../labels/labels.repository';
import { MovementsRepository } from '../movements/movements.repository';
import { parseCsvWithLines } from './csv-parse';
import { findDuplicatesInFile, toImportRows, type ImportRow } from './import-rows';

const IMPORT_COMMENT = 'Загрузка из CSV';

type RowOutcome = 'created' | 'updated' | 'unchanged';

/** Сигнал откатить транзакцию: пробный прогон или найдены ошибки. */
class RollbackSignal extends Error {}

/**
 * Загрузка CSV одной транзакцией: либо применяются все строки, либо ни одной.
 * Строка сопоставляется с активной позицией по номеру макета, без номера — по штрихкоду.
 * Пустые необязательные ячейки существующие значения не стирают. Остаток задаётся как
 * инвентаризация, поэтому каждое изменение видно в журнале.
 */
export class ImportService {
  constructor(private readonly db: Database) {}

  async run(csv: string, dryRun: boolean): Promise<ImportResult> {
    const { records, lines } = parseCsvWithLines(csv);
    const { rows, errors } = toImportRows(records, lines);
    errors.push(...findDuplicatesInFile(rows));
    const counts: Record<RowOutcome, number> = { created: 0, updated: 0, unchanged: 0 };

    try {
      await this.db.transaction(async (tx) => {
        const counterpartyIds = new Map<string, string>();
        for (const row of rows) {
          // Контрагент создаётся вне точки сохранения строки: откат строки не должен оставить
          // в кэше id, которого уже нет в БД.
          const counterpartyId = await resolveCounterparty(
            tx,
            row.counterpartyName,
            counterpartyIds,
          );
          try {
            counts[await tx.transaction((savepoint) => applyRow(savepoint, row, counterpartyId))]++;
          } catch (error) {
            const message = describeUniqueViolation(error);
            if (!message) throw error;
            errors.push({ line: row.line, message });
          }
        }
        if (dryRun || errors.length > 0) throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const sortedErrors = errors.sort((left, right) => left.line - right.line);
    return {
      applied: !dryRun && errors.length === 0,
      ...counts,
      errors: sortedErrors.slice(0, IMPORT_MAX_REPORTED_ERRORS),
      errorsTruncated: sortedErrors.length > IMPORT_MAX_REPORTED_ERRORS,
    };
  }
}

async function resolveCounterparty(
  tx: Transaction,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = name.toLocaleLowerCase('ru');
  const cached = cache.get(key);
  if (cached) return cached;
  const repository = new CounterpartiesRepository(tx);
  const counterparty =
    (await repository.insertIfAbsent(name)) ?? (await repository.findByName(name));
  if (!counterparty) throw new Error(`Контрагент «${name}» не создан и не найден`);
  cache.set(key, counterparty.id);
  return counterparty.id;
}

async function applyRow(
  tx: Transaction,
  row: ImportRow,
  counterpartyId: string,
): Promise<RowOutcome> {
  const labels = new LabelsRepository(tx);
  const movements = new MovementsRepository(tx);
  const matchField = row.layoutNumber ? 'layoutNumber' : row.barcode ? 'barcode' : undefined;
  const existing = matchField
    ? await labels.lockActiveByUniqueField(matchField, row[matchField]!)
    : undefined;

  if (!existing) {
    const label = await labels.insert({
      counterpartyId,
      layoutNumber: row.layoutNumber,
      barcode: row.barcode,
      printedAt: row.printedAt,
      quantity: row.quantity,
      comment: row.comment,
    });
    if (label.quantity > 0) {
      await movements.insert({
        labelId: label.id,
        delta: label.quantity,
        quantityAfter: label.quantity,
        reason: 'created',
        comment: IMPORT_COMMENT,
      });
    }
    return 'created';
  }

  const patch = changedFields(existing, row, counterpartyId);
  const fieldsChanged = Object.keys(patch).length > 0;
  if (fieldsChanged) await labels.updateWithVersion(existing.id, existing.version, patch);

  const delta = row.quantity - existing.quantity;
  if (delta !== 0) {
    await movements.setQuantity(existing.id, row.quantity);
    await movements.insert({
      labelId: existing.id,
      delta,
      quantityAfter: row.quantity,
      reason: 'inventory',
      comment: IMPORT_COMMENT,
    });
  }
  return fieldsChanged || delta !== 0 ? 'updated' : 'unchanged';
}

function changedFields(existing: LabelRow, row: ImportRow, counterpartyId: string): LabelPatch {
  const patch: LabelPatch = {};
  if (existing.counterpartyId !== counterpartyId) patch.counterpartyId = counterpartyId;
  if (existing.printedAt !== row.printedAt) patch.printedAt = row.printedAt;
  if (row.layoutNumber && existing.layoutNumber !== row.layoutNumber) {
    patch.layoutNumber = row.layoutNumber;
  }
  if (row.barcode && existing.barcode !== row.barcode) patch.barcode = row.barcode;
  if (row.comment && existing.comment !== row.comment) patch.comment = row.comment;
  return patch;
}
