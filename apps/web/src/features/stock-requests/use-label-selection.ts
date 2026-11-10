import { useCallback, useMemo, useState } from 'react';
import type { Label } from '@label-stock/shared';

export interface LabelSelection {
  labels: readonly Label[];
  isSelected: (id: string) => boolean;
  toggle: (labels: readonly Label[], selected: boolean) => void;
  remove: (ids: readonly string[]) => void;
  /** Подменяет снимки выбранных позиций свежими: остаток мог измениться после выбора. */
  refresh: (labels: readonly Label[]) => void;
  clear: () => void;
}

/** Выбор переживает смену страницы и фильтров: заявку собирают из разных мест списка. */
export function useLabelSelection(): LabelSelection {
  const [selected, setSelected] = useState<ReadonlyMap<string, Label>>(() => new Map());

  const toggle = useCallback((labels: readonly Label[], isOn: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const label of labels) {
        if (isOn) next.set(label.id, label);
        else next.delete(label.id);
      }
      return next;
    });
  }, []);

  const remove = useCallback((ids: readonly string[]) => {
    setSelected((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const refresh = useCallback((labels: readonly Label[]) => {
    setSelected((current) => {
      const stale = labels.filter((label) => {
        const selectedLabel = current.get(label.id);
        return selectedLabel && selectedLabel.updatedAt !== label.updatedAt;
      });
      // Тот же объект — без лишней перерисовки, иначе эффект в списке зациклится.
      if (stale.length === 0) return current;
      const next = new Map(current);
      for (const label of stale) next.set(label.id, label);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  return useMemo(
    () => ({
      labels: [...selected.values()],
      isSelected: (id: string) => selected.has(id),
      toggle,
      remove,
      refresh,
      clear,
    }),
    [selected, toggle, remove, refresh, clear],
  );
}
