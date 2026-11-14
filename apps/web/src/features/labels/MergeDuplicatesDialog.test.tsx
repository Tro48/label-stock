import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  errorResponse,
  jsonResponse,
  mockFetchRoutes,
  type RecordedRequest,
} from '../../test/fetch-mock';
import { renderWithProviders } from '../../test/render';
import { MergeDuplicatesDialog } from './MergeDuplicatesDialog';

type Handler = Parameters<typeof mockFetchRoutes>[0][string];

function setup(routes: Record<string, Handler> = {}) {
  const fetchMocks = mockFetchRoutes({
    'POST /api/labels/merge-duplicates': () =>
      jsonResponse(200, { groups: 0, merged: 0, movedQuantity: 0 }),
    ...routes,
  });
  const onClose = vi.fn();
  const onMerged = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<MergeDuplicatesDialog onClose={onClose} onMerged={onMerged} />);
  return { ...fetchMocks, onClose, onMerged, user };
}

const writes = (requests: RecordedRequest[]) => requests.filter((r) => r.method !== 'GET');

describe('MergeDuplicatesDialog', () => {
  it('подтверждение вызывает POST /labels/merge-duplicates и передаёт отчёт в onMerged', async () => {
    const report = { groups: 2, merged: 3, movedQuantity: 53 };
    const { user, requests, onMerged, onClose } = setup({
      'POST /api/labels/merge-duplicates': () => jsonResponse(200, report),
    });
    expect(
      screen.getByRole('dialog', { name: 'Объединить дубли по номеру макета?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Объединить' }));

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith(report));
    expect(writes(requests)).toEqual([
      { method: 'POST', url: '/api/labels/merge-duplicates', body: undefined },
    ]);
    // Закрывает диалог родитель, получив отчёт: сам диалог onClose не вызывает.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ошибка запроса — текст в role=alert, onMerged не вызывается', async () => {
    const { user, onMerged } = setup({
      'POST /api/labels/merge-duplicates': () =>
        errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка'),
    });
    await user.click(screen.getByRole('button', { name: 'Объединить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
    expect(onMerged).not.toHaveBeenCalled();
  });

  it('«Отмена» закрывает без запросов на запись', async () => {
    const { user, requests, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(writes(requests)).toEqual([]);
  });
});
