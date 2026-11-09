import {
  ERROR_CODES,
  normalizeBarcode,
  type CreateLabelData,
  type Label,
  type ListLabelsQuery,
  type Paginated,
  type UpdateLabelData,
} from '@label-stock/shared';
import type { Database } from '../../db/client';
import { AppError, labelDeleted, notFound, versionConflict } from '../../shared/errors';
import { CounterpartiesRepository } from '../counterparties/counterparties.repository';
import { MovementsRepository } from '../movements/movements.repository';
import { toLabelDto } from './label.mapper';
import { toDuplicateError, type UniqueValues } from './label-uniqueness';
import { LabelsRepository } from './labels.repository';

const labelNotFound = () => notFound('Позиция не найдена');

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

  /** Начальный остаток сразу попадает в журнал как `created`, чтобы история сходилась с остатком. */
  async create(data: CreateLabelData): Promise<Label> {
    await this.assertCounterpartyExists(data.counterpartyId);
    const values = {
      counterpartyId: data.counterpartyId,
      layoutNumber: data.layoutNumber ?? null,
      barcode: data.barcode ?? null,
      printedAt: data.printedAt,
      quantity: data.quantity,
      comment: data.comment ?? null,
    };
    const labelId = await this.withDuplicateMapping(values, undefined, () =>
      this.db.transaction(async (tx) => {
        const label = await new LabelsRepository(tx).insert(values);
        if (label.quantity > 0) {
          await new MovementsRepository(tx).insert({
            labelId: label.id,
            delta: label.quantity,
            quantityAfter: label.quantity,
            reason: 'created',
            comment: null,
          });
        }
        return label.id;
      }),
    );
    return this.getById(labelId);
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
