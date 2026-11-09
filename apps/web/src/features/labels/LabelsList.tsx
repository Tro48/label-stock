import type { ReactNode } from 'react';
import type { Label, ListLabelsParams } from '@label-stock/shared';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { Pagination } from '../../shared/ui/Pagination';
import { useLabels } from './api';
import { LabelsTable, type SortState } from './LabelsTable';

interface LabelsListProps {
  caption: string;
  params: ListLabelsParams;
  sortState: SortState;
  onSortChange: (state: SortState) => void;
  onPageChange: (page: number) => void;
  emptyState: ReactNode;
  renderActions: (label: Label) => ReactNode;
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
}: LabelsListProps) {
  const { data, error, failureReason, isPending, isFetching } = useLabels(params);

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
