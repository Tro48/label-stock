import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { createQueryClient } from './shared/api/query-client';
import { NotificationsProvider } from './shared/ui/notifications';
import './styles/global.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден элемент #root');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <NotificationsProvider>
        <App />
      </NotificationsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
