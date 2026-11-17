import { useId, type Ref } from 'react';
import { SearchField } from '../../shared/ui/SearchField';
import { CounterpartyInput } from '../counterparties/CounterpartyInput';

interface LabelsToolbarProps {
  searchRef: Ref<HTMLInputElement>;
  search: string;
  onSearchChange: (value: string) => void;
  counterpartyName: string;
  onCounterpartyNameChange: (value: string) => void;
  onCreate: () => void;
  onMergeDuplicates: () => void;
}

export function LabelsToolbar({
  searchRef,
  search,
  onSearchChange,
  counterpartyName,
  onCounterpartyNameChange,
  onCreate,
  onMergeDuplicates,
}: LabelsToolbarProps) {
  const ids = useId();

  return (
    <div className="toolbar">
      <SearchField
        searchRef={searchRef}
        value={search}
        onChange={onSearchChange}
        label="Найти или отсканировать штрихкод"
        placeholder="Контрагент, номер макета или последние цифры штрихкода"
        scannerTarget
      />

      <div className="toolbar__filters">
        <div className="field field--inline">
          <label htmlFor={`${ids}-counterparty`} className="field__label">
            Контрагент
          </label>
          <CounterpartyInput
            id={`${ids}-counterparty`}
            type="search"
            className="input"
            placeholder="Все"
            value={counterpartyName}
            onChange={(event) => onCounterpartyNameChange(event.target.value)}
          />
        </div>

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
