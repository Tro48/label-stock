import {
  ERROR_CODES,
  type CreateStockRequestData,
  type StockRequestResult,
} from '@label-stock/shared';
import type { Database, Transaction } from '../../db/client';
import type { MovementRow } from '../../db/schema';
import { AppError } from '../../shared/errors';
import { LabelsRepository } from '../labels/labels.repository';
import { toLabelDto } from '../labels/label.mapper';
import { MovementsRepository } from '../movements/movements.repository';
import { toMovementDto } from '../movements/movements.service';
import { assertActive, assertDeltaAllowed, labelNotFound } from '../movements/stock-rules';

type TransferItem = Extract<CreateStockRequestData, { kind: 'transfer' }>['items'][number];

interface RequestStep {
  labelId: string;
  run: (tx: Transaction) => Promise<MovementRow>;
}

/** Номер попадает в журнал каждой позиции: по истории видно, к какой заявке 1С ушла этикетка. */
const transferComment = (requestNumber: string | null | undefined) =>
  requestNumber ? `Заявка 1С № ${requestNumber}` : null;

const nothingToDispose = () => new AppError(422, ERROR_CODES.validation, 'Утилизировать нечего');

/** Добавляет к ошибке id позиции: в заявке их много, клиент подсвечивает нужную строку. */
function withLabelId(error: unknown, labelId: string): unknown {
  if (!(error instanceof AppError)) return error;
  return new AppError(error.statusCode, error.code, error.message, { ...error.details, labelId });
}

/** Заявки на перемещение и утилизацию: списание по всем позициям одной транзакцией. */
export class StockRequestsService {
  private readonly labels: LabelsRepository;

  constructor(private readonly db: Database) {
    this.labels = new LabelsRepository(db);
  }

  async create(request: CreateStockRequestData): Promise<StockRequestResult> {
    const requestNumber = request.kind === 'transfer' ? (request.requestNumber ?? null) : null;
    const steps: RequestStep[] =
      request.kind === 'transfer'
        ? request.items.map((item) => ({
            labelId: item.labelId,
            run: (tx) => this.transfer(tx, item, transferComment(requestNumber)),
          }))
        : request.items.map(({ labelId }) => ({ labelId, run: (tx) => this.dispose(tx, labelId) }));
    // Блокировки берутся в одном порядке, чтобы встречные заявки не взаимоблокировались.
    // Обычное сравнение строк, а не localeCompare: порядок не должен зависеть от локали процесса.
    steps.sort((a, b) => (a.labelId < b.labelId ? -1 : a.labelId > b.labelId ? 1 : 0));

    const movementsByLabel = await this.db.transaction(async (tx) => {
      const result = new Map<string, MovementRow>();
      for (const step of steps) {
        try {
          result.set(step.labelId, await step.run(tx));
        } catch (error) {
          throw withLabelId(error, step.labelId);
        }
      }
      return result;
    });

    const labelsById = new Map(
      (await this.labels.findByIds([...movementsByLabel.keys()])).map((row) => [row.label.id, row]),
    );
    return {
      kind: request.kind,
      createdAt: new Date().toISOString(),
      requestNumber,
      items: request.items.map(({ labelId }) => {
        const label = labelsById.get(labelId);
        if (!label) throw labelNotFound();
        return {
          label: toLabelDto(label),
          movement: toMovementDto(movementsByLabel.get(labelId)!),
        };
      }),
    };
  }

  private async transfer(
    tx: Transaction,
    { labelId, quantity }: TransferItem,
    comment: string | null,
  ) {
    const movements = new MovementsRepository(tx);
    assertDeltaAllowed(await movements.lockLabel(labelId), -quantity, true);
    const updated = await movements.applyDelta(labelId, -quantity, { usableOnly: true });
    if (!updated) throw new Error('UPDATE отклонён под блокировкой строки');
    return movements.insert({
      labelId,
      delta: -quantity,
      quantityAfter: updated.quantity,
      reason: 'transfer',
      comment,
    });
  }

  private async dispose(tx: Transaction, labelId: string) {
    const movements = new MovementsRepository(tx);
    const locked = await movements.lockLabel(labelId);
    assertActive(locked);
    if (locked.obsoleteQuantity === 0) throw nothingToDispose();
    const updated = await movements.disposeObsolete(labelId);
    return movements.insert({
      labelId,
      delta: -locked.obsoleteQuantity,
      quantityAfter: updated.quantity,
      reason: 'disposal',
      comment: null,
    });
  }
}
