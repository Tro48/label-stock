import { useId } from 'react';
import type { Label } from '@label-stock/shared';
import { errorMessage } from '../../shared/api/client';
import { useNotifications } from '../../shared/ui/notifications';
import { interpretServerError } from './server-errors';
import { useRestoreLabel } from './api';
import { LabelsList } from './LabelsList';
import { useLabelsQueryState } from './use-labels-query-state';

export function DeletedScreen() {
  const headingId = useId();
  const query = useLabelsQueryState(true);
  const restoreLabel = useRestoreLabel();
  const { notify } = useNotifications();

  const restore = (label: Label) =>
    restoreLabel.mutate(label.id, {
      onSuccess: () => notify('Позиция восстановлена'),
      onError: (error) => {
        // 409: номер макета или штрихкод уже занят активной позицией — сервер объясняет чем.
        const outcome = interpretServerError(error);
        notify(Object.values(outcome.fieldErrors)[0] ?? outcome.formError ?? errorMessage(error));
      },
    });

  return (
    <section aria-labelledby={headingId} className="screen">
      <h2 id={headingId}>Удалённые позиции</h2>
      <LabelsList
        caption="Удалённые позиции"
        params={query.params}
        sortState={query.sortState}
        onSortChange={query.setSortState}
        onPageChange={query.setPage}
        emptyState="Удалённых позиций нет."
        renderActions={(label) => (
          <button
            type="button"
            className="button button--small button--secondary"
            onClick={() => restore(label)}
            disabled={restoreLabel.isPending}
          >
            Восстановить
            <span className="visually-hidden">
              : {label.layoutNumber ?? label.barcode ?? label.counterparty.name}
            </span>
          </button>
        )}
      />
    </section>
  );
}
