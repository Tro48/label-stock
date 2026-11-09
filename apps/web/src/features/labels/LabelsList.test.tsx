import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ApiError, NETWORK_ERROR_CODE } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/query-client';
import { ErrorAlert } from '../../shared/ui/ErrorAlert';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { makeLabel, makePage } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { render } from '@testing-library/react';
import { LabelsList } from './LabelsList';

function renderList(queryClient?: QueryClient) {
  return renderWithProviders(
    <LabelsList
      caption="Позиции"
      params={{ search: 'ром', page: 1 }}
      sortState={{ sort: 'counterparty', order: 'asc' }}
      onSortChange={() => {}}
      onPageChange={() => {}}
      emptyState="Пока нет ни одной позиции — добавьте первую"
      renderActions={() => null}
    />,
    queryClient,
  );
}

describe('LabelsList', () => {
  it('показывает загрузку, пока нет ответа', () => {
    mockFetchRoutes({ 'GET /api/labels': () => new Promise<Response>(() => {}) });
    renderList();
    expect(screen.getByText('Загружаем…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('передаёт параметры списка в запрос', async () => {
    const { requests } = mockFetchRoutes({
      'GET /api/labels': () => jsonResponse(200, makePage([makeLabel()])),
    });
    renderList();
    await screen.findByRole('table');
    expect(requests[0]?.url).toBe('/api/labels?search=%D1%80%D0%BE%D0%BC&page=1');
  });

  it('данные — таблица с числом позиций в caption', async () => {
    mockFetchRoutes({
      'GET /api/labels': () => jsonResponse(200, makePage([makeLabel()], 120)),
    });
    renderList();
    expect(await screen.findByRole('table', { name: 'Позиции: 120' })).toBeInTheDocument();
    expect(screen.queryByText('Загружаем…')).not.toBeInTheDocument();
  });

  it('пустой список — текст emptyState вместо таблицы', async () => {
    mockFetchRoutes({ 'GET /api/labels': () => jsonResponse(200, makePage([])) });
    renderList();
    expect(
      await screen.findByText('Пока нет ни одной позиции — добавьте первую'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('ошибка сервера — сообщение в role=alert', async () => {
    mockFetchRoutes({
      'GET /api/labels': () => errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера'),
    });
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка сервера');
    expect(screen.queryByText('Загружаем…')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('сетевая ошибка во время автоповтора — «Нет связи с сервером, повторяем…»', async () => {
    const { fetchMock } = mockFetchRoutes({
      'GET /api/labels': () => Promise.reject(new TypeError('Failed to fetch')),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetry, retryDelay: 5 } },
    });
    renderList(queryClient);
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером, повторяем…');
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером, повторяем…');
    expect(screen.queryByText('Загружаем…')).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('после восстановления связи ошибка исчезает и появляется таблица', async () => {
    let attempt = 0;
    mockFetchRoutes({
      'GET /api/labels': () => {
        attempt += 1;
        if (attempt < 3) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(jsonResponse(200, makePage([makeLabel()])));
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: shouldRetry, retryDelay: 5 } },
    });
    renderList(queryClient);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    queryClient.clear();
  });
});

describe('ErrorAlert', () => {
  const networkError = new ApiError(0, NETWORK_ERROR_CODE, 'Нет связи с сервером');

  it('без ошибки ничего не рендерит', () => {
    const { container } = render(<ErrorAlert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('сетевая ошибка при повторе — «повторяем…»', () => {
    render(<ErrorAlert error={networkError} retrying />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером, повторяем…');
  });

  it('сетевая ошибка без повтора — просто «Нет связи с сервером»', () => {
    render(<ErrorAlert error={networkError} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Нет связи с сервером$/);
  });

  it('ошибка сервера при повторе — текст сервера, а не «повторяем»', () => {
    render(<ErrorAlert error={new ApiError(503, 'X', 'Сервис недоступен')} retrying />);
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис недоступен');
  });

  it('не ApiError — общий текст', () => {
    render(<ErrorAlert error={new Error('stack trace')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так. Попробуйте ещё раз');
  });
});
