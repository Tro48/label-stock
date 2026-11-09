import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

function DialogHost({ withAutofocus = false }: { withAutofocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      {open && (
        <Dialog title="Карточка позиции" onClose={() => setOpen(false)}>
          <input aria-label="Обычное поле" />
          <input aria-label="Количество" {...(withAutofocus ? { 'data-autofocus': true } : {})} />
        </Dialog>
      )}
    </>
  );
}

describe('Dialog', () => {
  it('открывается модально, заголовок связан через aria-labelledby', () => {
    render(
      <Dialog title="Карточка позиции" onClose={() => {}}>
        <p>Содержимое</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Карточка позиции' });
    expect(dialog).toHaveAttribute('open');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)).toHaveTextContent('Карточка позиции');
    expect(screen.getByRole('heading', { level: 2, name: 'Карточка позиции' })).toBeInTheDocument();
  });

  it('Esc (событие cancel) вызывает onClose и отменяет нативное закрытие', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Окно" onClose={onClose}>
        <p />
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    const notPrevented = fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
    expect(dialog).toHaveAttribute('open');
  });

  it('Esc вызывает актуальный onClose после перерендера', () => {
    const firstOnClose = vi.fn();
    const nextOnClose = vi.fn();
    const { rerender } = render(
      <Dialog title="Окно" onClose={firstOnClose}>
        <p />
      </Dialog>,
    );
    rerender(
      <Dialog title="Окно" onClose={nextOnClose}>
        <p />
      </Dialog>,
    );
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(nextOnClose).toHaveBeenCalledTimes(1);
  });

  it('кнопка «Закрыть» вызывает onClose', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Окно" onClose={onClose}>
        <p />
      </Dialog>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('элемент с data-autofocus получает фокус', async () => {
    render(<DialogHost withAutofocus />);
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByRole('textbox', { name: 'Количество' })).toHaveFocus();
  });

  it('фокус возвращается на открывший элемент после закрытия', async () => {
    const user = userEvent.setup();
    render(<DialogHost withAutofocus />);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('returnFocusTo важнее открывшего элемента', () => {
    const { rerender } = render(
      <>
        <button type="button">Открыть</button>
        <input aria-label="Поиск" />
      </>,
    );
    screen.getByRole('button', { name: 'Открыть' }).focus();
    const searchInput = screen.getByRole('textbox', { name: 'Поиск' });
    const search = () => searchInput;
    const focusSpy = vi.spyOn(searchInput, 'focus');
    rerender(
      <>
        <button type="button">Открыть</button>
        <input aria-label="Поиск" />
        <Dialog title="Окно" onClose={() => {}} returnFocusTo={search}>
          <input aria-label="Количество" data-autofocus />
        </Dialog>
      </>,
    );
    rerender(
      <>
        <button type="button">Открыть</button>
        <input aria-label="Поиск" />
      </>,
    );
    expect(focusSpy).toHaveBeenCalled();
    expect(searchInput).toHaveFocus();
  });

  it('открывший элемент удалён из DOM — фокус не ставится на отсоединённый узел', () => {
    const { rerender } = render(<button type="button">Открыть</button>);
    const opener = screen.getByRole('button', { name: 'Открыть' });
    opener.focus();
    const focusSpy = vi.spyOn(opener, 'focus');
    rerender(
      <Dialog title="Окно" onClose={() => {}}>
        <p />
      </Dialog>,
    );
    rerender(<p>Пусто</p>);
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('размонтирование закрывает нативный dialog', () => {
    const closeSpy = vi.spyOn(HTMLDialogElement.prototype, 'close');
    const { unmount } = render(
      <Dialog title="Окно" onClose={() => {}}>
        <p />
      </Dialog>,
    );
    unmount();
    expect(closeSpy).toHaveBeenCalledTimes(1);
    closeSpy.mockRestore();
  });
});
