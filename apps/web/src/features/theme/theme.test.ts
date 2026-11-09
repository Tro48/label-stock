import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme, useThemePreference } from './theme';

const storageFailure = () => {
  throw new DOMException('Доступ к хранилищу запрещён', 'SecurityError');
};

/** Хранилище есть, но каждое обращение к нему падает (запрет сайта, переполнение). */
function breakStorageMethods() {
  for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
    vi.spyOn(Storage.prototype, method).mockImplementation(storageFailure);
  }
}

/** Даже обращение к window.localStorage бросает исключение (Safari с запретом cookies). */
function breakStorageAccess() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(storageFailure);
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readStoredTheme', () => {
  it('ничего не сохранено — «как в системе»', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it.each(['light', 'dark'] as const)('сохранённое %s читается', (theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    expect(readStoredTheme()).toBe(theme);
  });

  it.each(['', 'Dark', 'blue', 'system ', '{"theme":"dark"}'])(
    'мусор %j в хранилище — «как в системе»',
    (value) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
      expect(readStoredTheme()).toBe('system');
    },
  );

  it('getItem бросает исключение — «как в системе», без падения', () => {
    breakStorageMethods();
    expect(readStoredTheme()).toBe('system');
  });

  it('недоступен сам window.localStorage — «как в системе», без падения', () => {
    breakStorageAccess();
    expect(readStoredTheme()).toBe('system');
  });
});

describe('applyTheme', () => {
  it('явная тема ставит data-theme на <html>', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    applyTheme('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  it('«как в системе» убирает атрибут', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('«как в системе» без атрибута — ничего не ломает', () => {
    applyTheme('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});

describe('useThemePreference', () => {
  it('стартует с сохранённой темы и сразу применяет её', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useThemePreference());
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('выбор темы применяется и сохраняется', () => {
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current[1]('light'));
    expect(result.current[0]).toBe('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('возврат к «как в системе» удаляет ключ и атрибут', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current[1]('system'));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('мусор в хранилище при старте не оставляет атрибут', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    const { result } = renderHook(() => useThemePreference());
    expect(result.current[0]).toBe('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('хранилище падает на записи — тема всё равно применяется', () => {
    breakStorageMethods();
    const { result } = renderHook(() => useThemePreference());
    expect(() => act(() => result.current[1]('dark'))).not.toThrow();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(() => act(() => result.current[1]('system'))).not.toThrow();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('window.localStorage недоступен совсем — хук работает', () => {
    breakStorageAccess();
    const { result } = renderHook(() => useThemePreference());
    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});
