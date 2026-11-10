import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIsoDate } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { makeLabel, makeMovement, makeMovementResult } from '../../test/fixtures';
import { formatQuantity } from '../../shared/format';
import { renderWithProviders } from '../../test/render';
import { StockOperationForm } from './StockOperationForm';

const LABEL = makeLabel();
const MOVEMENTS_ROUTE = `POST /api/labels/${LABEL.id}/movements`;

function setup(
  response: () => Response | Promise<Response> = () =>
    jsonResponse(201, makeMovementResult({ quantity: 1_170 }, makeMovement())),
) {
  const { requests, fetchMock } = mockFetchRoutes({ [MOVEMENTS_ROUTE]: response });
  const onDone = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<StockOperationForm label={LABEL} onDone={onDone} />);
  const amount = screen.getByRole('textbox', { name: 'Количество, шт.' });
  return { requests, fetchMock, onDone, user, amount };
}

describe('StockOperationForm', () => {
  it('Enter в поле количества — списание с отрицательной дельтой', async () => {
    const { requests, onDone, user, amount } = setup();
    await user.type(amount, '30{Enter}');
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(requests).toEqual([
      {
        method: 'POST',
        url: `/api/labels/${LABEL.id}/movements`,
        body: { reason: 'consumption', delta: -30 },
      },
    ]);
    expect(onDone).toHaveBeenCalledWith(
      'consumption',
      expect.objectContaining({ movement: expect.anything() }),
    );
  });

  it('кнопка «Списать»', async () => {
    const { requests, onDone, user, amount } = setup();
    await user.type(amount, '5');
    await user.click(screen.getByRole('button', { name: 'Списать' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('consumption', expect.anything()));
    expect(requests[0]?.body).toEqual({ reason: 'consumption', delta: -5 });
  });

  it('кнопка «Добавить» — положительная дельта с датой и комментарием', async () => {
    const { requests, onDone, user, amount } = setup();
    await user.type(amount, '500');
    await user.type(screen.getByRole('textbox', { name: 'Комментарий' }), '  тираж  ');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('print', expect.anything()));
    expect(requests[0]?.body).toEqual({
      reason: 'print',
      delta: 500,
      printedAt: todayIsoDate(),
      layoutChanged: false,
      comment: 'тираж',
    });
  });

  describe('флажок «Макет менялся»', () => {
    const checkbox = () => screen.getByRole('checkbox', { name: 'Макет менялся' });

    it('по умолчанию снят, подписан и связан с подсказкой', () => {
      setup();
      expect(checkbox()).not.toBeChecked();
      expect(checkbox()).toHaveAccessibleDescription('Отметьте при допечатке по новому макету');
    });

    it('отмеченный — подсказка называет остаток, который уйдёт в утилизацию', async () => {
      const { user } = setup();
      await user.click(checkbox());
      expect(checkbox()).toBeChecked();
      expect(checkbox()).toHaveAccessibleDescription(
        `При «Добавить» старый остаток ${formatQuantity(LABEL.quantity)} шт. уйдёт в утилизацию`,
      );
    });

    it('переключается с клавиатуры пробелом', async () => {
      const { user } = setup();
      checkbox().focus();
      await user.keyboard(' ');
      expect(checkbox()).toBeChecked();
      await user.keyboard(' ');
      expect(checkbox()).not.toBeChecked();
    });

    it('отмеченный уходит в допечатку как layoutChanged: true', async () => {
      const { requests, onDone, user, amount } = setup();
      await user.type(amount, '200');
      await user.click(checkbox());
      await user.click(screen.getByRole('button', { name: 'Добавить' }));
      await waitFor(() => expect(onDone).toHaveBeenCalledWith('print', expect.anything()));
      expect(requests[0]?.body).toMatchObject({ reason: 'print', delta: 200, layoutChanged: true });
    });

    it('отмечен и снят обратно — уходит layoutChanged: false', async () => {
      const { requests, onDone, user, amount } = setup();
      await user.type(amount, '200');
      await user.click(checkbox());
      await user.click(checkbox());
      await user.click(screen.getByRole('button', { name: 'Добавить' }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(requests[0]?.body).toMatchObject({ layoutChanged: false });
    });

    it('при списании флажок не уходит в запрос', async () => {
      const { requests, onDone, user, amount } = setup();
      await user.click(checkbox());
      await user.type(amount, '5{Enter}');
      await waitFor(() => expect(onDone).toHaveBeenCalledWith('consumption', expect.anything()));
      expect(requests[0]?.body).toEqual({ reason: 'consumption', delta: -5 });
    });

    it('422 OBSOLETE_STOCK при списании показывается в role=alert', async () => {
      const message = 'Можно взять не больше 10 шт.: ещё 5 шт. со старым макетом ждут утилизации';
      const { onDone, user, amount } = setup(() => errorResponse(422, 'OBSOLETE_STOCK', message));
      await user.type(amount, '12{Enter}');
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(onDone).not.toHaveBeenCalled();
    });
  });

  it('кнопок операций две: «Списать» и «Добавить», инвентаризации нет', () => {
    setup();
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Списать', 'Добавить']);
  });

  it('0 для «Добавить» — «Укажите количество больше нуля» без запроса', async () => {
    const { fetchMock, user, amount } = setup();
    await user.type(amount, '0');
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите количество больше нуля');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('422 — «Остаток не может уйти в минус» в role=alert', async () => {
    const { onDone, user, amount } = setup(() =>
      errorResponse(422, 'NEGATIVE_STOCK', 'Остаток не может уйти в минус'),
    );
    await user.type(amount, '99999{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Остаток не может уйти в минус');
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription('Остаток не может уйти в минус');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('пустое количество — ошибка без запроса', async () => {
    const { fetchMock, onDone, user, amount } = setup();
    await user.type(amount, '{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Только целое число не меньше нуля');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it.each([
    ['буквы', 'abc'],
    ['дробное', '1.5'],
    ['отрицательное', '-3'],
  ])('%s количество — ошибка без запроса', async (_name, value) => {
    const { fetchMock, user, amount } = setup();
    await user.type(amount, `${value}{Enter}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Только целое число не меньше нуля');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('0 для списания — «Укажите количество больше нуля» без запроса', async () => {
    const { fetchMock, user, amount } = setup();
    await user.type(amount, '0{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите количество больше нуля');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ошибка исчезает после успешной операции', async () => {
    const { onDone, user, amount } = setup();
    await user.type(amount, '{Enter}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.type(amount, '3{Enter}');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(amount).toHaveAttribute('aria-invalid', 'false');
  });

  it('обрыв сети — «Нет связи с сервером»', async () => {
    const { user, amount } = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    await user.type(amount, '3{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
  });

  it('пока запрос идёт, кнопки заблокированы: двойной Enter не шлёт второй запрос', async () => {
    let resolve: (response: Response) => void = () => {};
    const { fetchMock, user, amount } = setup(
      () => new Promise<Response>((done) => (resolve = done)),
    );
    await user.type(amount, '3{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Списать' })).toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Добавить' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(jsonResponse(201, makeMovementResult()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Списать' })).toBeEnabled());
  });

  it('поле количества помечено data-autofocus для диалога', () => {
    const { amount } = setup();
    expect(amount).toHaveAttribute('data-autofocus');
    expect(amount).toHaveAttribute('inputmode', 'numeric');
  });
});
