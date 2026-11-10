import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Label } from '@label-stock/shared';
import { jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { makeLabel } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { LabelCardDialog } from './LabelCardDialog';

const NBSP = ' ';

function setup(label: Label) {
  mockFetchRoutes({ [`GET /api/labels/${label.id}`]: () => jsonResponse(200, label) });
  const onDispose = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <LabelCardDialog
      labelId={label.id}
      initialLabel={label}
      onClose={() => {}}
      onOperationDone={() => {}}
      onEdit={() => {}}
      onDispose={onDispose}
    />,
  );
  return { onDispose, user };
}

const disposeButton = () => screen.queryByRole('button', { name: 'Заявка на утилизацию' });

describe('LabelCardDialog: старый макет', () => {
  it('без старого макета нет ни предупреждения, ни кнопки утилизации', () => {
    setup(makeLabel({ obsoleteQuantity: 0 }));
    expect(disposeButton()).not.toBeInTheDocument();
    expect(screen.queryByText(/Макет менялся:/)).not.toBeInTheDocument();
  });

  it('есть старый макет — предупреждение с количеством текстом и подпись в остатке', () => {
    setup(makeLabel({ quantity: 1_500, obsoleteQuantity: 1_000 }));
    expect(screen.getByText(/^Макет менялся:/).textContent).toBe(
      `Макет менялся: 1${NBSP}000 шт. со старым макетом нужно утилизировать. Списать и переместить их нельзя.`,
    );
    expect(screen.getByText(/^из них к утилизации:/).textContent).toBe(
      `из них к утилизации: 1${NBSP}000`,
    );
  });

  it('кнопка «Заявка на утилизацию» отдаёт позицию наверх', async () => {
    const label = makeLabel({ quantity: 10, obsoleteQuantity: 4 });
    const { onDispose, user } = setup(label);
    await user.click(disposeButton()!);
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onDispose).toHaveBeenCalledWith(expect.objectContaining({ id: label.id }));
  });

  it('кнопка доступна с клавиатуры', async () => {
    const { onDispose, user } = setup(makeLabel({ quantity: 10, obsoleteQuantity: 4 }));
    disposeButton()!.focus();
    await user.keyboard('{Enter}');
    expect(onDispose).toHaveBeenCalledTimes(1);
  });

  it('удалённая позиция со старым макетом — кнопки утилизации нет', () => {
    setup(makeLabel({ quantity: 10, obsoleteQuantity: 4, deletedAt: '2026-11-02T10:00:00.000Z' }));
    expect(disposeButton()).not.toBeInTheDocument();
    expect(screen.getByText(/Позиция удалена/)).toBeInTheDocument();
  });

  it('форма операций в карточке содержит флажок «Макет менялся»', () => {
    setup(makeLabel());
    expect(screen.getByRole('checkbox', { name: 'Макет менялся' })).not.toBeChecked();
  });
});
