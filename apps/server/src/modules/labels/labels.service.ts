import {
  ERROR_CODES,
  normalizeBarcode,
  type CreateLabelData,
  type CreateLabelResult,
  type Label,
  type ListLabelsQuery,
  type MergeDuplicatesResult,
  type Paginated,
  type UpdateLabelData,
} from '@label-stock/shared';
import type { Database } from '../../db/client';
import type { LabelRow } from '../../db/schema';
import {
  AppError,
  labelDeleted,
  notFound,
  uniqueViolationConstraint,
  versionConflict,
} from '../../shared/errors';
import { CounterpartiesRepository } from '../counterparties/counterparties.repository';
import { MovementsRepository, type NewMovementValues } from '../movements/movements.repository';
import { toMovementDto } from '../movements/movements.service';
import { assertDeltaAllowed } from '../movements/stock-rules';
import { toLabelDto } from './label.mapper';
import { toDuplicateError, type UniqueValues } from './label-uniqueness';
import { LabelsRepository, type NewLabelValues } from './labels.repository';

const labelNotFound = () => notFound('Позиция не найдена');

const LAYOUT_NUMBER_UNIQUE_INDEX = 'labels_layout_number_active_uq';
const MERGE_ON_CREATE_COMMENT = 'Совпал номер макета';
const DEDUPE_COMMENT = 'Объединение дублей по номеру макета';

export class LabelsService {
  private readonly labels: LabelsRepository;
  private readonly counterparties: CounterpartiesRepository;

  constructor(private readonly db: Database) {
    this.labels = new LabelsRepository(db);
    this.counterparties = new CounterpartiesRepository(db);
  }

