import { useSyncExternalStore } from 'react';

export type Route = 'stock' | 'deleted';

export const ROUTE_HREFS: Readonly<Record<Route, string>> = {
  stock: '#/',
  deleted: '#/deleted',
};

function readRoute(): Route {
  return window.location.hash === ROUTE_HREFS.deleted ? 'deleted' : 'stock';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** Два экрана — хватает hash-маршрутизации без библиотеки; ссылки остаются обычными <a>. */
export function useHashRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute, () => 'stock');
}
