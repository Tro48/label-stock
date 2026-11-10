import { useEffect, type ReactNode } from 'react';
import type { Label, ListLabelsParams } from '@label-stock/shared';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { Pagination } from '../../shared/ui/Pagination';
import { useLabels } from './api';
import type { LabelSelection } from '../stock-requests/use-label-selection';
import { LabelsTable, type SortState } from './LabelsTable';

interface LabelsListProps {
  caption: string;
  params: ListLabelsParams;
  sortState: SortState;
  onSortChange: (state: SortState) => void;
  onPageChange: (page: number) => void;
  emptyState: ReactNode;
  renderActions: (label: Label) => ReactNode;
  selection?: LabelSelection | undefined;
}

/** Таблица с состояниями загрузки, ошибки и пустого списка. */
export function LabelsList({
  caption,
  params,
  sortState,
  onSortChange,
  onPageChange,
  emptyState,
  renderActions,
  selection,
}: LabelsListProps) {
  const { data, error, failureReason, isPending, isFetching } = useLabels(params);
  const refreshSelection = selection?.refresh;

  useEffect(() => {
    if (data) refreshSelection?.(data.items);
  }, [data, refreshSelection]);

  return (
    <>
      <ErrorAlert error={error ?? failureReason} retrying={isFetching} />
      {isPending && !failureReason && <p>Загружаем…</p>}
      {data &&
        (data.total === 0 ? (
          <p className="empty-state">{emptyState}</p>
        ) : (
          <>
            <LabelsTable
              caption={`${caption}: ${data.total}`}
              labels={data.items}
              sortState={sortState}
              onSortChange={onSortChange}
              renderActions={renderActions}
              selection={selection}
            />
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={onPageChange}
            />
          </>
        ))}
    </>
  );
}
