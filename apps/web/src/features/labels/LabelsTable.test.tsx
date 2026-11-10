import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeLabel } from '../../test/fixtures';
import { useLabelSelection, type LabelSelection } from '../stock-requests/use-label-selection';
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

/** Таблица с настоящим выбором: выбранные id выводятся рядом, чтобы проверять состояние. */
function SelectableTable({
  labels = LABELS,
  onSelection,
}: {
  labels?: typeof LABELS;
  onSelection?: (selection: LabelSelection) => void;
}) {
  const selection = useLabelSelection();
  onSelection?.(selection);
  return (
    <>
      <LabelsTable
        caption="Позиции"
        labels={labels}
        sortState={{ sort: 'counterparty', order: 'asc' }}
        onSortChange={() => {}}
        renderActions={() => null}
        selection={selection}
      />
      <output aria-label="Выбрано">{selection.labels.map((label) => label.id).join(',')}</output>
    </>
  );
}

const selected = () => screen.getByRole('status', { name: 'Выбрано' }).textContent;
const selectAll = () => screen.getByRole('checkbox', { name: 'Выбрать все на странице' });

describe('LabelsTable: выбор позиций для заявки', () => {
  it('без selection флажков нет', () => {
    renderTable();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('у каждой строки флажок с подписью по номеру макета, иначе по контрагенту', () => {
    render(<SelectableTable />);
    expect(screen.getByRole('checkbox', { name: 'Выбрать: 00123' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Выбрать: Василёк' })).not.toBeChecked();
    expect(selectAll()).not.toBeChecked();
  });

  it('без номера макета подпись по штрихкоду', () => {
    render(<SelectableTable labels={[makeLabel({ id: 'x', layoutNumber: null })]} />);
    expect(screen.getByRole('checkbox', { name: 'Выбрать: 4600000000017' })).toBeInTheDocument();
  });

  it('флажок строки выбирает и снимает позицию', async () => {
    const user = userEvent.setup();
    render(<SelectableTable />);
    const row = screen.getByRole('checkbox', { name: 'Выбрать: 00123' });
    await user.click(row);
    expect(row).toBeChecked();
    expect(selected()).toBe('a');
    await user.click(row);
    expect(row).not.toBeChecked();
    expect(selected()).toBe('');
  });

  it('все строки выбраны по одной — «Выбрать все» отмечается сам', async () => {
    const user = userEvent.setup();
    render(<SelectableTable />);
    await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
    expect(selectAll()).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Выбрать: Василёк' }));
    expect(selectAll()).toBeChecked();
  });

  it('«Выбрать все на странице» выбирает и снимает все строки', async () => {
    const user = userEvent.setup();
    render(<SelectableTable />);
    await user.click(selectAll());
    expect(selected()).toBe('a,b');
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeChecked();
    await user.click(selectAll());
    expect(selected()).toBe('');
  });

  it('«Выбрать все» снимает только текущую страницу, выбор с других страниц остаётся', async () => {
    const user = userEvent.setup();
    const other = makeLabel({ id: 'other' });
    let selection: LabelSelection | undefined;
    render(<SelectableTable onSelection={(value) => (selection = value)} />);
    act(() => selection!.toggle([other], true));
    await user.click(selectAll());
    expect(selected()).toBe('other,a,b');
    await user.click(selectAll());
    expect(selected()).toBe('other');
  });

  it('пустая страница — «Выбрать все» не отмечен', () => {
    render(<SelectableTable labels={[]} />);
    expect(selectAll()).not.toBeChecked();
  });

  it('флажки переключаются с клавиатуры: Tab и пробел', async () => {
    const user = userEvent.setup();
    render(<SelectableTable />);
    await user.tab();
    expect(selectAll()).toHaveFocus();
    await user.keyboard(' ');
    expect(selected()).toBe('a,b');
  });

  it('флажок — первая ячейка строки: таблица остаётся с тем же числом колонок', () => {
    render(<SelectableTable />);
    const [headerRow, firstRow] = screen.getAllByRole('row');
    expect(within(headerRow!).getAllByRole('columnheader')).toHaveLength(
      within(firstRow!).getAllByRole('cell').length,
    );
    expect(within(within(firstRow!).getAllByRole('cell')[0]!).getByRole('checkbox')).toBeVisible();
  });

  describe('«Выбрать все» в частичном состоянии', () => {
    it('ничего не выбрано — indeterminate false', () => {
      render(<SelectableTable />);
      expect(selectAll()).toHaveProperty('indeterminate', false);
      expect(selectAll()).not.toBePartiallyChecked();
    });

    it('выбрана часть строк — indeterminate true, скринридер слышит «частично»', async () => {
      const user = userEvent.setup();
      render(<SelectableTable />);
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
      expect(selectAll()).toHaveProperty('indeterminate', true);
      expect(selectAll()).toBePartiallyChecked();
      expect(selectAll()).not.toBeChecked();
    });

    it('выбраны все — indeterminate false и отмечен', async () => {
      const user = userEvent.setup();
      render(<SelectableTable />);
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: Василёк' }));
      expect(selectAll()).toHaveProperty('indeterminate', false);
      expect(selectAll()).toBeChecked();
    });

    it('из частичного клик по «Выбрать все» выбирает всё', async () => {
      const user = userEvent.setup();
      render(<SelectableTable />);
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: Василёк' }));
      await user.click(selectAll());
      expect(selected()).toBe('b,a');
      expect(selectAll()).toHaveProperty('indeterminate', false);
    });

    it('сняли одну из всех — снова indeterminate', async () => {
      const user = userEvent.setup();
      render(<SelectableTable />);
      await user.click(selectAll());
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
      expect(selectAll()).toHaveProperty('indeterminate', true);
    });

    it('сняли последнюю — indeterminate false', async () => {
      const user = userEvent.setup();
      render(<SelectableTable />);
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
      await user.click(screen.getByRole('checkbox', { name: 'Выбрать: 00123' }));
      expect(selectAll()).toHaveProperty('indeterminate', false);
    });

    it('выбрана только позиция с другой страницы — на этой странице не частично', () => {
      let selection: LabelSelection | undefined;
      render(<SelectableTable onSelection={(value) => (selection = value)} />);
      act(() => selection!.toggle([makeLabel({ id: 'other' })], true));
      expect(selectAll()).toHaveProperty('indeterminate', false);
    });
  });
});
