import { useState } from 'react';
import type { Label } from '@label-stock/shared';
import { errorMessage } from '../../shared/api/client';
import { EMPTY_VALUE } from '../../shared/format';
import { Dialog } from '../../shared/ui/Dialog';
import { useDeleteLabel } from './api';

interface DeleteLabelDialogProps {
  label: Label;
  onClose: () => void;
  onDeleted: (label: Label) => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
}

export function DeleteLabelDialog({
  label,
  onClose,
  onDeleted,
  returnFocusTo,
}: DeleteLabelDialogProps) {
  const deleteLabel = useDeleteLabel();
  const [error, setError] = useState<string>();

  const confirm = async () => {
    try {
      await deleteLabel.mutateAsync(label.id);
      onDeleted(label);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return (
    <Dialog title="Удалить позицию?" onClose={onClose} returnFocusTo={returnFocusTo}>
      <dl className="card-summary">
        <div>
          <dt>Контрагент</dt>
          <dd>{label.counterparty.name}</dd>
        </div>
        <div>
          <dt>№ макета</dt>
          <dd>{label.layoutNumber ?? EMPTY_VALUE}</dd>
        </div>
      </dl>
      <p>Позицию можно будет восстановить в разделе «Удалённые».</p>
      {error && (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      )}
      <footer className="form__actions">
        <button
          type="button"
          className="button button--danger"
          onClick={confirm}
          disabled={deleteLabel.isPending}
        >
          Удалить
        </button>
        <button type="button" className="button button--secondary" onClick={onClose} data-autofocus>
          Отмена
        </button>
      </footer>
    </Dialog>
  );
}
