export type ScanState =
  | { kind: 'idle' }
  | { kind: 'searching'; barcode: string }
  | { kind: 'found'; barcode: string }
  | { kind: 'notFound'; barcode: string }
  | { kind: 'error'; barcode: string; message: string };

interface ScanStatusProps {
  state: ScanState;
  onCreate: (barcode: string) => void;
}

/** Результат скана в постоянной live-области: скринридер зачитывает его без смены фокуса. */
export function ScanStatus({ state, onCreate }: ScanStatusProps) {
  return (
    <div role="status" aria-live="polite" className="scan-status">
      {state.kind === 'searching' && <p>Ищем штрихкод {state.barcode}…</p>}
      {state.kind === 'found' && <p>Найдена позиция со штрихкодом {state.barcode}</p>}
      {state.kind === 'notFound' && (
        <div className="alert alert--warning">
          <p>Штрихкод {state.barcode} не найден</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => onCreate(state.barcode)}
          >
            Создать позицию
          </button>
        </div>
      )}
      {state.kind === 'error' && (
        <p className="alert alert--error">
          Не удалось проверить штрихкод {state.barcode}: {state.message}
        </p>
      )}
    </div>
  );
}
