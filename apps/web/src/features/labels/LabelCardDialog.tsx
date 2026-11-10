import type { Label, MovementResult } from '@label-stock/shared';
import { EMPTY_VALUE, formatDate, formatQuantity } from '../../shared/format';
import { Dialog } from '../../shared/ui/Dialog';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { Tabs } from '../../shared/ui/Tabs';
import { MovementHistory } from '../movements/MovementHistory';
import { StockOperationForm } from '../movements/StockOperationForm';
import type { StockOperation } from '../movements/stock-operation';
import { useLabel } from './api';
import { QuantityText } from './QuantityText';

interface LabelCardDialogProps {
  labelId: string;
  initialLabel?: Label | undefined;
  onClose: () => void;
  onOperationDone: (operation: StockOperation, result: MovementResult) => void;
  onEdit: (label: Label) => void;
  onDispose: (label: Label) => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
}

export function LabelCardDialog({
  labelId,
  initialLabel,
  onClose,
  onOperationDone,
  onEdit,
  onDispose,
  returnFocusTo,
}: LabelCardDialogProps) {
  const { data: label, error, failureReason, isFetching } = useLabel(labelId, initialLabel);

  return (
    <Dialog title="Карточка позиции" onClose={onClose} returnFocusTo={returnFocusTo} size="wide">
      {!label ? (
        (error ?? failureReason) ? (
          <ErrorAlert error={error ?? failureReason} retrying={isFetching} />
        ) : (
          <p>Загружаем…</p>
        )
      ) : (
        <>
          <dl className="card-summary">
            <div>
              <dt>Контрагент</dt>
              <dd>{label.counterparty.name}</dd>
            </div>
            <div>
              <dt>№ макета</dt>
              <dd>{label.layoutNumber ?? EMPTY_VALUE}</dd>
            </div>
            <div>
              <dt>Штрихкод</dt>
              <dd>{label.barcode ?? EMPTY_VALUE}</dd>
            </div>
            <div>
              <dt>Дата печати</dt>
              <dd>{formatDate(label.printedAt)}</dd>
            </div>
            {label.comment && (
              <div>
                <dt>Комментарий</dt>
                <dd>{label.comment}</dd>
              </div>
            )}
            <div className="card-summary__quantity">
              <dt>Остаток, шт.</dt>
              <dd>
                <QuantityText quantity={label.quantity} obsoleteQuantity={label.obsoleteQuantity} />
              </dd>
            </div>
          </dl>

          {!label.deletedAt && label.obsoleteQuantity > 0 && (
            <div className="alert alert--warning">
              <p>
                Макет менялся: {formatQuantity(label.obsoleteQuantity)} шт. со старым макетом нужно
                утилизировать. Списать и переместить их нельзя.
              </p>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => onDispose(label)}
              >
                Заявка на утилизацию
              </button>
            </div>
          )}

          {label.deletedAt ? (
            <p className="alert">Позиция удалена. Восстановите её в разделе «Удалённые».</p>
          ) : (
            <Tabs
              label="Разделы карточки"
              items={[
                {
                  id: 'stock',
                  label: 'Остаток',
                  content: <StockOperationForm label={label} onDone={onOperationDone} />,
                },
                {
                  id: 'history',
                  label: 'История',
                  content: <MovementHistory labelId={label.id} />,
                },
              ]}
            />
          )}

          {!label.deletedAt && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => onEdit(label)}
            >
              Редактировать позицию
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}
