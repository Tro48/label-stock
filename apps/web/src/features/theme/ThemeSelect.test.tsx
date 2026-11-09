import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeSelect } from './ThemeSelect';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const select = () => screen.getByRole('combobox', { name: 'Тема' });

describe('ThemeSelect', () => {
  it('select с подписью «Тема» и тремя вариантами, по умолчанию «Как в системе»', () => {
    render(<ThemeSelect />);
    expect(select()).toHaveDisplayValue('Как в системе');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Как в системе',
      'Светлая',
      'Тёмная',
    ]);
  });

  it('показывает сохранённую тему', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeSelect />);
    expect(select()).toHaveDisplayValue('Тёмная');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('выбор темы ставит data-theme и пишет ключ', async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.selectOptions(select(), 'Тёмная');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.selectOptions(select(), 'Светлая');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('«Как в системе» убирает data-theme и удаляет ключ', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.selectOptions(select(), 'Как в системе');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('достижим с клавиатуры', async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.tab();
    expect(select()).toHaveFocus();
  });

  it('localStorage падает — выбор всё равно применяется', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Квота исчерпана', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.selectOptions(select(), 'Тёмная');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(select()).toHaveDisplayValue('Тёмная');
  });
});
