import { useCallback, useId, useRef, useState } from 'react';
import type {
  CreateLabelResult,
  Label,
  MergeDuplicatesResult,
  MovementResult,
  StockRequestKind,
  StockRequestResult,
} from '@label-stock/shared';
import { ApiError, errorMessage } from '../../shared/api/client';
import { formatQuantity } from '../../shared/format';
import { useNotifications } from '../../shared/ui/notifications';
import { describeOperationResult, type StockOperation } from '../movements/stock-operation';
import { ScanStatus, type ScanState } from '../scanner/ScanStatus';
import { useBarcodeScanner } from '../scanner/useBarcodeScanner';
import { StockRequestBar } from '../stock-requests/StockRequestBar';
import { StockRequestDialog } from '../stock-requests/StockRequestDialog';
import { useLabelSelection } from '../stock-requests/use-label-selection';
import { findLabelByBarcode, useRestoreLabel } from './api';
import { DeleteLabelDialog } from './DeleteLabelDialog';
import { LabelCardDialog } from './LabelCardDialog';
import { LabelFormDialog, type LabelFormMode } from './LabelFormDialog';
import { labelTitle } from './label-title';
import { LabelsList } from './LabelsList';
import { LabelsToolbar } from './LabelsToolbar';
import { MergeDuplicatesDialog } from './MergeDuplicatesDialog';
import { useLabelsQueryState } from './use-labels-query-state';

type Modal =
  | { kind: 'card'; labelId: string; initialLabel?: Label | undefined }
  | { kind: 'form'; mode: LabelFormMode }
  | { kind: 'delete'; label: Label }
  | { kind: 'merge-duplicates' }
  | { kind: 'request'; requestKind: StockRequestKind; labels: readonly Label[] };

/** Текст после слияния при создании: номер макета был занят, остаток ушёл к существующей позиции. */
function describeMergedResult(result: CreateLabelResult): string {
  const { label, movement } = result;
  const remainder = `остаток ${formatQuantity(label.quantity)} шт.`;
  if (!movement) return `Позиция с номером макета ${label.layoutNumber} уже есть, ${remainder}`;
  return `Добавлено ${formatQuantity(movement.delta)} шт. к позиции с номером макета ${label.layoutNumber}, ${remainder}`;
}