  async list(query: ListLabelsQuery): Promise<Paginated<Label>> {
    const { rows, total } = await this.labels.list(query);
    return { items: rows.map(toLabelDto), total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string): Promise<Label> {
    const row = await this.labels.findById(id);
    if (!row) throw labelNotFound();
    return toLabelDto(row);
  }

  async getByBarcode(rawCode: string): Promise<Label> {
    const barcode = normalizeBarcode(rawCode);
    const row = barcode ? await this.labels.findActiveByBarcode(barcode) : undefined;
    if (!row) throw notFound(`Штрихкод ${barcode || rawCode} не найден`);
    return toLabelDto(row);
  }

  /**
   * Создаёт позицию; начальный остаток сразу попадает в журнал как `created`, чтобы история
   * сходилась с остатком. Если номер макета уже занят, позиция не создаётся — остаток формы
   * добавляется к занявшей позиции (см. mergeIntoLayoutDuplicate).
   */
  async create(data: CreateLabelData): Promise<CreateLabelResult> {
    await this.assertCounterpartyExists(data.counterpartyId);
    const values: NewLabelValues = {
      counterpartyId: data.counterpartyId,
      layoutNumber: data.layoutNumber ?? null,
      barcode: data.barcode ?? null,
      printedAt: data.printedAt,
      quantity: data.quantity,
      comment: data.comment ?? null,
    };
    try {
      return await this.insertNew(values);
    } catch (error) {
      if (uniqueViolationConstraint(error) !== LAYOUT_NUMBER_UNIQUE_INDEX || !values.layoutNumber) {
        throw (await toDuplicateError(error, this.labels, values, undefined)) ?? error;
      }
      return this.mergeIntoLayoutDuplicate(values);
    }
  }

  async update(id: string, { version, ...patch }: UpdateLabelData): Promise<Label> {
    if (patch.counterpartyId) await this.assertCounterpartyExists(patch.counterpartyId);
    const updated = await this.withDuplicateMapping(patch, id, () =>
      this.labels.updateWithVersion(id, version, patch),
    );
    if (!updated) {
      const current = await this.labels.findById(id);
      if (!current) throw labelNotFound();
      if (current.label.deletedAt) throw labelDeleted();
      throw versionConflict();
    }
    return this.getById(id);
  }

  /** Повторное удаление уже удалённой позиции не ошибка. */
  async softDelete(id: string): Promise<void> {
    const deleted = await this.labels.softDelete(id);
    if (!deleted && !(await this.labels.findById(id))) throw labelNotFound();
  }

  async restore(id: string): Promise<Label> {
    const current = await this.labels.findById(id);
    if (!current) throw labelNotFound();
    if (current.label.deletedAt) {
      await this.withDuplicateMapping(current.label, id, () => this.labels.restore(id));
    }
    return this.getById(id);
  }

  /**
   * Ищет активные позиции с одинаковым номером макета и сводит каждую группу к одной:
   * остаток и «старый макет» переносятся на самую раннюю позицию группы, остальные удаляются.
   */
  async mergeDuplicatesByLayout(): Promise<MergeDuplicatesResult> {
    return this.db.transaction(async (tx) => {
      const labels = new LabelsRepository(tx);
      const numbers = await labels.findDuplicateLayoutNumbers();
      if (numbers.length === 0) return { groups: 0, merged: 0, movedQuantity: 0 };

      const movements = new MovementsRepository(tx);
      const groups = groupByLayoutNumber(await labels.lockActiveByLayoutNumbers(numbers));
      let merged = 0;
      let movedQuantity = 0;
      for (const group of groups) {
        const [keeper, ...duplicates] = group;
        for (const duplicate of duplicates) {
          if (duplicate.quantity > 0 || duplicate.obsoleteQuantity > 0) {
            const updated = await this.absorbDuplicateStock(movements, keeper.id, duplicate);
            if (duplicate.quantity > 0) {
              await movements.insert({
                labelId: keeper.id,
                delta: duplicate.quantity,
                quantityAfter: updated.quantity,
                reason: 'correction',
                comment: DEDUPE_COMMENT,
              });
              movedQuantity += duplicate.quantity;
            }
          }
          await labels.softDelete(duplicate.id);
          merged += 1;
        }
      }
      return { groups: groups.length, merged, movedQuantity };
    });
  }

  /** Переносит остаток дубля на оставшуюся позицию; повторяет под блокировкой, если сумма отклонена. */
  private async absorbDuplicateStock(
    movements: MovementsRepository,
    keeperId: string,
    duplicate: LabelRow,
  ): Promise<LabelRow> {
    let updated = await movements.absorbStock(
      keeperId,
      duplicate.quantity,
      duplicate.obsoleteQuantity,
    );
    if (!updated) {
      assertDeltaAllowed(await movements.lockLabel(keeperId), duplicate.quantity, false);
      updated = await movements.absorbStock(
        keeperId,
        duplicate.quantity,
        duplicate.obsoleteQuantity,
      );
      if (!updated) throw new Error('UPDATE отклонён под блокировкой строки');
    }
    return updated;
  }

  private async insertNew(values: NewLabelValues): Promise<CreateLabelResult> {
    const { labelId, movement } = await this.db.transaction(async (tx) => {
      const label = await new LabelsRepository(tx).insert(values);
      const movement = await this.recordInitialStock(
        new MovementsRepository(tx),
        label.id,
        label.quantity,
      );
      return { labelId: label.id, movement };
    });
    return {
      label: await this.getById(labelId),
      merged: false,
      movement: movement && toMovementDto(movement),
    };
  }

  /** Добавляет остаток формы к позиции, занявшей номер макета. Позиция могла быть удалена в момент между попытками — тогда создаём новую. */
  private async mergeIntoLayoutDuplicate(values: NewLabelValues): Promise<CreateLabelResult> {
    const merged = await this.db.transaction(async (tx) => {
      const labels = new LabelsRepository(tx);
      const existing = values.layoutNumber
        ? await labels.lockActiveByUniqueField('layoutNumber', values.layoutNumber)
        : undefined;
      if (!existing) return undefined;
      const movements = new MovementsRepository(tx);
      let updated = await movements.applyDelta(existing.id, values.quantity);
      if (!updated) {
        assertDeltaAllowed(await movements.lockLabel(existing.id), values.quantity, false);
        updated = await movements.applyDelta(existing.id, values.quantity);
        if (!updated) throw new Error('UPDATE отклонён под блокировкой строки');
      }
      const movement = await this.recordInitialStock(movements, existing.id, values.quantity, {
        reason: 'print',
        comment: MERGE_ON_CREATE_COMMENT,
        quantityAfter: updated.quantity,
      });
      return { labelId: existing.id, movement };
    });
    if (!merged) return this.insertNew(values);
    return {
      label: await this.getById(merged.labelId),
      merged: true,
      movement: merged.movement && toMovementDto(merged.movement),
    };
  }

  /** Начальный остаток позиции или добавленный при слиянии — одна запись в журнале. */
  private async recordInitialStock(
    movements: MovementsRepository,
    labelId: string,
    quantity: number,
    overrides: {
      reason?: NewMovementValues['reason'];
      comment?: string | null;
      quantityAfter?: number;
    } = {},
  ): Promise<Awaited<ReturnType<MovementsRepository['insert']>> | null> {
    if (quantity <= 0) return null;
    return movements.insert({
      labelId,
      delta: quantity,
      quantityAfter: overrides.quantityAfter ?? quantity,
      reason: overrides.reason ?? 'created',
      comment: overrides.comment ?? null,
    });
  }

  private async assertCounterpartyExists(counterpartyId: string): Promise<void> {
    if (await this.counterparties.findById(counterpartyId)) return;
    throw new AppError(400, ERROR_CODES.validation, 'Проверьте заполнение полей', {
      counterpartyId: 'Контрагент не найден',
    });
  }

  private async withDuplicateMapping<Result>(
    values: UniqueValues,
    excludeId: string | undefined,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      throw (await toDuplicateError(error, this.labels, values, excludeId)) ?? error;
    }
  }
}

/** Группирует заблокированные строки по номеру макета; строки в группе от старых к новым. */
function groupByLayoutNumber(rows: LabelRow[]): [LabelRow, ...LabelRow[]][] {
  const groups = new Map<string, LabelRow[]>();
  for (const row of rows) {
    const group = groups.get(row.layoutNumber!);
    if (group) group.push(row);
    else groups.set(row.layoutNumber!, [row]);
  }
  return [...groups.values()].filter((group) => group.length > 1) as [LabelRow, ...LabelRow[]][];
}
