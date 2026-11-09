import type { ReactNode } from 'react';
import type { Label, LabelSortField } from '@label-stock/shared';
import { EMPTY_VALUE, formatDate } from '../../shared/format';
import { QuantityText } from './QuantityText';

export interface SortState {
  sort: LabelSortField;
  order: 'asc' | 'desc';
}

interface Column {
  field: LabelSortField;
  title: string;
  numeric?: boolean;
  render: (label: Label) => ReactNode;
}

const COLUMNS: readonly Column[] = [
  { field: 'counterparty', title: 'Контрагент', render: (label) => label.counterparty.name },
  {
    field: 'layoutNumber',
    title: '№ макета',
    render: (label) => label.layoutNumber ?? EMPTY_VALUE,
  },
  { field: 'barcode', title: 'Штрихкод', render: (label) => label.barcode ?? EMPTY_VALUE },
  { field: 'printedAt', title: 'Печать', render: (label) => formatDate(label.printedAt) },
  {
    field: 'quantity',
    title: 'Остаток',
    numeric: true,
    render: (label) => <QuantityText quantity={label.quantity} />,
  },
];

interface LabelsTableProps {
  caption: string;
  labels: readonly Label[];
  sortState: SortState;
  onSortChange: (state: SortState) => void;
  renderActions: (label: Label) => ReactNode;
}

export function LabelsTable({
  caption,
  labels,
  sortState,
  onSortChange,
  renderActions,
}: LabelsTableProps) {
  const toggleSort = (field: LabelSortField) => {
    const order = sortState.sort === field && sortState.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ sort: field, order });
  };

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className="table__caption">{caption}</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => {
              const active = sortState.sort === column.field;
              const ariaSort = active
                ? sortState.order === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined;
              return (
                <th
                  key={column.field}
                  scope="col"
                  aria-sort={ariaSort}
                  className={column.numeric ? 'table__cell--numeric' : undefined}
                >
                  <button
                    type="button"
                    className="table__sort"
                    onClick={() => toggleSort(column.field)}
                  >
                    {column.title}
                    <span aria-hidden="true" className="table__sort-icon">
                      {active ? (sortState.order === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
            <th scope="col">Действия</th>
          </tr>
        </thead>
        <tbody>
          {labels.map((label) => (
            <tr key={label.id}>
              {COLUMNS.map((column) => (
                <td
                  key={column.field}
                  className={column.numeric ? 'table__cell--numeric' : undefined}
                >
                  {column.render(label)}
                </td>
              ))}
              <td className="table__actions">{renderActions(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
