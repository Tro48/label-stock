import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, type TabItem } from './Tabs';

const ITEMS: TabItem[] = [
  { id: 'operations', label: 'Операции', content: <p>Форма операций</p> },
  { id: 'history', label: 'История', content: <p>Журнал</p> },
  { id: 'info', label: 'Сведения', content: <p>Данные позиции</p> },
];

function renderTabs(items: readonly TabItem[] = ITEMS) {
  render(<Tabs label="Разделы карточки" items={items} />);
  return {
    tab: (name: string) => screen.getByRole('tab', { name }),
  };
}

function expectSelected(name: string) {
  for (const tab of screen.getAllByRole('tab')) {
    const selected = tab.textContent === name;
    expect(tab).toHaveAttribute('aria-selected', String(selected));
    expect(tab).toHaveAttribute('tabindex', selected ? '0' : '-1');
  }
}

describe('Tabs', () => {
  it('tablist с именем, первая вкладка активна, видна только её панель', () => {
    const { tab } = renderTabs();
    expect(screen.getByRole('tablist', { name: 'Разделы карточки' })).toBeInTheDocument();
    expectSelected('Операции');
    const panel = screen.getByRole('tabpanel', { name: 'Операции' });
    expect(panel).toHaveTextContent('Форма операций');
    expect(tab('Операции')).toHaveAttribute('aria-controls', panel.id);
    expect(screen.queryByText('Журнал')).not.toBeInTheDocument();
  });

  it('клик переключает вкладку', async () => {
    const { tab } = renderTabs();
    await userEvent.click(tab('История'));
    expectSelected('История');
    expect(screen.getByRole('tabpanel', { name: 'История' })).toHaveTextContent('Журнал');
  });

  it('стрелка вправо переходит на следующую и ставит фокус, с последней — на первую', async () => {
    const user = userEvent.setup();
    const { tab } = renderTabs();
    tab('Операции').focus();
    await user.keyboard('{ArrowRight}');
    expectSelected('История');
    expect(tab('История')).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expectSelected('Операции');
    expect(tab('Операции')).toHaveFocus();
  });

  it('стрелка влево с первой — на последнюю', async () => {
    const user = userEvent.setup();
    const { tab } = renderTabs();
    tab('Операции').focus();
    await user.keyboard('{ArrowLeft}');
    expectSelected('Сведения');
    expect(tab('Сведения')).toHaveFocus();
  });

  it('Home и End', async () => {
    const user = userEvent.setup();
    const { tab } = renderTabs();
    tab('Операции').focus();
    await user.keyboard('{End}');
    expectSelected('Сведения');
    await user.keyboard('{Home}');
    expectSelected('Операции');
    expect(tab('Операции')).toHaveFocus();
  });

  it('прочие клавиши ничего не переключают', async () => {
    const user = userEvent.setup();
    const { tab } = renderTabs();
    tab('Операции').focus();
    await user.keyboard('{ArrowDown}a');
    expectSelected('Операции');
  });

  it('Tab уходит с активной вкладки сразу в панель/дальше, минуя неактивные', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tabs
          label="Разделы"
          items={[
            { id: 'a', label: 'А', content: <button type="button">Внутри</button> },
            { id: 'b', label: 'Б', content: null },
          ]}
        />
      </>,
    );
    await user.tab();
    expect(screen.getByRole('tab', { name: 'А' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Внутри' })).toHaveFocus();
  });

  it('пустой список — без падения', () => {
    renderTabs([]);
    expect(screen.getByRole('tablist')).toBeEmptyDOMElement();
  });

  it('одна вкладка: стрелки оставляют её активной', async () => {
    const user = userEvent.setup();
    const { tab } = renderTabs([ITEMS[0]!]);
    tab('Операции').focus();
    await user.keyboard('{ArrowRight}{ArrowLeft}');
    expectSelected('Операции');
  });
});
