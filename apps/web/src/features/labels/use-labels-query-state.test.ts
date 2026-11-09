import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLabelsQueryState } from './use-labels-query-state';

const DEBOUNCE_MS = 300;

describe('useLabelsQueryState: фильтр по контрагенту', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => renderHook(() => useLabelsQueryState(false));

  it('часть названия уходит в counterpartyName после паузы, без лишних пробелов', () => {
    const { result } = setup();
    act(() => result.current.setCounterpartyName('  холдинг '));
    expect(result.current.counterpartyName).toBe('  холдинг ');
    expect(result.current.params.counterpartyName).toBeUndefined();
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.params.counterpartyName).toBe('холдинг');
    expect(result.current.hasFilters).toBe(true);
  });

  it('пустое или из пробелов — фильтра нет', () => {
    const { result } = setup();
    act(() => result.current.setCounterpartyName('   '));
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.params.counterpartyName).toBeUndefined();
    expect(result.current.hasFilters).toBe(false);
  });

  it('смена контрагента возвращает на первую страницу', () => {
    const { result } = setup();
    act(() => result.current.setPage(3));
    act(() => result.current.setCounterpartyName('холдинг'));
    expect(result.current.params.page).toBe(1);
  });

  it('id контрагента в запрос больше не уходит', () => {
    const { result } = setup();
    act(() => result.current.setCounterpartyName('холдинг'));
    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(result.current.params).not.toHaveProperty('counterpartyId');
  });
});
