import { useId, useState, type FormEvent } from 'react';
import { todayIsoDate, type Label, type MovementResult } from '@label-stock/shared';
import { errorMessage } from '../../shared/api/client';
import { useCreateMovement } from '../labels/api';
import {
  buildMovementInput,
  type StockOperation,
  type StockOperationValues,
} from './stock-operation';

interface StockOperationFormProps {
  label: Label;
  onDone: (operation: StockOperation, result: MovementResult) => void;
}

const OPERATION_BUTTONS: readonly { operation: StockOperation; text: string }[] = [
  { operation: 'consumption', text: 'Списать' },
  { operation: 'print', text: 'Добавить' },
];

function isStockOperation(value: string | undefined): value is StockOperation {
  return OPERATION_BUTTONS.some((button) => button.operation === value);
}

/** Enter в поле количества нажимает первую submit-кнопку — «Списать», как и задумано для потока сканов. */
export function StockOperationForm({ label, onDone }: StockOperationFormProps) {
  const ids = useId();
  const [values, setValues] = useState<StockOperationValues>({
    amount: '',
    printedAt: todayIsoDate(),
    comment: '',
  });
  const [error, setError] = useState<string>();
  const createMovement = useCreateMovement();

  const update = (field: keyof StockOperationValues) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const operation = isStockOperation(submitter?.value) ? submitter.value : 'consumption';
    const built = buildMovementInput(operation, values);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(undefined);
    try {
      const result = await createMovement.mutateAsync({ id: label.id, input: built.input });
      onDone(operation, result);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const amountErrorId = `${ids}-amount-error`;

  return (
    <form noValidate onSubmit={submit} className="form" aria-label="Изменение остатка">
      <div className="field">
        <label htmlFor={`${ids}-amount`} className="field__label">
          Количество, шт.
        </label>
        <input
          id={`${ids}-amount`}
          className="input input--large"
          inputMode="numeric"
          autoComplete="off"
          data-autofocus
          value={values.amount}
          onChange={(event) => update('amount')(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? amountErrorId : undefined}
        />
        {error && (
          <p id={amountErrorId} role="alert" className="field__error">
            {error}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor={`${ids}-printed`} className="field__label">
          Дата допечатки
        </label>
        <input
          id={`${ids}-printed`}
          type="date"
          className="input"
          value={values.printedAt}
          onChange={(event) => update('printedAt')(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`${ids}-comment`} className="field__label">
          Комментарий
        </label>
        <input
          id={`${ids}-comment`}
          className="input"
          value={values.comment}
          onChange={(event) => update('comment')(event.target.value)}
        />
      </div>

      <footer className="form__actions">
        {OPERATION_BUTTONS.map(({ operation, text }, index) => (
          <button
            key={operation}
            type="submit"
            value={operation}
            className={`button ${index === 0 ? 'button--primary' : 'button--secondary'}`}
            disabled={createMovement.isPending}
          >
            {text}
          </button>
        ))}
      </footer>
    </form>
  );
}
