import { useState } from 'react';
import type { ImportResult } from '@label-stock/shared';
import { ImportDialog } from './features/import/ImportDialog';
import { DeletedScreen } from './features/labels/DeletedScreen';
import { StockScreen } from './features/labels/StockScreen';
import { ThemeSelect } from './features/theme/ThemeSelect';
import { useNotifications } from './shared/ui/notifications';
import { ROUTE_HREFS, useHashRoute, type Route } from './shared/use-hash-route';

const NAV_ITEMS: readonly { route: Route; text: string }[] = [
  { route: 'stock', text: 'Остатки' },
  { route: 'deleted', text: 'Удалённые' },
];

export function App() {
  const route = useHashRoute();
  const [importOpen, setImportOpen] = useState(false);
  const { notify } = useNotifications();

  const handleImported = (result: ImportResult) => {
    setImportOpen(false);
    notify(
      `Загружено из CSV: создано ${result.created}, обновлено ${result.updated}, без изменений ${result.unchanged}`,
    );
  };

  return (
    <>
      <a href="#main" className="skip-link">
        Перейти к содержимому
      </a>
      <header className="app-header">
        <h1 className="app-header__title">Остатки этикетки</h1>
        <nav aria-label="Разделы" className="app-nav">
          <ul className="app-nav__list">
            {NAV_ITEMS.map(({ route: itemRoute, text }) => (
              <li key={itemRoute}>
                <a
                  href={ROUTE_HREFS[itemRoute]}
                  className="app-nav__link"
                  aria-current={route === itemRoute ? 'page' : undefined}
                >
                  {text}
                </a>
              </li>
            ))}
            <li>
              <a href="/api/export.csv" className="app-nav__link" download>
                Выгрузить в CSV
              </a>
            </li>
          </ul>
        </nav>
        <div className="app-header__tools">
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setImportOpen(true)}
          >
            Загрузить из CSV
          </button>
          <ThemeSelect />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="app-main">
        {route === 'stock' ? <StockScreen /> : <DeletedScreen />}
      </main>
      {importOpen && (
        <ImportDialog onClose={() => setImportOpen(false)} onImported={handleImported} />
      )}
    </>
  );
}
