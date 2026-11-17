import { useSyncExternalStore } from 'react';

export type Route = 'stock' | 'history' | 'deleted';

export const ROUTE_HREFS: Readonly<Record<Route, string>> = {
  stock: '#/',
  history: '#/history',
  deleted: '#/deleted',
};

function readRoute(): Route {
  if (window.location.hash === ROUTE_HREFS.history) return 'history';
  if (window.location.hash === ROUTE_HREFS.deleted) return 'deleted';
  return 'stock';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Три экрана — хватает hash-маршрутизации без библиотеки; ссылки остаются обычными <a>. */
export function useHashRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute, () => 'stock');
}
