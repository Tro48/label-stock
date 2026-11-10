import { useEffect, useRef, type ReactNode } from 'react';
import type { Label, LabelSortField } from '@label-stock/shared';
import { EMPTY_VALUE, formatDate } from '../../shared/format';
import type { LabelSelection } from '../stock-requests/use-label-selection';
import { labelTitle } from './label-title';
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
    render: (label) => (
      <QuantityText quantity={label.quantity} obsoleteQuantity={label.obsoleteQuantity} />
    ),
  },
];

interface LabelsTableProps {
  caption: string;
  labels: readonly Label[];
  sortState: SortState;
  onSortChange: (state: SortState) => void;
  renderActions: (label: Label) => ReactNode;
  /** Есть — в первом столбце флажки для сборки заявки. */
  selection?: LabelSelection | undefined;
}

export function LabelsTable({
  caption,
  labels,
  sortState,
  onSortChange,
  renderActions,
  selection,
}: LabelsTableProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedOnPage = selection
    ? labels.filter((label) => selection.isSelected(label.id)).length
    : 0;
  const allOnPageSelected = labels.length > 0 && selectedOnPage === labels.length;

  // indeterminate задаётся только из DOM: скринридер слышит «частично отмечен».
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedOnPage > 0 && !allOnPageSelected;
    }
  }, [selectedOnPage, allOnPageSelected]);

  const toggleSort = (field: LabelSortField) => {
    const order = sortState.sort === field && sortState.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ sort: field, order });
  };

  return (
    <div className="table-scroll">
      {/* Раскладка гридом, а Safari у таблицы с display: grid теряет табличные роли —
          поэтому они продублированы явно. */}
      <table
        role="table"
        className={`table table--grid labels-table${selection ? ' labels-table--selectable' : ''}`}
      >
        <caption className="table__caption">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {selection && (
              <th scope="col" role="columnheader">
                <label className="checkbox">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={(event) => selection.toggle(labels, event.target.checked)}
                  />
                  <span className="visually-hidden">Выбрать все на странице</span>
                </label>
              </th>
            )}
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
                  role="columnheader"
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
            <th scope="col" role="columnheader">
              Действия
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {labels.map((label) => (
            <tr key={label.id} role="row">
              {selection && (
                <td role="cell">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={selection.isSelected(label.id)}
                      onChange={(event) => selection.toggle([label], event.target.checked)}
                    />
                    <span className="visually-hidden">Выбрать: {labelTitle(label)}</span>
                  </label>
                </td>
              )}
              {COLUMNS.map((column) => (
                <td
                  key={column.field}
                  role="cell"
                  className={column.numeric ? 'table__cell--numeric' : undefined}
                >
                  {column.render(label)}
                </td>
              ))}
              <td role="cell" className="table__actions">
                {renderActions(label)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
