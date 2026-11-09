import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  url: string;
  /** JSON-тело разобрано; не-JSON (например, CSV) лежит строкой как есть. */
  body: unknown;
}

function parseBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') return undefined;
  const contentType = (init.headers as Record<string, string> | undefined)?.['Content-Type'];
  return contentType?.includes('json') ? JSON.parse(init.body) : init.body;
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
    const request: RecordedRequest = { method, url, body: parseBody(init) };
    requests.push(request);
    const handler = routes[`${method} ${url.split('?')[0]}`];
    if (!handler) throw new Error(`Незамоканный запрос: ${method} ${url}`);
    return handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests };
}
