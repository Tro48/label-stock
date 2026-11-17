import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { renderWithProviders } from '../../test/render';
import { LabelsToolbar } from './LabelsToolbar';

function setup(initialCounterpartyName = '') {
  mockFetchRoutes({ 'GET /api/counterparties': () => jsonResponse(200, []) });

  function Toolbar() {
    const [counterpartyName, setCounterpartyName] = useState(initialCounterpartyName);
    return (
      <LabelsToolbar
        searchRef={null}
        search=""
        onSearchChange={() => {}}
        counterpartyName={counterpartyName}
        onCounterpartyNameChange={setCounterpartyName}
        onCreate={() => {}}
        onMergeDuplicates={() => {}}
      />
    );
  }

  renderWithProviders(<Toolbar />);
}

describe('LabelsToolbar: фильтр контрагента', () => {
  it('заполненное поле «Ромашка»: пользовательская кнопка очистки «Очистить контрагента» отсутствует', () => {
    setup('Ромашка');
    expect(screen.queryByRole('button', { name: 'Очистить контрагента' })).not.toBeInTheDocument();
  });

  it('пустое поле: пользовательская кнопка очистки «Очистить контрагента» отсутствует, чекбокс «Только нулевые» не отображается', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Очистить контрагента' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Только нулевые' })).not.toBeInTheDocument();
  });

  it('поле контрагента — поисковое (type="search"), как и общее поле поиска', () => {
    setup('Ромашка');
    const searchField = screen.getByRole('searchbox', { name: 'Найти или отсканировать штрихкод' });
    const counterpartyField = screen.getByRole('combobox', { name: 'Контрагент' });
    expect(searchField).toHaveAttribute('type', 'search');
    expect(counterpartyField).toHaveAttribute('type', 'search');
  });
});
