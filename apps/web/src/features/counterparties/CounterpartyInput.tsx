import { useEffect, useId, useRef, type ComponentPropsWithoutRef } from 'react';
import type { Counterparty } from '@label-stock/shared';
import { useDebouncedValue } from '../../shared/use-debounced-value';
import { useCounterpartySuggestions } from './api';

const SUGGESTIONS_DEBOUNCE_MS = 250;

type CounterpartyInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'list' | 'value'> & {
  value: string;
  /** Сообщает контрагента, чьё имя совпало с введённым (без учёта регистра), или undefined. */
  onMatchChange?: (counterparty: Counterparty | undefined) => void;
};

const normalizeName = (name: string) => name.trim().toLocaleLowerCase('ru');

/**
 * Автодополнение на нативном <datalist>: клавиатура и скринридеры работают без своей реализации
 * combobox. Можно выбрать подсказку или ввести новое название — контрагент создастся при сохранении.
 */
export function CounterpartyInput({ value, onMatchChange, ...inputProps }: CounterpartyInputProps) {
  const listId = useId();
  const search = useDebouncedValue(value.trim(), SUGGESTIONS_DEBOUNCE_MS);
  const { data: suggestions = [] } = useCounterpartySuggestions(search);
  const onMatchChangeRef = useRef(onMatchChange);
  useEffect(() => {
    onMatchChangeRef.current = onMatchChange;
  });

  const matchedId = value.trim()
    ? suggestions.find((counterparty) => normalizeName(counterparty.name) === normalizeName(value))
        ?.id
    : undefined;

  useEffect(() => {
    onMatchChangeRef.current?.(suggestions.find((counterparty) => counterparty.id === matchedId));
    // suggestions намеренно не в зависимостях: реагируем только на смену совпавшего контрагента.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedId]);

  return (
    <>
      <input {...inputProps} value={value} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {suggestions.map((counterparty) => (
          <option key={counterparty.id} value={counterparty.name} />
        ))}
      </datalist>
    </>
  );
}
