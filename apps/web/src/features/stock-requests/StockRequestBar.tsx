import { useId } from 'react';
import type { StockRequestKind } from '@label-stock/shared';

interface StockRequestBarProps {
  count: number;
  onCreate: (kind: StockRequestKind) => void;
  onClear: () => void;
}

export function StockRequestBar({ count, onCreate, onClear }: StockRequestBarProps) {
  const headingId = useId();
  if (count === 0) return null;

  return (
    <section aria-labelledby={headingId} className="request-bar">
      <h3 id={headingId} className="request-bar__title">
        Выбрано позиций: {count}
      </h3>
      <button type="button" className="button button--primary" onClick={() => onCreate('transfer')}>
        Заявка на перемещение
      </button>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => onCreate('disposal')}
      >
        Заявка на утилизацию
      </button>
      <button type="button" className="button button--ghost" onClick={onClear}>
        Снять выбор
      </button>
    </section>
  );
}
