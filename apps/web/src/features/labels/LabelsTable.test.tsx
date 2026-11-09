import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLabel } from '../../test/fixtures';
import { LabelsTable, type SortState } from './LabelsTable';

const LABELS = [
  makeLabel({ id: 'a', quantity: 1_200 }),
  makeLabel({
    id: 'b',
    counterparty: { id: 'cp-2', name: 'Василёк' },
    layoutNumber: null,
    barcode: null,
    printedAt: '2026-10-15',
    quantity: 0,
  }),
];

function renderTable(sortState: SortState = { sort: 'counterparty', order: 'asc' }) {
  const onSortChange = vi.fn();
  render(
    <LabelsTable
      caption="Позиции: 2"
      labels={LABELS}
      sortState={sortState}
      onSortChange={onSortChange}
      renderActions={(label) => <button type="button">Изменить остаток {label.id}</button>}
    />,
  );
  return { onSortChange };
}

const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) });

describe('LabelsTable', () => {
  it('таблица с caption и строками', () => {
    renderTable();
    expect(screen.getByRole('table', { name: 'Позиции: 2' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('aria-sort только на активной колонке', () => {
    renderTable({ sort: 'quantity', order: 'desc' });
    expect(header('Остаток')).toHaveAttribute('aria-sort', 'descending');
    for (const name of ['Контрагент', '№ макета', 'Штрихкод', 'Печать']) {
      expect(header(name)).not.toHaveAttribute('aria-sort');
    }
  });

  it('asc → ascending', () => {
    renderTable({ sort: 'counterparty', order: 'asc' });
    expect(header('Контрагент')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('клик по активной asc-колонке → desc', async () => {
    const { onSortChange } = renderTable({ sort: 'counterparty', order: 'asc' });
    await userEvent.click(screen.getByRole('button', { name: /Контрагент/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sort: 'counterparty', order: 'desc' });
  });

  it('клик по активной desc-колонке → asc', async () => {
    const { onSortChange } = renderTable({ sort: 'counterparty', order: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: /Контрагент/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sort: 'counterparty', order: 'asc' });
  });

  it('клик по другой колонке → она по возрастанию', async () => {
    const { onSortChange } = renderTable({ sort: 'counterparty', order: 'desc' });
    await userEvent.click(screen.getByRole('button', { name: /Печать/ }));
    expect(onSortChange).toHaveBeenCalledWith({ sort: 'printedAt', order: 'asc' });
  });

  it('стрелка сортировки скрыта от скринридера', () => {
    renderTable();
    expect(screen.getByRole('button', { name: /Контрагент/ })).toHaveAccessibleName('Контрагент');
  });

  it('нулевой остаток подписан текстом «0 — нет в наличии»', () => {
    renderTable();
    const emptyRow = screen.getByRole('row', { name: /Василёк/ });
    expect(within(emptyRow).getByText(/нет в наличии/)).toBeInTheDocument();
    expect(emptyRow).toHaveTextContent('0 — нет в наличии');
  });

  it('пустые номер и штрихкод — прочерк, дата в формате ДД.ММ.ГГГГ, количество с разделителем', () => {
    renderTable();
    const emptyRow = screen.getByRole('row', { name: /Василёк/ });
    expect(within(emptyRow).getAllByText('—')).toHaveLength(2);
    expect(within(emptyRow).getByText('15.10.2026')).toBeInTheDocument();
    const fullRow = screen.getByRole('row', { name: /Ромашка/ });
    expect(within(fullRow).getByText(/^1\s200$/)).toBeInTheDocument();
    expect(fullRow).not.toHaveTextContent('нет в наличии');
  });

  it('действия рендерятся для каждой строки', () => {
    renderTable();
    expect(screen.getByRole('button', { name: 'Изменить остаток a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Изменить остаток b' })).toBeInTheDocument();
  });
});
