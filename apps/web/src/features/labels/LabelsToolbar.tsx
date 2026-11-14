import { useId, type Ref } from 'react';
import { CounterpartyInput } from '../counterparties/CounterpartyInput';

interface LabelsToolbarProps {
  searchRef: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  counterpartyName: string;
  onCounterpartyNameChange: (value: string) => void;
  onlyEmpty: boolean;
  onOnlyEmptyChange: (value: boolean) => void;
  onCreate: () => void;
  onMergeDuplicates: () => void;
}

export function LabelsToolbar({
  searchRef,
  search,
  onSearchChange,
  counterpartyName,
  onCounterpartyNameChange,
  onlyEmpty,
  onOnlyEmptyChange,
  onCreate,
  onMergeDuplicates,
}: LabelsToolbarProps) {
  const ids = useId();

  return (
    <div className="toolbar">
      <form role="search" className="toolbar__search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${ids}-search`} className="field__label">
          Найти или отсканировать штрихкод
        </label>
        <input
          id={`${ids}-search`}
          ref={searchRef}
          type="search"
          className="input input--large"
          placeholder="Контрагент, номер макета или последние цифры штрихкода"
          autoComplete="off"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          // Единственное поле, куда сканер может вводить код, см. useBarcodeScanner.
          data-scanner-target=""
        />
      </form>

      <div className="toolbar__filters">
        <div className="field field--inline">
          <label htmlFor={`${ids}-counterparty`} className="field__label">
            Контрагент
          </label>
          <CounterpartyInput
            id={`${ids}-counterparty`}
            className="input"
            placeholder="Все"
            value={counterpartyName}
            onChange={(event) => onCounterpartyNameChange(event.target.value)}
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(event) => onOnlyEmptyChange(event.target.checked)}
          />
          Только нулевые
        </label>

        <button type="button" className="button button--secondary" onClick={onMergeDuplicates}>
          Объединить дубли
        </button>

        <button type="button" className="button button--primary" onClick={onCreate}>
          <span aria-hidden="true">+ </span>Добавить
        </button>
      </div>
    </div>
  );
}