export function StockScreen() {
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearch = useCallback(() => searchRef.current, []);
  const [modal, setModal] = useState<Modal | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ kind: 'idle' });
  // После скана и после операции фокус уходит в поиск: можно сразу сканировать следующую этикетку.
  const returnToSearch = useRef(false);
  const returnFocusAfterCard = useCallback(() => {
    const toSearch = returnToSearch.current;
    returnToSearch.current = false;
    return toSearch ? searchRef.current : undefined;
  }, []);
  const query = useLabelsQueryState(false);
  const { notify } = useNotifications();
  const restoreLabel = useRestoreLabel();
  const selection = useLabelSelection();

  const closeModal = useCallback(() => setModal(null), []);

  // Сканер вводит символы и в строку поиска, если фокус там: очищаем её перед поиском по коду.
  const handleScan = async (barcode: string) => {
    query.setSearch('');
    setScanState({ kind: 'searching', barcode });
    try {
      const label = await findLabelByBarcode(barcode);
      setScanState({ kind: 'found', barcode });
      returnToSearch.current = true;
      setModal({ kind: 'card', labelId: label.id, initialLabel: label });
    } catch (error) {
      setScanState(
        error instanceof ApiError && error.status === 404
          ? { kind: 'notFound', barcode }
          : { kind: 'error', barcode, message: errorMessage(error) },
      );
    }
  };

  useBarcodeScanner({ onScan: handleScan, enabled: modal === null });

  const openCard = (label: Label) => {
    returnToSearch.current = false;
    setModal({ kind: 'card', labelId: label.id, initialLabel: label });
  };

  const handleOperationDone = (operation: StockOperation, result: MovementResult) => {
    returnToSearch.current = true;
    setModal(null);
    notify(describeOperationResult(operation, result));
  };

  const handleDeleted = (label: Label) => {
    setModal(null);
    notify('Позиция удалена', {
      label: 'Отменить',
      onClick: () =>
        restoreLabel.mutate(label.id, {
          onSuccess: () => notify('Позиция восстановлена'),
          onError: (error) => notify(errorMessage(error)),
        }),
    });
  };

  const handleRequestCreated = (result: StockRequestResult) => {
    selection.remove(result.items.map((item) => item.label.id));
    notify(
      `${result.kind === 'transfer' ? 'Перемещение' : 'Утилизация'} проведена: позиций ${result.items.length}`,
    );
  };

  // Фильтры не трогаем: список остаётся полным, новая позиция появится в нём после перечитывания.
  const handleSaved = (result: CreateLabelResult, created: boolean) => {
    setModal(null);
    setScanState({ kind: 'idle' });
    if (result.merged) {
      notify(describeMergedResult(result), {
        label: 'Открыть',
        onClick: () => openCard(result.label),
      });
      return;
    }
    notify(created ? 'Позиция создана' : 'Изменения сохранены');
  };

  const handleDuplicatesMerged = (result: MergeDuplicatesResult) => {
    setModal(null);
    notify(
      result.groups === 0
        ? 'Дубли по номеру макета не найдены'
        : `Объединено позиций: ${result.merged}, групп дублей: ${result.groups}, перенесено ${formatQuantity(result.movedQuantity)} шт.`,
    );
  };

  return (
    <section aria-labelledby={headingId} className="screen">
      <h2 id={headingId} className="visually-hidden">
        Остатки
      </h2>
      <LabelsToolbar
        searchRef={searchRef}
        search={query.search}
        onSearchChange={query.setSearch}
        counterpartyName={query.counterpartyName}
        onCounterpartyNameChange={query.setCounterpartyName}
        onlyEmpty={query.onlyEmpty}
        onOnlyEmptyChange={query.setOnlyEmpty}
        onCreate={() => setModal({ kind: 'form', mode: { kind: 'create' } })}
        onMergeDuplicates={() => setModal({ kind: 'merge-duplicates' })}
      />
      <ScanStatus
        state={scanState}
        onCreate={(barcode) => setModal({ kind: 'form', mode: { kind: 'create', barcode } })}
      />
      <StockRequestBar
        count={selection.labels.length}
        onCreate={(requestKind) =>
          setModal({ kind: 'request', requestKind, labels: selection.labels })
        }
        onClear={selection.clear}
      />
      <LabelsList
        caption="Позиции"
        params={query.params}
        sortState={query.sortState}
        onSortChange={query.setSortState}
        onPageChange={query.setPage}
        emptyState={
          query.hasFilters
            ? 'Ничего не найдено. Измените условия поиска.'
            : 'Пока нет ни одной позиции — добавьте первую.'
        }
        selection={selection}
        renderActions={(label) => {
          const where = labelTitle(label);
          return (
            <>
              <button
                type="button"
                className="button button--small"
                onClick={() => openCard(label)}
              >
                Изменить остаток<span className="visually-hidden">: {where}</span>
              </button>
              <button
                type="button"
                className="button button--small button--secondary"
                onClick={() => setModal({ kind: 'form', mode: { kind: 'edit', label } })}
              >
                Редактировать<span className="visually-hidden">: {where}</span>
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setModal({ kind: 'delete', label })}
              >
                Удалить<span className="visually-hidden">: {where}</span>
              </button>
            </>
          );
        }}
      />

      {modal?.kind === 'card' && (
        <LabelCardDialog
          key={modal.labelId}
          labelId={modal.labelId}
          initialLabel={modal.initialLabel}
          onClose={closeModal}
          onOperationDone={handleOperationDone}
          onEdit={(label) => setModal({ kind: 'form', mode: { kind: 'edit', label } })}
          onDispose={(label) =>
            setModal({ kind: 'request', requestKind: 'disposal', labels: [label] })
          }
          returnFocusTo={returnFocusAfterCard}
        />
      )}
      {modal?.kind === 'form' && (
        <LabelFormDialog
          mode={modal.mode}
          onClose={closeModal}
          onSaved={handleSaved}
          onOpenLabel={(labelId) => setModal({ kind: 'card', labelId })}
          returnFocusTo={modal.mode.kind === 'create' ? focusSearch : undefined}
        />
      )}
      {modal?.kind === 'request' && (
        <StockRequestDialog
          kind={modal.requestKind}
          labels={modal.labels}
          onClose={closeModal}
          onCreated={handleRequestCreated}
          returnFocusTo={focusSearch}
        />
      )}
      {modal?.kind === 'delete' && (
        <DeleteLabelDialog
          label={modal.label}
          onClose={closeModal}
          onDeleted={handleDeleted}
          returnFocusTo={focusSearch}
        />
      )}
      {modal?.kind === 'merge-duplicates' && (
        <MergeDuplicatesDialog
          onClose={closeModal}
          onMerged={handleDuplicatesMerged}
          returnFocusTo={focusSearch}
        />
      )}
    </section>
  );
}
