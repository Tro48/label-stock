import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Куда вернуть фокус после закрытия. По умолчанию — на элемент, который был в фокусе при открытии. */
  returnFocusTo?: () => HTMLElement | null | undefined;
  size?: 'normal' | 'wide';
}

/**
 * Модалка на нативном <dialog> через showModal(): браузер сам запирает фокус внутри и делает
 * остальную страницу инертной. Компонент смонтирован — окно открыто.
 */
export function Dialog({ title, onClose, children, returnFocusTo, size = 'normal' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocusTo);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocusTo;
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    // showModal() ставит фокус на первый фокусируемый элемент («Закрыть»), поэтому поле,
    // с которого удобно начинать, помечается data-autofocus и получает фокус явно.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    // Esc: закрытие проводим через состояние React, а не нативно.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener('cancel', handleCancel);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      if (dialog.open) dialog.close();
      const target = returnFocusRef.current?.() ?? opener;
      if (target?.isConnected) target.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} className={`dialog dialog--${size}`}>
      <header className="dialog__header">
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Закрыть
        </button>
      </header>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}
