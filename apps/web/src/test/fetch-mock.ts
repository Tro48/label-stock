import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

type RouteHandler = (request: RecordedRequest) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  return jsonResponse(status, details ? { code, message, details } : { code, message });
}

/**
 * Подменяет глобальный fetch маршрутизатором: ключ — `METHOD /path` без query string.
 * Незамоканный маршрут роняет запрос, чтобы тест не прошёл молча на лишнем вызове.
 */
export function mockFetchRoutes(routes: Record<string, RouteHandler>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const rawBody = init?.body;
    const request: RecordedRequest = {
      method,
      url,
      body: typeof rawBody === 'string' ? JSON.parse(rawBody) : undefined,
    };
    requests.push(request);
    const handler = routes[`${method} ${url.split('?')[0]}`];
    if (!handler) throw new Error(`Незамоканный запрос: ${method} ${url}`);
    return handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests };
}
