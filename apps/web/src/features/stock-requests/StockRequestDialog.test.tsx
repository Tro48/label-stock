import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Label, StockRequestKind, StockRequestResult } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { makeLabel, makeMovement } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { StockRequestDialog } from './StockRequestDialog';

const NBSP = ' ';
const ROUTE = 'POST /api/stock-requests';

const FIRST = makeLabel({
  id: '11111111-1111-4111-8111-111111111111',
  layoutNumber: '101',
  barcode: null,
  quantity: 1_500,
  obsoleteQuantity: 500,
});
const SECOND = makeLabel({
  id: '22222222-2222-4222-8222-222222222222',
  layoutNumber: '202',
  barcode: null,
  counterparty: { id: 'cp-2', name: 'Василёк' },
  quantity: 40,
  obsoleteQuantity: 0,
});
const THIRD = makeLabel({
  id: '33333333-3333-4333-8333-333333333333',
  layoutNumber: '303',
  barcode: null,
  quantity: 9,
  obsoleteQuantity: 9,
});

function makeResult(
  kind: StockRequestKind,
  items: { label: Label; delta: number }[],
): StockRequestResult {
  return {
    kind,
    createdAt: '2026-11-10T09:30:00.000Z',
    items: items.map(({ label, delta }, index) => ({
      label: {
        ...label,
        quantity: label.quantity + delta,
        obsoleteQuantity: kind === 'disposal' ? 0 : label.obsoleteQuantity,
      },
      movement: makeMovement({
        id: `mv-${index}`,
        labelId: label.id,
        delta,
        quantityAfter: label.quantity + delta,
        reason: kind,
      }),
    })),
  };
}

function setup(
  kind: StockRequestKind,
  labels: readonly Label[],
  response: () => Response | Promise<Response> = () =>
    jsonResponse(201, makeResult(kind, [{ label: FIRST, delta: -10 }])),
) {
  const { requests, fetchMock } = mockFetchRoutes({ [ROUTE]: response });
  const onClose = vi.fn();
  const onCreated = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <StockRequestDialog kind={kind} labels={labels} onClose={onClose} onCreated={onCreated} />,
  );
  return { requests, fetchMock, onClose, onCreated, user };
}

const amountInput = (title: string) =>
  screen.getByRole('textbox', { name: `Забрать, шт.: ${title}` });
const removeButton = (title: string) => screen.getByRole('button', { name: `Убрать: ${title}` });
const submitButton = () => screen.getByRole('button', { name: 'Списать и распечатать' });
const rowOf = (title: string) => screen.getByRole('row', { name: new RegExp(title) });

let printMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  printMock = vi.fn();
  vi.stubGlobal('print', printMock);
});

