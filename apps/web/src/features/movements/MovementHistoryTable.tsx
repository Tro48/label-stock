import { MOVEMENT_REASON_LABELS, type MovementListItem } from '@label-stock/shared';
import { EMPTY_VALUE, formatDateTime, formatDelta, formatQuantity } from '../../shared/format';

export function MovementHistoryTable({
  items,
  total,
}: {
  items: readonly MovementListItem[];
  total: number;
}) {
  return (
    <div className="table-scroll">
      <table role="table" className="table table--grid movement-history-table">
        <caption className="table__caption">История изменений: {total}</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">
              Дата
            </th>
            <th scope="col" role="columnheader">
              Контрагент
            </th>
            <th scope="col" role="columnheader">
              № макета
            </th>
            <th scope="col" role="columnheader">
              Штрихкод
            </th>
            <th scope="col" role="columnheader">
              Операция
            </th>
            <th scope="col" role="columnheader" className="table__cell--numeric">
              Изменение
            </th>
            <th scope="col" role="columnheader" className="table__cell--numeric">
              Остаток после
            </th>
            <th scope="col" role="columnheader">
              Комментарий
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {items.map((movement) => (
            <tr key={movement.id} role="row">
              <td role="cell">
                <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time>
              </td>
              <td role="cell">{movement.label.counterparty.name}</td>
              <td role="cell">{movement.label.layoutNumber ?? EMPTY_VALUE}</td>
              <td role="cell">{movement.label.barcode ?? EMPTY_VALUE}</td>
              <td role="cell">{MOVEMENT_REASON_LABELS[movement.reason]}</td>
              <td role="cell" className="table__cell--numeric">
                {formatDelta(movement.delta)}
              </td>
              <td role="cell" className="table__cell--numeric">
                {formatQuantity(movement.quantityAfter)}
              </td>
              <td role="cell">{movement.comment ?? EMPTY_VALUE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
