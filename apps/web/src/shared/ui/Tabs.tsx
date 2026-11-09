import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  label: string;
  items: readonly TabItem[];
}

/** Вкладки по паттерну WAI-ARIA: стрелки, Home и End переключают, в Tab-порядке только активная. */
export function Tabs({ label, items }: TabsProps) {
  const [activeId, setActiveId] = useState(items[0]?.id);
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activate = (index: number) => {
    const item = items[(index + items.length) % items.length];
    if (!item) return;
    setActiveId(item.id);
    tabRefs.current.get(item.id)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    activate(target);
  };

  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} className="tabs__list">
        {items.map((item, index) => {
          const selected = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) tabRefs.current.set(item.id, element);
                else tabRefs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className="tabs__tab"
              onClick={() => setActiveId(item.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          className="tabs__panel"
        >
          {item.id === activeId && item.content}
        </div>
      ))}
    </div>
  );
}
