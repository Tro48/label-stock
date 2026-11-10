import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  STOCK_REQUEST_TITLES,
  type Label,
  type StockRequestKind,
  type StockRequestResult,
} from '@label-stock/shared';
import { ApiError, errorMessage } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { labelTitle } from '../labels/label-title';
import { useCreateStockRequest } from './api';
import { buildStockRequest, type RowErrors } from './stock-request-form';
import { StockRequestItems } from './StockRequestItems';
import { StockRequestSheet } from './StockRequestSheet';

interface StockRequestDialogProps {
  kind: StockRequestKind;
  labels: readonly Label[];
  onClose: () => void;
  /** Заявка проведена: эти позиции можно снять с выбора. */
  onCreated: (result: StockRequestResult) => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
}

/** Ошибка сервера с id позиции превращается в ошибку её строки. */
function rowErrorFromApi(error: unknown): RowErrors | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const labelId = error.details?.['labelId'];
  return typeof labelId === 'string' ? { [labelId]: error.message } : undefined;
}

export function StockRequestDialog({
  kind,
  labels,
  onClose,
  onCreated,
  returnFocusTo,
}: StockRequestDialogProps) {
  const ids = useId();
  // Утилизировать можно только то, что помечено старым макетом; остальное показываем отдельно.
  const [items, setItems] = useState(() =>
    kind === 'disposal' ? labels.filter((label) => label.obsoleteQuantity > 0) : [...labels],
  );
  const skipped = kind === 'disposal' ? labels.filter((label) => label.obsoleteQuantity === 0) : [];
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<RowErrors>({});
  const [formError, setFormError] = useState<string>();
  const [result, setResult] = useState<StockRequestResult>();
  const createRequest = useCreateStockRequest();
  const printButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Печать сразу после проведения: портал с листом к этому моменту уже в DOM.
  // Кнопка отправки исчезла вместе с формой, поэтому фокус переносим на «Печать».
  useEffect(() => {
    if (!result) return;
    window.print();
    printButtonRef.current?.focus();
  }, [result]);

  // Убрана последняя строка: кнопок в таблице не осталось, фокус уходит на «Отмена».
  useEffect(() => {
    if (items.length === 0) cancelButtonRef.current?.focus();
  }, [items.length]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const built = buildStockRequest(kind, items, amounts);
    if (!built.ok) {
      setRowErrors(built.errors);
      setFormError('Исправьте количество в отмеченных строках');
      return;
    }
    setRowErrors({});
    setFormError(undefined);
    try {
      const created = await createRequest.mutateAsync(built.input);
      setResult(created);
      onCreated(created);
    } catch (requestError) {
      const fromApi = rowErrorFromApi(requestError);
      setRowErrors(fromApi ?? {});
      setFormError(errorMessage(requestError));
    }
  };

  const removeItem = (labelId: string) =>
    setItems((current) => current.filter((label) => label.id !== labelId));

  return (
    <Dialog
      title={STOCK_REQUEST_TITLES[kind]}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
      size="wide"
    >
      {result ? (
        <>
          <p role="status">Остаток списан. Если печать не началась, нажмите «Печать».</p>
          <StockRequestSheet request={result} />
          {createPortal(
            <StockRequestSheet request={result} className="print-sheet" />,
            document.body,
          )}
          <footer className="form__actions">
            <button
              ref={printButtonRef}
              type="button"
              className="button button--primary"
              onClick={() => window.print()}
            >
              Печать
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Готово
            </button>
          </footer>
        </>
      ) : (
        <form noValidate onSubmit={submit} className="form" aria-describedby={`${ids}-hint`}>
          <p id={`${ids}-hint`}>
            {kind === 'transfer'
              ? 'Укажите, сколько забрать. Остаток спишется сразу, затем откроется печать.'
              : 'Старый макет спишется целиком, затем откроется печать.'}
          </p>
          {skipped.length > 0 && (
            <p className="alert alert--warning">
              Нечего утилизировать, в заявку не попали: {skipped.map(labelTitle).join(', ')}
            </p>
          )}
          {items.length === 0 ? (
            <p className="empty-state">В заявке нет позиций.</p>
          ) : (
            <StockRequestItems
              kind={kind}
              labels={items}
              amounts={amounts}
              errors={rowErrors}
              onAmountChange={(labelId, value) =>
                setAmounts((current) => ({ ...current, [labelId]: value }))
              }
              onRemove={removeItem}
            />
          )}
          {formError && (
            <p role="alert" className="alert alert--error">
              {formError}
            </p>
          )}
          <footer className="form__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={items.length === 0 || createRequest.isPending}
            >
              Списать и распечатать
            </button>
            <button
              ref={cancelButtonRef}
              type="button"
              className="button button--secondary"
              onClick={onClose}
            >
              Отмена
            </button>
          </footer>
        </form>
      )}
    </Dialog>
  );
}
