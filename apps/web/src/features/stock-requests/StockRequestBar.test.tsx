import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockRequestBar } from './StockRequestBar';

function setup(count: number) {
  const onCreate = vi.fn();
  const onClear = vi.fn();
  render(<StockRequestBar count={count} onCreate={onCreate} onClear={onClear} />);
  return { onCreate, onClear, user: userEvent.setup() };
}

describe('StockRequestBar', () => {
  it('ничего не выбрано — панели нет', () => {
    setup(0);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('панель — именованный ориентир с числом выбранных', () => {
    setup(3);
    expect(screen.getByRole('region', { name: 'Выбрано позиций: 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Выбрано позиций: 3' })).toBeInTheDocument();
  });

  it.each([
    ['Заявка на перемещение', 'transfer'],
    ['Заявка на утилизацию', 'disposal'],
  ])('«%s» открывает заявку %s', async (name, kind) => {
    const { onCreate, user } = setup(1);
    await user.click(screen.getByRole('button', { name }));
    expect(onCreate).toHaveBeenCalledWith(kind);
  });

  it('«Снять выбор»', async () => {
    const { onClear, user } = setup(1);
    await user.click(screen.getByRole('button', { name: 'Снять выбор' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('кнопки в порядке Tab: перемещение, утилизация, снять выбор', async () => {
    const { user } = setup(2);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Заявка на перемещение' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Заявка на утилизацию' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Снять выбор' })).toHaveFocus();
  });
});
