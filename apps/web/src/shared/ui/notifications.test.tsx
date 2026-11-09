import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook, screen, within } from '@testing-library/react';
import {
  NOTIFICATION_TIMEOUT_MS,
  NotificationsProvider,
  useNotifications,
  type NotificationAction,
} from './notifications';

function renderProvider() {
  const hook = renderHook(() => useNotifications(), { wrapper: NotificationsProvider });
  const send = (message: string, action?: NotificationAction) =>
    act(() => {
      hook.result.current.notify(message, action);
    });
  return { unmount: hook.unmount, send };
}

const items = () => within(screen.getByRole('status')).queryAllByRole('listitem');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('NotificationsProvider', () => {
  it('live-область присутствует сразу и пуста', () => {
    renderProvider();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(items()).toHaveLength(0);
    expect(screen.getByRole('region', { name: 'Уведомления' })).toContainElement(status);
  });

  it('уведомление появляется в role=status', () => {
    const { send } = renderProvider();
    send('Позиция удалена');
    expect(screen.getByRole('status')).toHaveTextContent('Позиция удалена');
  });

  it('скрывается через 10 с, но не раньше', () => {
    const { send } = renderProvider();
    send('Позиция удалена');
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS - 1));
    expect(items()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(items()).toHaveLength(0);
  });

  it('у каждого уведомления свой таймер', () => {
    const { send } = renderProvider();
    send('Первое');
    act(() => vi.advanceTimersByTime(4_000));
    send('Второе');
    act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByRole('status')).not.toHaveTextContent('Первое');
    expect(screen.getByRole('status')).toHaveTextContent('Второе');
  });

  it('фокус внутри приостанавливает скрытие, уход фокуса возобновляет', () => {
    const { send } = renderProvider();
    send('Позиция удалена', { label: 'Отменить', onClick: () => {} });
    const button = screen.getByRole('button', { name: 'Отменить' });
    act(() => button.focus());
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS * 3));
    expect(items()).toHaveLength(1);

    act(() => button.blur());
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS));
    expect(items()).toHaveLength(0);
  });

  it('переход фокуса между кнопками уведомления не снимает паузу', () => {
    const { send } = renderProvider();
    send('Позиция удалена', { label: 'Отменить', onClick: () => {} });
    act(() => screen.getByRole('button', { name: 'Отменить' }).focus());
    act(() => screen.getByRole('button', { name: 'Скрыть уведомление' }).focus());
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS * 2));
    expect(items()).toHaveLength(1);
  });

  it('наведение мыши приостанавливает скрытие', () => {
    const { send } = renderProvider();
    send('Позиция удалена');
    const [item] = items();
    fireEvent.mouseEnter(item!);
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS * 2));
    expect(items()).toHaveLength(1);
    fireEvent.mouseLeave(item!);
    act(() => vi.advanceTimersByTime(NOTIFICATION_TIMEOUT_MS));
    expect(items()).toHaveLength(0);
  });

  it('кнопка действия вызывает onClick и скрывает уведомление', () => {
    const onClick = vi.fn();
    const { send } = renderProvider();
    send('Позиция удалена', { label: 'Отменить', onClick });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(items()).toHaveLength(0);
  });

  it('без действия — только кнопка «Скрыть уведомление», она скрывает', () => {
    const { send } = renderProvider();
    send('Сохранено');
    const buttons = within(items()[0]!).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
    expect(items()).toHaveLength(0);
  });

  it('не больше 3 одновременно: остаются последние', () => {
    const { send } = renderProvider();
    for (const message of ['1', '2', '3', '4', '5']) send(`Уведомление ${message}`);
    expect(items().map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Уведомление 3',
      'Уведомление 4',
      'Уведомление 5',
    ]);
  });

  it('вытесненное уведомление не оставляет таймер', () => {
    const { send } = renderProvider();
    for (const message of ['1', '2', '3', '4']) send(message);
    expect(vi.getTimerCount()).toBe(3);
  });

  it('таймеры очищаются при размонтировании', () => {
    const { send, unmount } = renderProvider();
    send('Первое');
    send('Второе');
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useNotifications вне провайдера — понятная ошибка', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNotifications())).toThrow(
      'useNotifications вызван вне NotificationsProvider',
    );
  });
});
