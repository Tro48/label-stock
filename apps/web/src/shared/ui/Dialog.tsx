import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Куда вернуть фокус после закрытия. По умолчанию — на элемент, который был в фокусе при открытии. */
  returnFocusTo?: () => HTMLElement | null | undefined;
  size?: 'normal' | 'wide';
}

/**
 * У окна нет внутренних отступов, поэтому событие с target === <dialog> — это подложка.
 * Координаты проверяем на случай, если отступы появятся: клик по ним не должен закрывать окно.
 */
function isOutsideDialog(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const rect = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
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

  // Клик по подложке приходит на сам <dialog>. Нажатие тоже должно начаться снаружи: иначе
  // выделение текста в поле, отпущенное за краем окна, закрыло бы его вместе с введённым.
  const pressStartedOutside = useRef(false);
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    pressStartedOutside.current = isOutsideDialog(event);
  };
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressStartedOutside.current && isOutsideDialog(event)) onClose();
    pressStartedOutside.current = false;
  };

  return (
    // Мышиный дубль Esc и кнопки «Закрыть»: с клавиатуры окно закрывается ими.
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`dialog dialog--${size}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
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
