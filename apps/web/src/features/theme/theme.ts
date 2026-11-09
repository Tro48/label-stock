import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: readonly { value: ThemePreference; text: string }[] = [
  { value: 'system', text: 'Как в системе' },
  { value: 'light', text: 'Светлая' },
  { value: 'dark', text: 'Тёмная' },
];

// Тот же ключ читает public/theme-init.js до загрузки React, чтобы страница не мигала светлой темой.
export const THEME_STORAGE_KEY = 'label-stock-theme';

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_OPTIONS.some((option) => option.value === value);
}

/** localStorage может быть недоступен (приватный режим, запрет сайта) — тогда тема системная. */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function storeTheme(preference: ThemePreference): void {
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Выбор просто не сохранится между сессиями.
  }
}

/** Явный выбор ставит data-theme на <html>; «как в системе» убирает атрибут, и работает media-запрос. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}

export function useThemePreference() {
  const [preference, setPreference] = useState(readStoredTheme);
  useEffect(() => {
    applyTheme(preference);
    storeTheme(preference);
  }, [preference]);
  return [preference, setPreference] as const;
}
