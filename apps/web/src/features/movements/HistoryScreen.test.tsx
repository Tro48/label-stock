import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MovementListItem } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { renderWithProviders } from '../../test/render';
import { HistoryScreen } from './HistoryScreen';

const movement: MovementListItem = {
  id: 'movement-1',
  labelId: 'label-1',
  delta: -5,
  quantityAfter: 95,
  reason: 'consumption',
  comment: 'Заказ',
  createdAt: '2026-11-17T10:00:00.000Z',
  label: {
    id: 'label-1',
    counterparty: { id: 'counterparty-1', name: 'Ромашка' },
    layoutNumber: '00123',
    barcode: 'ABC123456',
    deletedAt: null,
  },
};

function page(items: MovementListItem[] = [movement]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe('HistoryScreen', () => {
  it('показывает операцию и ищет по введённому значению с debounce', async () => {
    const { requests } = mockFetchRoutes({
      'GET /api/movements': () => jsonResponse(200, page()),
    });
    renderWithProviders(<HistoryScreen />);

    expect(await screen.findByText('Списание')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'История изменений' })).toBeInTheDocument();
    expect(screen.getByText('00123')).toBeInTheDocument();
    expect(screen.getByText('ABC123456')).toBeInTheDocument();
    expect(screen.getByText('−5')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();

    const input = screen.getByRole('searchbox', { name: 'Поиск по истории' });
    fireEvent.change(input, { target: { value: ' 00123 ' } });
    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            new URL(request.url, 'http://localhost').searchParams.get('search') === '00123',
        ),
      ).toBe(true);
    });
  });

  it('показывает пустой результат поиска', async () => {
    mockFetchRoutes({
      'GET /api/movements': ({ url }) =>
        jsonResponse(
          200,
          new URL(url, 'http://localhost').searchParams.has('search') ? page([]) : page(),
        ),
    });
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Списание')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по истории' }), {
      target: { value: '00123' },
    });
    expect(
      await screen.findByText('Ничего не найдено. Измените условия поиска.'),
    ).toBeInTheDocument();
  });

  it('показывает пустой журнал', async () => {
    mockFetchRoutes({ 'GET /api/movements': () => jsonResponse(200, page([])) });
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Изменений остатка пока не было.')).toBeInTheDocument();
  });

  it('сбрасывает страницу при изменении поиска', async () => {
    const { requests } = mockFetchRoutes({
      'GET /api/movements': ({ url }) => {
        const params = new URL(url, 'http://localhost').searchParams;
        return jsonResponse(200, {
          items: [movement],
          total: 100,
          page: Number(params.get('page') ?? 1),
          pageSize: 50,
        });
      },
    });
    renderWithProviders(<HistoryScreen />);
    await screen.findByText('Списание');
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    await waitFor(() => {
      expect(requests.some((request) => request.url.includes('page=2'))).toBe(true);
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по истории' }), {
      target: { value: '00123' },
    });
    await waitFor(() => {
      expect(
        requests.some((request) => {
          const params = new URL(request.url, 'http://localhost').searchParams;
          return params.get('search') === '00123' && params.get('page') === '1';
        }),
      ).toBe(true);
    });
  });

  it('показывает загрузку и ошибку запроса', async () => {
    mockFetchRoutes({
      'GET /api/movements': () => errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка'),
    });
    renderWithProviders(<HistoryScreen />);
    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
  });
});
