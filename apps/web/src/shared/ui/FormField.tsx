import { useId, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  /** Рендер поля: получает id и aria-атрибуты, связывающие его с подписью, подсказкой и ошибкой. */
  children: (control: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    'aria-required': boolean | undefined;
  }) => ReactNode;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
        {required && <span className="field__required"> (обязательно)</span>}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
        'aria-required': required || undefined,
      })}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  );
}
