import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { makeLabel } from '../../test/fixtures';
import { useLabelSelection } from './use-label-selection';

const A = makeLabel({ id: 'a' });
const B = makeLabel({ id: 'b' });
const C = makeLabel({ id: 'c' });

function setup() {
  return renderHook(() => useLabelSelection());
}

const ids = (labels: readonly { id: string }[]) => labels.map((label) => label.id);

describe('useLabelSelection', () => {
  it('изначально ничего не выбрано', () => {
    const { result } = setup();
    expect(result.current.labels).toEqual([]);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('toggle(true) добавляет позиции в порядке выбора', () => {
    const { result } = setup();
    act(() => result.current.toggle([B], true));
    act(() => result.current.toggle([A, C], true));
    expect(ids(result.current.labels)).toEqual(['b', 'a', 'c']);
    expect(result.current.isSelected('a')).toBe(true);
  });

  it('повторный выбор не дублирует позицию', () => {
    const { result } = setup();
    act(() => result.current.toggle([A, B], true));
    act(() => result.current.toggle([A], true));
    expect(ids(result.current.labels)).toEqual(['a', 'b']);
  });

  it('повторный выбор обновляет сохранённые данные позиции', () => {
    const { result } = setup();
    act(() => result.current.toggle([A], true));
    act(() => result.current.toggle([makeLabel({ id: 'a', quantity: 5 })], true));
    expect(result.current.labels[0]?.quantity).toBe(5);
  });

  it('toggle(false) снимает только переданные', () => {
    const { result } = setup();
    act(() => result.current.toggle([A, B, C], true));
    act(() => result.current.toggle([B], false));
    expect(ids(result.current.labels)).toEqual(['a', 'c']);
    expect(result.current.isSelected('b')).toBe(false);
  });

  it('снятие невыбранной позиции ничего не ломает', () => {
    const { result } = setup();
    act(() => result.current.toggle([A], true));
    act(() => result.current.toggle([C], false));
    expect(ids(result.current.labels)).toEqual(['a']);
  });

  it('пустой список в toggle — выбор не меняется', () => {
    const { result } = setup();
    act(() => result.current.toggle([A], true));
    act(() => result.current.toggle([], true));
    act(() => result.current.toggle([], false));
    expect(ids(result.current.labels)).toEqual(['a']);
  });

  it('выбор с другой «страницы» не сбрасывает прежний', () => {
    const { result } = setup();
    act(() => result.current.toggle([A, B], true));
    act(() => result.current.toggle([C], true));
    act(() => result.current.toggle([C], false));
    expect(ids(result.current.labels)).toEqual(['a', 'b']);
  });

  it('remove убирает по id, неизвестные id игнорирует', () => {
    const { result } = setup();
    act(() => result.current.toggle([A, B, C], true));
    act(() => result.current.remove(['a', 'zzz', 'c']));
    expect(ids(result.current.labels)).toEqual(['b']);
    act(() => result.current.remove([]));
    expect(ids(result.current.labels)).toEqual(['b']);
  });

  it('clear снимает всё', () => {
    const { result } = setup();
    act(() => result.current.toggle([A, B], true));
    act(() => result.current.clear());
    expect(result.current.labels).toEqual([]);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('функции стабильны между рендерами, объект меняется только при смене выбора', () => {
    const { result, rerender } = setup();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    act(() => result.current.toggle([A], true));
    expect(result.current).not.toBe(first);
    expect(result.current.toggle).toBe(first.toggle);
    expect(result.current.remove).toBe(first.remove);
    expect(result.current.clear).toBe(first.clear);
  });

  describe('refresh', () => {
    const UPDATED_A = makeLabel({
      id: 'a',
      obsoleteQuantity: 300,
      updatedAt: '2026-11-03T10:00:00.000Z',
    });

    it('подменяет снимок выбранной позиции, если updatedAt другой', () => {
      const { result } = setup();
      act(() => result.current.toggle([A, B], true));
      act(() => result.current.refresh([UPDATED_A]));
      expect(result.current.labels[0]).toBe(UPDATED_A);
      expect(result.current.labels[1]).toBe(B);
    });

    it('порядок выбора при подмене сохраняется', () => {
      const { result } = setup();
      act(() => result.current.toggle([B, A], true));
      act(() => result.current.refresh([UPDATED_A]));
      expect(ids(result.current.labels)).toEqual(['b', 'a']);
    });

    it('невыбранные позиции не добавляет', () => {
      const { result } = setup();
      act(() => result.current.toggle([B], true));
      act(() => result.current.refresh([UPDATED_A, C]));
      expect(ids(result.current.labels)).toEqual(['b']);
      expect(result.current.isSelected('a')).toBe(false);
    });

    it('при пустом выборе ничего не добавляет и не меняет объект', () => {
      const { result } = setup();
      const before = result.current;
      act(() => result.current.refresh([UPDATED_A, B]));
      expect(result.current).toBe(before);
      expect(result.current.labels).toEqual([]);
    });

    it('тот же updatedAt — снимок прежний, объект селекции и labels те же', () => {
      const { result } = setup();
      act(() => result.current.toggle([A], true));
      const before = result.current;
      // Другой объект с тем же updatedAt: снимок не подменяется.
      act(() => result.current.refresh([makeLabel({ id: 'a', quantity: 1 })]));
      expect(result.current).toBe(before);
      expect(result.current.labels).toBe(before.labels);
      expect(result.current.labels[0]).toBe(A);
    });

    it('пустой список — объект селекции тот же', () => {
      const { result } = setup();
      act(() => result.current.toggle([A], true));
      const before = result.current;
      act(() => result.current.refresh([]));
      expect(result.current).toBe(before);
    });

    it('часть изменилась, часть нет — подменяются только изменившиеся', () => {
      const { result } = setup();
      act(() => result.current.toggle([A, B], true));
      const freshB = makeLabel({ id: 'b', quantity: 1 });
      act(() => result.current.refresh([UPDATED_A, freshB]));
      expect(result.current.labels[0]).toBe(UPDATED_A);
      expect(result.current.labels[1]).toBe(B);
    });

    it('refresh стабилен между рендерами: эффект со ссылкой на него не перезапускается', () => {
      const { result } = setup();
      const { refresh } = result.current;
      act(() => result.current.toggle([A], true));
      act(() => result.current.refresh([UPDATED_A]));
      expect(result.current.refresh).toBe(refresh);
    });

    it('после refresh снятие флажка убирает обновлённую позицию', () => {
      const { result } = setup();
      act(() => result.current.toggle([A], true));
      act(() => result.current.refresh([UPDATED_A]));
      act(() => result.current.toggle([A], false));
      expect(result.current.labels).toEqual([]);
    });
  });
});
