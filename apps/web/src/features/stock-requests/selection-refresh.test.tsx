import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Label } from '@label-stock/shared';
import { jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { makeLabel, makePage } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { LabelsList } from '../labels/LabelsList';
import { StockRequestDialog } from './StockRequestDialog';
import { useLabelSelection, type LabelSelection } from './use-label-selection';

const BEFORE = makeLabel({ id: 'a', layoutNumber: '101', quantity: 100, obsoleteQuantity: 0 });
const AFTER_LAYOUT_CHANGE = {
  ...BEFORE,
  quantity: 150,
  obsoleteQuantity: 100,
  updatedAt: '2026-11-03T10:00:00.000Z',
};
const OTHER = makeLabel({
  id: 'b',
  layoutNumber: '202',
  counterparty: { id: 'cp-2', name: 'Лютик' },
});

/** Экран в миниатюре: список с выбором и заявка из выбранного, как в StockScreen. */
function Screen({ onRender }: { onRender?: (selection: LabelSelection) => void }) {
  const selection = useLabelSelection();
  const [disposalLabels, setDisposalLabels] = useState<readonly Label[]>();
  onRender?.(selection);
  return (
    <>
      <button type="button" onClick={() => setDisposalLabels(selection.labels)}>
        Открыть утилизацию
      </button>
      <LabelsList
        caption="Позиции"
        params={{ page: 1 }}
        sortState={{ sort: 'counterparty', order: 'asc' }}
        onSortChange={() => {}}
        onPageChange={() => {}}
        emptyState="Пусто"
        renderActions={() => null}
        selection={selection}
      />
      {disposalLabels && (
        <StockRequestDialog
          kind="disposal"
          labels={disposalLabels}
          onClose={() => setDisposalLabels(undefined)}
          onCreated={() => {}}
        />
      )}
    </>
  );
}

function setup(pages: Label[][]) {
  let call = 0;
  const { fetchMock } = mockFetchRoutes({
    'GET /api/labels': () =>
      jsonResponse(200, makePage(pages[Math.min(call++, pages.length - 1)]!)),
  });
  const renders: LabelSelection[] = [];
  const { queryClient } = renderWithProviders(<Screen onRender={(value) => renders.push(value)} />);
  return { fetchMock, queryClient, renders, user: userEvent.setup() };
}

const rowCheckbox = (title: string) => screen.getByRole('checkbox', { name: `Выбрать: ${title}` });

beforeEach(() => {
  vi.stubGlobal('print', vi.fn());
});

describe('выбор обновляется при перечитывании списка', () => {
  it('позиция выбрана до смены макета: в заявке на утилизацию она есть, а не в «нечего утилизировать»', async () => {
    const { queryClient, fetchMock, user } = setup([
      [BEFORE, OTHER],
      [AFTER_LAYOUT_CHANGE, OTHER],
    ]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 101' }));

    // Допечатка со сменой макета прошла в карточке, список перечитался.
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText(/из них к утилизации/);

    await user.click(screen.getByRole('button', { name: 'Открыть утилизацию' }));
    const dialog = screen.getByRole('dialog', { name: 'Заявка на утилизацию' });
    expect(within(dialog).getByRole('table', { name: 'Позиции заявки: 1' })).toBeInTheDocument();
    expect(within(dialog).getByRole('row', { name: /101/ })).toHaveTextContent('100');
    expect(within(dialog).queryByText(/Нечего утилизировать/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Списать и распечатать' })).toBeEnabled();
  });

  it('без перечитывания снимок старый — контрольный случай для сценария выше', async () => {
    const { user } = setup([[BEFORE, OTHER]]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 101' }));
    await user.click(screen.getByRole('button', { name: 'Открыть утилизацию' }));
    expect(screen.getByText('Нечего утилизировать, в заявку не попали: 101')).toBeInTheDocument();
  });

  it('невыбранная позиция после перечитывания в выбор не попадает', async () => {
    const { queryClient, fetchMock, renders, user } = setup([
      [BEFORE, OTHER],
      [AFTER_LAYOUT_CHANGE, OTHER],
    ]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 202' }));
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText(/из них к утилизации/);
    expect(renders.at(-1)!.labels.map((label) => label.id)).toEqual(['b']);
    expect(rowCheckbox('101')).not.toBeChecked();
  });

  it('эффект не зацикливается: после загрузки рендеры прекращаются, запрос один', async () => {
    const { fetchMock, renders, user } = setup([[BEFORE, OTHER]]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 101' }));
    const settled = renders.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(renders.length).toBe(settled);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('перечитали с тем же updatedAt: объект выбора тот же, лишнего обновления нет', async () => {
    // Ответ другой (комментарий), но updatedAt прежний — подменять нечего.
    const sameVersion = { ...BEFORE, comment: 'другой ответ, та же версия' };
    const { queryClient, fetchMock, renders, user } = setup([
      [BEFORE, OTHER],
      [sameVersion, OTHER],
    ]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 101' }));
    const selectionBefore = renders.at(-1)!;
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(renders.at(-1)).toBe(selectionBefore);
    expect(renders.at(-1)!.labels[0]).toBe(selectionBefore.labels[0]);
  });

  it('несколько перечитываний подряд с новыми версиями — выбор каждый раз свежий, без зацикливания', async () => {
    const versions = [1, 2, 3].map((version) => ({
      ...BEFORE,
      quantity: 100 + version,
      updatedAt: `2026-11-0${version + 2}T10:00:00.000Z`,
    }));
    const { queryClient, fetchMock, renders, user } = setup([
      [BEFORE],
      ...versions.map((v) => [v]),
    ]);
    await user.click(await screen.findByRole('checkbox', { name: 'Выбрать: 101' }));
    for (const [index, version] of versions.entries()) {
      await act(() => queryClient.invalidateQueries());
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(index + 2));
      await waitFor(() => expect(renders.at(-1)!.labels[0]?.quantity).toBe(version.quantity));
    }
    const settled = renders.length;
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(renders.length).toBe(settled);
  });
});
