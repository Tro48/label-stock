import { MOVEMENT_REASON_LABELS } from '@label-stock/shared';
import { EMPTY_VALUE, formatDateTime, formatDelta, formatQuantity } from '../../shared/format';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { useLabelMovements } from '../labels/api';

export function MovementHistory({ labelId }: { labelId: string }) {
  const { data, error, failureReason, isFetching } = useLabelMovements(labelId);

  const problem = error ?? failureReason;
  if (!data && problem) return <ErrorAlert error={problem} retrying={isFetching} />;
  if (!data) return <p>Загружаем историю…</p>;
  if (data.items.length === 0) return <p>Изменений остатка пока не было.</p>;

  return (
    <div className="table-scroll">
      <table className="table table--compact">
        <caption className="table__caption">
          История изменений остатка
          {data.total > data.items.length && ` (последние ${data.items.length} из ${data.total})`}
        </caption>
        <thead>
          <tr>
            <th scope="col">Дата</th>
            <th scope="col">Операция</th>
            <th scope="col" className="table__cell--numeric">
              Изменение
            </th>
            <th scope="col" className="table__cell--numeric">
              Остаток после
            </th>
            <th scope="col">Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((movement) => (
            <tr key={movement.id}>
              <td>
                <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time>
              </td>
              <td>{MOVEMENT_REASON_LABELS[movement.reason]}</td>
              <td className="table__cell--numeric">{formatDelta(movement.delta)}</td>
              <td className="table__cell--numeric">{formatQuantity(movement.quantityAfter)}</td>
              <td>{movement.comment ?? EMPTY_VALUE}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
