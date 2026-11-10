import { useId } from 'react';
import { STOCK_REQUEST_TITLES, type StockRequestResult } from '@label-stock/shared';
import { EMPTY_VALUE, formatDateTime, formatQuantity } from '../../shared/format';

interface StockRequestSheetProps {
  request: StockRequestResult;
  className?: string;
}

/** Лист заявки. Количество берётся из журнала, то есть ровно то, что списал сервер. */
export function StockRequestSheet({ request, className }: StockRequestSheetProps) {
  const titleId = useId();
  const total = request.items.reduce((sum, item) => sum + Math.abs(item.movement.delta), 0);

  return (
    <article aria-labelledby={titleId} className={className}>
      <h3 id={titleId} className="request-sheet__title">
        {STOCK_REQUEST_TITLES[request.kind]} от{' '}
        <time dateTime={request.createdAt}>{formatDateTime(request.createdAt)}</time>
      </h3>
      {request.requestNumber && <p>По заявке 1С № {request.requestNumber}</p>}
      <table className="table table--compact request-sheet__table">
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">Контрагент</th>
            <th scope="col">№ макета</th>
            <th scope="col">Штрихкод</th>
            <th scope="col" className="table__cell--numeric">
              Количество, шт.
            </th>
          </tr>
        </thead>
        <tbody>
          {request.items.map(({ label, movement }, index) => (
            <tr key={label.id}>
              <td>{index + 1}</td>
              <td>{label.counterparty.name}</td>
              <td>{label.layoutNumber ?? EMPTY_VALUE}</td>
              <td>{label.barcode ?? EMPTY_VALUE}</td>
              <td className="table__cell--numeric">{formatQuantity(Math.abs(movement.delta))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              Итого
            </th>
            <td className="table__cell--numeric">{formatQuantity(total)}</td>
          </tr>
        </tfoot>
      </table>
    </article>
  );
}
