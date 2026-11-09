import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, buildUrl, errorMessage, NETWORK_ERROR_CODE } from './client';
import { errorResponse, jsonResponse } from '../../test/fetch-mock';

function stubFetch(implementation: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Ожидалась ошибка');
}

describe('buildUrl', () => {
  it('без параметров — путь как есть', () => {
    expect(buildUrl('/api/labels')).toBe('/api/labels');
    expect(buildUrl('/api/labels', {})).toBe('/api/labels');
  });

  it('пустые значения не попадают в query string', () => {
    expect(
      buildUrl('/api/labels', { search: '', counterpartyId: undefined, sort: null, page: 2 }),
    ).toBe('/api/labels?page=2');
  });

  it('все параметры пустые — без знака вопроса', () => {
    expect(buildUrl('/api/labels', { search: '', page: undefined })).toBe('/api/labels');
  });

  it('0 и false сохраняются', () => {
    expect(buildUrl('/x', { page: 0, onlyEmpty: false })).toBe('/x?page=0&onlyEmpty=false');
  });

  it('спецсимволы и кириллица экранируются', () => {
    const parsed = new URL(buildUrl('/x', { search: 'a&b=c?#' }), 'http://host');
    expect(parsed.searchParams.get('search')).toBe('a&b=c?#');
    expect([...parsed.searchParams.keys()]).toEqual(['search']);
  });
});

describe('apiRequest', () => {
  it('2xx: возвращает JSON, GET без тела и заголовка Content-Type', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, { id: '1' }));
    await expect(apiRequest('/labels/1', { params: { search: '' } })).resolves.toEqual({ id: '1' });
    expect(fetchMock).toHaveBeenCalledWith('/api/labels/1', {
      method: 'GET',
      signal: null,
      headers: {},
      body: null,
    });
  });

  it('POST сериализует тело и ставит Content-Type', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, { id: '2' }));
    await apiRequest('/labels', { method: 'POST', body: { name: 'Ромашка' } });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe('{"name":"Ромашка"}');
  });

  it('передаёт signal в fetch', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, []));
    const controller = new AbortController();
    await apiRequest('/labels', { signal: controller.signal });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('204: undefined без чтения тела', async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(apiRequest('/labels/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('ошибка в формате {code, message, details} → ApiError с теми же полями', async () => {
    stubFetch(async () =>
      errorResponse(409, 'DUPLICATE', 'Номер занят', { field: 'layoutNumber', conflictingId: 'x' }),
    );
    const error = await catchError(apiRequest('/labels', { method: 'POST', body: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'DUPLICATE',
      message: 'Номер занят',
      details: { field: 'layoutNumber', conflictingId: 'x' },
      isNetworkError: false,
    });
  });

  it('ошибка без details — details undefined', async () => {
    stubFetch(async () => errorResponse(404, 'NOT_FOUND', 'Не найдено'));
    const error = await catchError(apiRequest('/labels/1'));
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND', details: undefined });
  });

  it('ошибка с не-JSON телом → HTTP_ERROR с кодом статуса', async () => {
    stubFetch(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
    const error = await catchError(apiRequest('/labels'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'Ошибка сервера (502)',
    });
  });

  it.each([
    ['без message', { code: 'X' }],
    ['code не строка', { code: 1, message: 'm' }],
    ['null', null],
    ['массив', []],
  ])('JSON не того формата (%s) → HTTP_ERROR', async (_name, body) => {
    stubFetch(async () => jsonResponse(500, body));
    const error = await catchError(apiRequest('/labels'));
    expect(error).toMatchObject({ status: 500, code: 'HTTP_ERROR' });
  });

  it('пустое тело при ошибке → HTTP_ERROR', async () => {
    stubFetch(async () => new Response(null, { status: 500 }));
    const error = await catchError(apiRequest('/labels'));
    expect(error).toMatchObject({ status: 500, code: 'HTTP_ERROR' });
  });

  it('обрыв сети → ApiError NETWORK_ERROR со статусом 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const error = await catchError(apiRequest('/labels'));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0,
      code: NETWORK_ERROR_CODE,
      message: 'Нет связи с сервером',
      isNetworkError: true,
    });
  });

  it('AbortError пробрасывается как есть', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    stubFetch(async () => {
      throw abortError;
    });
    await expect(apiRequest('/labels')).rejects.toBe(abortError);
  });

  it('другое DOMException — сетевая ошибка', async () => {
    stubFetch(async () => {
      throw new DOMException('x', 'NetworkError');
    });
    const error = await catchError(apiRequest('/labels'));
    expect(error).toMatchObject({ code: NETWORK_ERROR_CODE });
  });
});

describe('errorMessage', () => {
  it('ApiError — его сообщение', () => {
    expect(errorMessage(new ApiError(422, 'NEGATIVE_STOCK', 'Остаток не может уйти в минус'))).toBe(
      'Остаток не может уйти в минус',
    );
  });

  it.each([new Error('internal stack'), 'строка', undefined, null])(
    'не ApiError (%s) — общий текст без внутренних деталей',
    (error) => {
      expect(errorMessage(error)).toBe('Что-то пошло не так. Попробуйте ещё раз');
    },
  );
});
