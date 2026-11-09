import { ApiError, errorMessage } from '../api/client';

interface ErrorAlertProps {
  error: unknown;
  /** Запрос сейчас повторяется автоматически: при обрыве связи показываем, что ждём сервер. */
  retrying?: boolean;
}

export function ErrorAlert({ error, retrying = false }: ErrorAlertProps) {
  if (!error) return null;
  const offline = error instanceof ApiError && error.isNetworkError;
  const message = offline && retrying ? 'Нет связи с сервером, повторяем…' : errorMessage(error);
  return (
    <p role="alert" className="alert alert--error">
      {message}
    </p>
  );
}
