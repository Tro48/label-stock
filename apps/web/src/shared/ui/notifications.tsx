import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export const NOTIFICATION_TIMEOUT_MS = 10_000;
const MAX_VISIBLE_NOTIFICATIONS = 3;

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

interface NotificationItem {
  id: number;
  message: string;
  action?: NotificationAction | undefined;
}

interface NotificationsApi {
  notify: (message: string, action?: NotificationAction) => void;
}

const NotificationsContext = createContext<NotificationsApi | null>(null);

export function useNotifications(): NotificationsApi {
  const api = useContext(NotificationsContext);
  if (!api) throw new Error('useNotifications вызван вне NotificationsProvider');
  return api;
}

/**
 * Уведомления выводятся в постоянно присутствующую live-область: скринридер зачитывает их,
 * не перехватывая фокус. Список ограничен, чтобы при серии сканов не копились сотни узлов.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message: string, action?: NotificationAction) => {
    const id = nextId.current++;
    setItems((current) => [...current, { id, message, action }].slice(-MAX_VISIBLE_NOTIFICATIONS));
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationsContext.Provider value={api}>
      {children}
      <section aria-label="Уведомления" className="notifications">
        <div role="status" aria-live="polite">
          <ul className="notifications__list">
            {items.map((item) => (
              <Notification key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </ul>
        </div>
      </section>
    </NotificationsContext.Provider>
  );
}

function Notification({
  item,
  onDismiss,
}: {
  item: NotificationItem;
  onDismiss: (id: number) => void;
}) {
  // Пока пользователь навёл мышь или фокус на уведомление, оно не исчезает (WCAG 2.2.1).
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onDismiss(item.id), NOTIFICATION_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [paused, item.id, onDismiss]);

  return (
    <li
      className="notification"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <p className="notification__message">{item.message}</p>
      {item.action && (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="button button--ghost"
        aria-label="Скрыть уведомление"
        onClick={() => onDismiss(item.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}