describe('StockRequestDialog: перемещение', () => {
  it('заголовок, подсказка и строки с годным остатком', () => {
    setup('transfer', [FIRST, SECOND]);
    expect(
      screen.getByRole('dialog', { name: 'Заявка на перемещение со склада' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Позиции заявки: 2' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Доступно, шт.' })).toBeInTheDocument();
    expect(within(rowOf('101')).getByText(/^1\s000$/)).toBeInTheDocument();
    expect(within(rowOf('202')).getByText('40')).toBeInTheDocument();
    expect(document.querySelector('form')).toHaveAccessibleDescription(
      'Укажите, сколько забрать. Остаток спишется сразу, затем откроется печать.',
    );
  });

  it('поля количества и кнопки «Убрать» подписаны по позиции', () => {
    setup('transfer', [FIRST, SECOND]);
    expect(amountInput('101')).toHaveAttribute('inputmode', 'numeric');
    expect(amountInput('202')).toBeInTheDocument();
    expect(removeButton('101')).toBeInTheDocument();
    expect(removeButton('202')).toBeInTheDocument();
  });

  it('отправляет количество по каждой позиции в порядке списка', async () => {
    const { requests, user } = setup('transfer', [FIRST, SECOND]);
    await user.type(amountInput('101'), '1000');
    await user.type(amountInput('202'), ' 5 ');
    await user.click(submitButton());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      method: 'POST',
      url: '/api/stock-requests',
      body: {
        kind: 'transfer',
        items: [
          { labelId: FIRST.id, quantity: 1_000 },
          { labelId: SECOND.id, quantity: 5 },
        ],
      },
    });
  });

  it('успех: onCreated, печать один раз, лист заявки, фокус на «Печать»', async () => {
    const result = makeResult('transfer', [
      { label: FIRST, delta: -10 },
      { label: SECOND, delta: -1_000 },
    ]);
    const { onCreated, user } = setup('transfer', [FIRST, SECOND], () => jsonResponse(201, result));
    await user.type(amountInput('101'), '10');
    await user.type(amountInput('202'), '1');
    await user.click(submitButton());

    expect(await within(screen.getByRole('dialog')).findByRole('status')).toHaveTextContent(
      'Остаток списан. Если печать не началась, нажмите «Печать».',
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith(result);
    expect(printMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Печать' })).toHaveFocus();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('лист заявки: нумерация, количество из журнала, итог и дата', async () => {
    const result = makeResult('transfer', [
      { label: FIRST, delta: -10 },
      { label: SECOND, delta: -1_000 },
    ]);
    const { user } = setup('transfer', [FIRST, SECOND], () => jsonResponse(201, result));
    await user.type(amountInput('101'), '10');
    await user.type(amountInput('202'), '1');
    await user.click(submitButton());

    const dialog = await screen.findByRole('dialog');
    const sheet = await within(dialog).findByRole('article');
    expect(sheet).toHaveAccessibleName(/^Заявка на перемещение со склада от /);
    expect(within(sheet).getByRole('heading').querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-11-10T09:30:00.000Z',
    );
    const rows = within(sheet).getAllByRole('row');
    // Заголовок, две позиции, итог.
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('1Ромашка101—');
    expect(within(rows[1]!).getAllByRole('cell').at(-1)!.textContent).toBe('10');
    expect(within(rows[2]!).getAllByRole('cell').at(-1)!.textContent).toBe(`1${NBSP}000`);
    expect(within(rows[3]!).getByRole('rowheader')).toHaveTextContent('Итого');
    expect(within(rows[3]!).getByRole('cell').textContent).toBe(`1${NBSP}010`);
  });

  it('лист для печати рендерится порталом в body, вне окна', async () => {
    const { user } = setup('transfer', [FIRST]);
    await user.type(amountInput('101'), '10');
    await user.click(submitButton());
    await within(screen.getByRole('dialog')).findByRole('status');
    const printSheet = document.body.querySelector(':scope > .print-sheet');
    expect(printSheet).not.toBeNull();
    expect(printSheet!.tagName).toBe('ARTICLE');
    expect(screen.getByRole('dialog').contains(printSheet)).toBe(false);
  });

  it('«Печать» печатает ещё раз, «Готово» закрывает', async () => {
    const { onClose, user } = setup('transfer', [FIRST]);
    await user.type(amountInput('101'), '10');
    await user.click(submitButton());
    await user.click(await screen.findByRole('button', { name: 'Печать' }));
    expect(printMock).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('проверка количества до отправки', () => {
    it('пустое количество: ошибка строки, общая ошибка в role=alert, без запроса', async () => {
      const { fetchMock, onCreated, user } = setup('transfer', [FIRST, SECOND]);
      await user.type(amountInput('202'), '3');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Исправьте количество в отмеченных строках',
      );
      expect(amountInput('101')).toHaveAttribute('aria-invalid', 'true');
      expect(amountInput('101')).toHaveAccessibleDescription('Только целое число не меньше нуля');
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'false');
      expect(amountInput('202')).not.toHaveAccessibleDescription();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(onCreated).not.toHaveBeenCalled();
      expect(printMock).not.toHaveBeenCalled();
    });

    it('больше годного остатка — «Доступно только …»', async () => {
      const { fetchMock, user } = setup('transfer', [FIRST]);
      await user.type(amountInput('101'), '1001');
      await user.click(submitButton());
      const errorId = amountInput('101').getAttribute('aria-describedby')!;
      expect(document.getElementById(errorId)!.textContent).toBe(`Доступно только 1${NBSP}000 шт.`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['ноль', '0', 'Укажите количество больше нуля'],
      ['буквы', 'abc', 'Только целое число не меньше нуля'],
      ['дробное', '1.5', 'Только целое число не меньше нуля'],
      ['отрицательное', '-2', 'Только целое число не меньше нуля'],
    ])('%s — ошибка строки без запроса', async (_name, value, message) => {
      const { fetchMock, user } = setup('transfer', [SECOND]);
      await user.type(amountInput('202'), value);
      await user.click(submitButton());
      expect(amountInput('202')).toHaveAccessibleDescription(message);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('исправленное количество снимает ошибки и отправляет запрос', async () => {
      const { requests, user } = setup('transfer', [SECOND]);
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      await user.type(amountInput('202'), '4');
      await user.click(submitButton());
      await waitFor(() => expect(requests).toHaveLength(1));
      await within(screen.getByRole('dialog')).findByRole('status');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('ошибки сервера', () => {
    it('ошибка с details.labelId — подсвечена строка этой позиции и общий alert', async () => {
      const message = 'Можно взять не больше 40 шт.: ещё 5 шт. со старым макетом ждут утилизации';
      const { onCreated, user } = setup('transfer', [FIRST, SECOND], () =>
        errorResponse(422, 'OBSOLETE_STOCK', message, { labelId: SECOND.id }),
      );
      await user.type(amountInput('101'), '1');
      await user.type(amountInput('202'), '40');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'true');
      expect(amountInput('202')).toHaveAccessibleDescription(message);
      expect(amountInput('101')).toHaveAttribute('aria-invalid', 'false');
      expect(onCreated).not.toHaveBeenCalled();
      expect(printMock).not.toHaveBeenCalled();
      // Введённое не теряется: можно поправить и отправить снова.
      expect(amountInput('202')).toHaveValue('40');
      expect(submitButton()).toBeEnabled();
    });

    it('labelId позиции, которой нет в списке, — только общий alert', async () => {
      const { user } = setup('transfer', [SECOND], () =>
        errorResponse(404, 'NOT_FOUND', 'Позиция не найдена', { labelId: FIRST.id }),
      );
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Позиция не найдена');
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'false');
    });

    it('labelId не строкой — не превращается в ошибку строки', async () => {
      const { user } = setup('transfer', [SECOND], () =>
        errorResponse(422, 'NEGATIVE_STOCK', 'Остаток не может уйти в минус', { labelId: 42 }),
      );
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Остаток не может уйти в минус');
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'false');
    });

    it('ошибка без details сбрасывает прежние ошибки строк', async () => {
      let call = 0;
      const { user } = setup('transfer', [SECOND], () =>
        call++ === 0
          ? errorResponse(422, 'NEGATIVE_STOCK', 'Остаток не может уйти в минус', {
              labelId: SECOND.id,
            })
          : errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера'),
      );
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      await waitFor(() => expect(amountInput('202')).toHaveAttribute('aria-invalid', 'true'));
      await user.click(submitButton());
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Внутренняя ошибка сервера'),
      );
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'false');
    });

    it('обрыв сети — «Нет связи с сервером», печати нет', async () => {
      const { onCreated, user } = setup('transfer', [SECOND], () =>
        Promise.reject(new TypeError('Failed to fetch')),
      );
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
      expect(onCreated).not.toHaveBeenCalled();
      expect(printMock).not.toHaveBeenCalled();
    });

    it('ответ не JSON — общий текст с кодом статуса', async () => {
      const { user } = setup('transfer', [SECOND], () => new Response('oops', { status: 502 }));
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка сервера (502)');
    });

    it('пока запрос идёт, кнопка заблокирована: повторный Enter не шлёт второй запрос', async () => {
      let resolve: (response: Response) => void = () => {};
      const { fetchMock, user } = setup(
        'transfer',
        [SECOND],
        () => new Promise<Response>((done) => (resolve = done)),
      );
      await user.type(amountInput('202'), '1{Enter}');
      await waitFor(() => expect(submitButton()).toBeDisabled());
      await user.type(amountInput('202'), '{Enter}');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      resolve(jsonResponse(201, makeResult('transfer', [{ label: SECOND, delta: -1 }])));
      expect(await within(screen.getByRole('dialog')).findByRole('status')).toBeInTheDocument();
      expect(printMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('«Убрать»', () => {
    it('убирает строку, фокус переходит на «Убрать» следующей строки', async () => {
      const { user } = setup('transfer', [FIRST, SECOND, THIRD]);
      await user.click(removeButton('101'));
      expect(screen.queryByRole('row', { name: /101/ })).not.toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Позиции заявки: 2' })).toBeInTheDocument();
      expect(removeButton('202')).toHaveFocus();
    });

    it('у последней строки фокус уходит на «Убрать» предыдущей', async () => {
      const { user } = setup('transfer', [FIRST, SECOND]);
      await user.click(removeButton('202'));
      expect(removeButton('101')).toHaveFocus();
    });

    it('с клавиатуры: Enter по «Убрать» тоже переносит фокус', async () => {
      const { user } = setup('transfer', [FIRST, SECOND]);
      removeButton('101').focus();
      await user.keyboard('{Enter}');
      expect(removeButton('202')).toHaveFocus();
    });

    it('убрана последняя позиция: «В заявке нет позиций», отправка недоступна, фокус на «Отмена»', async () => {
      const { fetchMock, user } = setup('transfer', [SECOND]);
      await user.click(removeButton('202'));
      expect(screen.getByText('В заявке нет позиций.')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(submitButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('убранная позиция не попадает в запрос, введённое в остальных сохраняется', async () => {
      const { requests, user } = setup('transfer', [FIRST, SECOND]);
      await user.type(amountInput('101'), '7');
      await user.type(amountInput('202'), '8');
      await user.click(removeButton('101'));
      expect(amountInput('202')).toHaveValue('8');
      await user.click(submitButton());
      await waitFor(() => expect(requests).toHaveLength(1));
      expect(requests[0]?.body).toEqual({
        kind: 'transfer',
        items: [{ labelId: SECOND.id, quantity: 8 }],
      });
    });

    it('убрана строка с ошибкой — ошибка с ней не остаётся в других строках', async () => {
      const { user } = setup('transfer', [FIRST, SECOND]);
      await user.type(amountInput('202'), '1');
      await user.click(submitButton());
      expect(amountInput('101')).toHaveAttribute('aria-invalid', 'true');
      await user.click(removeButton('101'));
      expect(amountInput('202')).toHaveAttribute('aria-invalid', 'false');
    });
  });

  it('«Отмена» и «Закрыть» закрывают без запроса', async () => {
    const { fetchMock, onClose, user } = setup('transfer', [FIRST]);
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('StockRequestDialog: утилизация', () => {
  it('в заявку попадают только позиции со старым макетом, остальные названы в предупреждении', () => {
    setup('disposal', [FIRST, SECOND, THIRD]);
    expect(screen.getByRole('dialog', { name: 'Заявка на утилизацию' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Позиции заявки: 2' })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Василёк/ })).not.toBeInTheDocument();
    expect(screen.getByText('Нечего утилизировать, в заявку не попали: 202')).toBeInTheDocument();
  });

  it('столбец «К утилизации», полей количества нет', () => {
    setup('disposal', [FIRST, THIRD]);
    expect(screen.getByRole('columnheader', { name: 'К утилизации, шт.' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(rowOf('101')).getByText('500')).toBeInTheDocument();
    expect(within(rowOf('303')).getByText('9')).toBeInTheDocument();
    expect(document.querySelector('form')).toHaveAccessibleDescription(
      'Старый макет спишется целиком, затем откроется печать.',
    );
  });

  it('отправляет только id позиций и печатает', async () => {
    const result = makeResult('disposal', [
      { label: FIRST, delta: -500 },
      { label: THIRD, delta: -9 },
    ]);
    const { requests, onCreated, user } = setup('disposal', [FIRST, SECOND, THIRD], () =>
      jsonResponse(201, result),
    );
    await user.click(submitButton());
    expect(await within(screen.getByRole('dialog')).findByRole('status')).toBeInTheDocument();
    expect(requests[0]?.body).toEqual({
      kind: 'disposal',
      items: [{ labelId: FIRST.id }, { labelId: THIRD.id }],
    });
    expect(onCreated).toHaveBeenCalledWith(result);
    expect(printMock).toHaveBeenCalledTimes(1);
    const sheet = within(screen.getByRole('dialog')).getByRole('article');
    expect(sheet).toHaveAccessibleName(/^Заявка на утилизацию от /);
    expect(within(sheet).getAllByRole('row').at(-1)!.textContent).toBe('Итого509');
  });

  it('утилизировать нечего ни по одной позиции — пустая заявка, отправка недоступна', () => {
    const { fetchMock } = setup('disposal', [SECOND]);
    expect(screen.getByText('В заявке нет позиций.')).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ошибка сервера по позиции показывается в её строке текстом', async () => {
    const { user } = setup('disposal', [FIRST, THIRD], () =>
      errorResponse(422, 'VALIDATION_ERROR', 'Утилизировать нечего', { labelId: THIRD.id }),
    );
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Утилизировать нечего');
    expect(within(rowOf('303')).getByText('Утилизировать нечего')).toBeInTheDocument();
    expect(within(rowOf('101')).queryByText('Утилизировать нечего')).not.toBeInTheDocument();
    expect(printMock).not.toHaveBeenCalled();
  });

  it('удалённая позиция (409) — ошибка строки и alert', async () => {
    const message = 'Позиция удалена, сначала восстановите её';
    const { user } = setup('disposal', [FIRST], () =>
      errorResponse(409, 'LABEL_DELETED', message, { labelId: FIRST.id }),
    );
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(within(rowOf('101')).getByText(message)).toBeInTheDocument();
  });
});
