import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { NotificationsProvider } from '../shared/ui/notifications';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** Рендер с провайдерами приложения; без повторов запросов, чтобы ошибки приходили сразу. */
export function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>{children}</NotificationsProvider>
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui, { wrapper }) };
}
