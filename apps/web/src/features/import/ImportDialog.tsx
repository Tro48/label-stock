import { useId, useState, type FormEvent } from 'react';
import {
  CSV_COLUMNS,
  IMPORT_MAX_BYTES,
  REQUIRED_CSV_COLUMNS,
  type ImportResult,
} from '@label-stock/shared';
import { errorMessage } from '../../shared/api/client';
import { Dialog } from '../../shared/ui/Dialog';
import { useImportCsv } from './api';
import { readCsvFile } from './read-csv-file';

interface ImportDialogProps {
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

const MAX_SIZE_MB = IMPORT_MAX_BYTES / 1024 / 1024;
const REQUIRED_TITLES = REQUIRED_CSV_COLUMNS.map((column) => `«${CSV_COLUMNS[column]}»`).join(', ');

/** Двухшаговая загрузка: сначала пробный прогон с отчётом, затем запись по подтверждению. */
export function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const ids = useId();
  const [csv, setCsv] = useState<string>();
  const [preview, setPreview] = useState<ImportResult>();
  const [error, setError] = useState<string>();
  const importCsv = useImportCsv();

  const resetPreview = () => {
    setCsv(undefined);
    setPreview(undefined);
    setError(undefined);
  };

  const check = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetPreview();
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Выберите CSV-файл');
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError(`Файл больше ${MAX_SIZE_MB} МБ, разбейте его на части`);
      return;
    }
    try {
      const text = await readCsvFile(file);
      setPreview(await importCsv.mutateAsync({ csv: text, dryRun: true }));
      setCsv(text);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const apply = async () => {
    if (!csv) return;
    try {
      const result = await importCsv.mutateAsync({ csv, dryRun: false });
      if (result.applied) onImported(result);
      else setPreview(result);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const hasErrors = Boolean(preview && preview.errors.length > 0);

  return (
    <Dialog title="Загрузка из CSV" onClose={onClose} size="wide">
      <form noValidate onSubmit={check} className="form">
        <div className="field">
          <label htmlFor={`${ids}-file`} className="field__label">
            CSV-файл
          </label>
          <input
            id={`${ids}-file`}
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="input"
            aria-describedby={`${ids}-hint`}
            onChange={resetPreview}
            data-autofocus
          />
          <p id={`${ids}-hint`} className="field__hint">
            Формат как у «Выгрузить в CSV»: первая строка — заголовки, обязательные столбцы{' '}
            {REQUIRED_TITLES}. Позиция ищется по номеру макета, без номера — по штрихкоду: найденная
            обновляется, остальные создаются. Пустые ячейки не стирают существующие значения.
            Остаток записывается в журнал как инвентаризация. До {MAX_SIZE_MB} МБ.
          </p>
        </div>
        <footer className="form__actions">
          <button type="submit" className="button button--secondary" disabled={importCsv.isPending}>
            {importCsv.isPending && !preview ? 'Проверяем…' : 'Проверить файл'}
          </button>
        </footer>
      </form>

      <div role="status" aria-live="polite" className="import-report">
        {preview && <ImportReport result={preview} />}
      </div>
      {error && (
        <p role="alert" className="alert alert--error">
          {error}
        </p>
      )}

      <footer className="form__actions">
        {preview && !hasErrors && (
          <button
            type="button"
            className="button button--primary"
            onClick={apply}
            disabled={importCsv.isPending}
          >
            {importCsv.isPending ? 'Загружаем…' : 'Загрузить'}
          </button>
        )}
        <button type="button" className="button button--secondary" onClick={onClose}>
          Отмена
        </button>
      </footer>
    </Dialog>
  );
}

function ImportReport({ result }: { result: ImportResult }) {
  if (result.errors.length === 0) {
    return (
      <p className="alert">
        Ошибок нет. Будет создано: {result.created}, обновлено: {result.updated}, без изменений:{' '}
        {result.unchanged}.
      </p>
    );
  }
  return (
    <div className="alert alert--error">
      <p>
        В файле есть ошибки, ничего не загружено. Исправьте их и проверьте файл ещё раз.
        {result.errorsTruncated && ` Показаны первые ${result.errors.length}.`}
      </p>
      <ul className="import-report__errors">
        {result.errors.map((rowError, index) => (
          <li key={`${rowError.line}-${index}`}>
            Строка {rowError.line}: {rowError.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
