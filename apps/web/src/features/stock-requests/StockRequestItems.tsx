import { useId, type MouseEvent } from 'react';
import type { Label, StockRequestKind } from '@label-stock/shared';
import { EMPTY_VALUE, formatQuantity } from '../../shared/format';
import { labelTitle } from '../labels/label-title';
import { usableQuantity, type RowErrors } from './stock-request-form';

interface StockRequestItemsProps {
  kind: StockRequestKind;
  labels: readonly Label[];
  amounts: Readonly<Record<string, string>>;
  errors: RowErrors;
  onAmountChange: (labelId: string, value: string) => void;
  onRemove: (labelId: string) => void;
}

/** Позиции заявки до проведения: при перемещении в каждой строке поле количества. */
export function StockRequestItems({
  kind,
  labels,
  amounts,
  errors,
  onAmountChange,
  onRemove,
}: StockRequestItemsProps) {
  const ids = useId();
  const isTransfer = kind === 'transfer';

  // Нажатая кнопка исчезает вместе со строкой: фокус переходит к «Убрать» в соседней строке.
  const removeRow = (event: MouseEvent<HTMLButtonElement>, labelId: string) => {
    const row = event.currentTarget.closest('tr');
    const neighbour = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector(
      'button',
    );
    onRemove(labelId);
    neighbour?.focus();
  };

  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="table__caption">Позиции заявки: {labels.length}</caption>
        <thead>
          <tr>
            <th scope="col">Контрагент</th>
            <th scope="col">№ макета</th>
            <th scope="col">Штрихкод</th>
            <th scope="col" className="table__cell--numeric">
              {isTransfer ? 'Доступно, шт.' : 'К утилизации, шт.'}
            </th>
            {isTransfer && <th scope="col">Забрать, шт.</th>}
            <th scope="col">
              <span className="visually-hidden">Действия</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => {
            const inputId = `${ids}-${label.id}`;
            const errorId = `${inputId}-error`;
            const error = errors[label.id];
            const title = labelTitle(label);
            return (
              <tr key={label.id}>
                <td>{label.counterparty.name}</td>
                <td>{label.layoutNumber ?? EMPTY_VALUE}</td>
                <td>{label.barcode ?? EMPTY_VALUE}</td>
                <td className="table__cell--numeric">
                  {formatQuantity(isTransfer ? usableQuantity(label) : label.obsoleteQuantity)}
                </td>
                {isTransfer && (
                  <td>
                    <label htmlFor={inputId} className="visually-hidden">
                      Забрать, шт.: {title}
                    </label>
                    <input
                      id={inputId}
                      className="input request-items__amount"
                      inputMode="numeric"
                      autoComplete="off"
                      value={amounts[label.id] ?? ''}
                      onChange={(event) => onAmountChange(label.id, event.target.value)}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errorId : undefined}
                    />
                  </td>
                )}
                <td>
                  <button
                    type="button"
                    className="button button--small button--ghost"
                    onClick={(event) => removeRow(event, label.id)}
                  >
                    Убрать<span className="visually-hidden">: {title}</span>
                  </button>
                  {/* Ошибка серверной проверки приходит и для утилизации, где поля нет. */}
                  {error && (
                    <p id={errorId} className="field__error">
                      {error}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
