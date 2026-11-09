import { useId, useState, type Ref } from 'react';
import { CounterpartyInput } from '../counterparties/CounterpartyInput';

interface LabelsToolbarProps {
  searchRef: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  onCounterpartyChange: (counterpartyId: string | undefined) => void;
  onlyEmpty: boolean;
  onOnlyEmptyChange: (value: boolean) => void;
  onCreate: () => void;
}

export function LabelsToolbar({
  searchRef,
  search,
  onSearchChange,
  onCounterpartyChange,
  onlyEmpty,
  onOnlyEmptyChange,
  onCreate,
}: LabelsToolbarProps) {
  const ids = useId();
  const [counterpartyName, setCounterpartyName] = useState('');

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
          placeholder="Контрагент, номер макета или штрихкод"
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
            onChange={(event) => setCounterpartyName(event.target.value)}
            onMatchChange={(counterparty) => onCounterpartyChange(counterparty?.id)}
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

        <button type="button" className="button button--primary" onClick={onCreate}>
          <span aria-hidden="true">+ </span>Добавить
        </button>
      </div>
    </div>
  );
}
