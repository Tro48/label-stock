import { useState } from 'react';
import type { MergeDuplicatesResult } from '@label-stock/shared';
import { errorMessage } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { useMergeDuplicateLayouts } from './api';

interface MergeDuplicatesDialogProps {
  onClose: () => void;
  onMerged: (result: MergeDuplicatesResult) => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
}

export function MergeDuplicatesDialog({
  onClose,
  onMerged,
  returnFocusTo,
}: MergeDuplicatesDialogProps) {
  const merge = useMergeDuplicateLayouts();
  const [error, setError] = useState<string>();

  const confirm = async () => {
    try {
      onMerged(await merge.mutateAsync());
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  return (
    <Dialog
      title="Объединить дубли по номеру макета?"
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <p>
        Список будет проверен на позиции с одинаковым номером макета. В каждой группе останется
        самая ранняя позиция: её остаток увеличится на остатки дублей, перенос попадёт в журнал, а
        сами дубли удалятся — их можно будет найти в разделе «Удалённые».
      </p>
      {error && (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      )}
      <footer className="form__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={confirm}
          disabled={merge.isPending}
        >
          {merge.isPending ? 'Объединяем…' : 'Объединить'}
        </button>
        <button type="button" className="button button--secondary" onClick={onClose} data-autofocus>
          Отмена
        </button>
      </footer>
    </Dialog>
  );
}
