import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Counterparty } from '@label-stock/shared';
import {
  errorResponse,
  jsonResponse,
  mockFetchRoutes,
  type RecordedRequest,
} from '../../test/fetch-mock';
import { makeLabel } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { LabelFormDialog, type LabelFormMode } from './LabelFormDialog';

// Корректная контрольная сумма EAN-13.
const VALID_EAN = '4006381333931';
const INVALID_EAN = '4006381333932';
const EAN_WARNING = 'Контрольная сумма EAN-13 не сходится — проверьте код';

const COUNTERPARTY: Counterparty = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Ромашка',
  externalId: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

type Handler = Parameters<typeof mockFetchRoutes>[0][string];

function setup(mode: LabelFormMode, routes: Record<string, Handler> = {}) {
  const fetchMocks = mockFetchRoutes({
    'GET /api/counterparties': () => jsonResponse(200, []),
    'POST /api/counterparties': () => jsonResponse(201, COUNTERPARTY),
    'POST /api/labels': () => jsonResponse(201, makeLabel()),
    ...routes,
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const onOpenLabel = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <LabelFormDialog mode={mode} onClose={onClose} onSaved={onSaved} onOpenLabel={onOpenLabel} />,
  );
  // Контрагент с <datalist> — combobox, остальные поля — textbox: ищем по подписи.
  const field = (label: RegExp) => screen.getByLabelText(label);
  return { ...fetchMocks, onClose, onSaved, onOpenLabel, user, field };
}

const writes = (requests: RecordedRequest[]) => requests.filter((r) => r.method !== 'GET');

describe('LabelFormDialog: создание', () => {
  it('заголовок «Новая позиция», фокус в поле контрагента, штрихкод из скана подставлен', () => {
    const { field } = setup({ kind: 'create', barcode: VALID_EAN });
    expect(screen.getByRole('dialog', { name: 'Новая позиция' })).toBeInTheDocument();
    expect(field(/Контрагент/)).toHaveFocus();
    expect(field(/Штрихкод/)).toHaveValue(VALID_EAN);
    expect(field(/Остаток/)).toHaveValue('0');
  });

  it('пустой контрагент — ошибка у поля, запросов на запись нет', async () => {
    const { user, field, requests, onSaved } = setup({ kind: 'create' });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Укажите контрагента')).toBeInTheDocument();
    expect(field(/Контрагент/)).toHaveAttribute('aria-invalid', 'true');
    expect(field(/Контрагент/)).toHaveAccessibleDescription('Укажите контрагента');
    expect(writes(requests)).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('буквы в номере макета — «Только цифры» у поля, запросов на запись нет', async () => {
    const { user, field, requests } = setup({ kind: 'create' });
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.type(field(/Номер макета/), '12a');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(field(/Номер макета/)).toHaveAttribute('aria-invalid', 'true'));
    // Подсказка и ошибка совпадают по тексту, обе связаны с полем.
    expect(field(/Номер макета/)).toHaveAccessibleDescription('Только цифры Только цифры');
    expect(writes(requests)).toEqual([]);
  });

  it('некорректный остаток — ошибка у поля', async () => {
    const { user, field, requests } = setup({ kind: 'create' });
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.clear(field(/Остаток/));
    await user.type(field(/Остаток/), '-5');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Только целое число не меньше нуля')).toBeInTheDocument();
    expect(writes(requests)).toEqual([]);
  });

  it('сабмит: сначала POST /api/counterparties, затем POST /api/labels', async () => {
    const saved = makeLabel({ layoutNumber: '007' });
    const { user, field, requests, onSaved } = setup(
      { kind: 'create' },
      { 'POST /api/labels': () => jsonResponse(201, saved) },
    );
    await user.type(field(/Контрагент/), '  Ромашка ');
    await user.type(field(/Номер макета/), '007');
    await user.type(field(/Штрихкод/), ' ФИС 123 ');
    await user.clear(field(/Остаток/));
    await user.type(field(/Остаток/), '1200');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, true));
    expect(writes(requests)).toEqual([
      { method: 'POST', url: '/api/counterparties', body: { name: 'Ромашка' } },
      {
        method: 'POST',
        url: '/api/labels',
        body: {
          counterpartyId: COUNTERPARTY.id,
          layoutNumber: '007',
          barcode: 'ABC123',
          printedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          comment: null,
          quantity: 1200,
        },
      },
    ]);
  });

  it('ошибка создания контрагента — позиция не создаётся, текст в role=alert', async () => {
    const { user, field, requests, onSaved } = setup(
      { kind: 'create' },
      {
        'POST /api/counterparties': () => errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка'),
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка');
    expect(writes(requests).map((r) => r.url)).toEqual(['/api/counterparties']);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('409 DUPLICATE по номеру — ошибка у поля и кнопка открытия занявшей позиции', async () => {
    const { user, field, onOpenLabel, onSaved } = setup(
      { kind: 'create' },
      {
        'POST /api/labels': () =>
          errorResponse(409, 'DUPLICATE', 'Позиция с таким номером макета уже есть', {
            field: 'layoutNumber',
            conflictingId: 'label-7',
          }),
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.type(field(/Номер макета/), '00123');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const openButton = await screen.findByRole('button', {
      name: 'Открыть позицию с этим номером',
    });
    expect(field(/Номер макета/)).toHaveAttribute('aria-invalid', 'true');
    expect(field(/Номер макета/)).toHaveAccessibleDescription(
      'Только цифры Позиция с таким номером макета уже есть',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(openButton);
    expect(onOpenLabel).toHaveBeenCalledWith('label-7');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('409 DUPLICATE по штрихкоду — своя подпись кнопки', async () => {
    const { user, field } = setup(
      { kind: 'create' },
      {
        'POST /api/labels': () =>
          errorResponse(409, 'DUPLICATE', 'Штрихкод уже занят', {
            field: 'barcode',
            conflictingId: 'label-8',
          }),
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(
      await screen.findByRole('button', { name: 'Открыть позицию с этим штрихкодом' }),
    ).toBeInTheDocument();
    expect(field(/Штрихкод/)).toHaveAccessibleDescription('Штрихкод уже занят');
  });

  it('409 DUPLICATE без conflictingId — ошибка у поля, без кнопки', async () => {
    const { user, field } = setup(
      { kind: 'create' },
      {
        'POST /api/labels': () =>
          errorResponse(409, 'DUPLICATE', 'Штрихкод уже занят', {
            field: 'barcode',
            conflictingId: '',
          }),
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(field(/Штрихкод/)).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.queryByRole('button', { name: /Открыть позицию/ })).not.toBeInTheDocument();
  });

  it('VALIDATION_ERROR по counterpartyId — ошибка у поля контрагента', async () => {
    const { user, field } = setup(
      { kind: 'create' },
      {
        'POST /api/labels': () =>
          errorResponse(400, 'VALIDATION_ERROR', 'Проверьте поля', {
            counterpartyId: 'Выберите контрагента',
          }),
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(field(/Контрагент/)).toHaveAccessibleDescription('Выберите контрагента'),
    );
  });

  it('повторная отправка убирает прошлую ошибку и кнопку дубля', async () => {
    let attempt = 0;
    const { user, field, onSaved } = setup(
      { kind: 'create' },
      {
        'POST /api/labels': () => {
          attempt += 1;
          return attempt === 1
            ? errorResponse(409, 'DUPLICATE', 'Номер занят', {
                field: 'layoutNumber',
                conflictingId: 'label-7',
              })
            : jsonResponse(201, makeLabel());
        },
      },
    );
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByRole('button', { name: 'Открыть позицию с этим номером' });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Открыть позицию/ })).not.toBeInTheDocument();
  });

  it('предупреждение EAN-13 при неверной контрольной сумме, и только тогда', async () => {
    const { user, field } = setup({ kind: 'create' });
    await user.type(field(/Штрихкод/), INVALID_EAN);
    expect(screen.getByText(EAN_WARNING)).toBeInTheDocument();
    expect(field(/Штрихкод/)).toHaveAccessibleDescription(EAN_WARNING);

    await user.clear(field(/Штрихкод/));
    await user.type(field(/Штрихкод/), VALID_EAN);
    expect(screen.queryByText(EAN_WARNING)).not.toBeInTheDocument();

    await user.clear(field(/Штрихкод/));
    await user.type(field(/Штрихкод/), 'ABC123');
    expect(screen.queryByText(EAN_WARNING)).not.toBeInTheDocument();
  });

  it('предупреждение EAN-13 не блокирует сохранение', async () => {
    const { user, field, onSaved } = setup({ kind: 'create', barcode: INVALID_EAN });
    expect(screen.getByText(EAN_WARNING)).toBeInTheDocument();
    await user.type(field(/Контрагент/), 'Ромашка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('«Отмена» вызывает onClose без запросов на запись', async () => {
    const { user, onClose, requests } = setup({ kind: 'create' });
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(writes(requests)).toEqual([]);
  });
});

describe('LabelFormDialog: редактирование', () => {
  const label = makeLabel({ version: 4, layoutNumber: '00123', comment: 'старый' });
  const patchRoute = `PATCH /api/labels/${label.id}`;

  it('поля заполнены из позиции, поля остатка нет', () => {
    const { field } = setup({ kind: 'edit', label });
    expect(screen.getByRole('dialog', { name: 'Редактирование позиции' })).toBeInTheDocument();
    expect(field(/Контрагент/)).toHaveValue('Ромашка');
    expect(field(/Номер макета/)).toHaveValue('00123');
    expect(field(/Комментарий/)).toHaveValue('старый');
    expect(screen.queryByLabelText(/Остаток/)).not.toBeInTheDocument();
  });

  it('PATCH с версией и без остатка', async () => {
    const saved = makeLabel({ version: 5 });
    const { user, field, requests, onSaved } = setup(
      { kind: 'edit', label },
      { [patchRoute]: () => jsonResponse(200, saved) },
    );
    await user.clear(field(/Комментарий/));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, false));
    const patch = writes(requests).find((r) => r.method === 'PATCH');
    expect(patch?.body).toEqual({
      counterpartyId: COUNTERPARTY.id,
      layoutNumber: '00123',
      barcode: label.barcode,
      printedAt: label.printedAt,
      comment: null,
      version: 4,
    });
  });

  it('409 VERSION_CONFLICT — текст в role=alert', async () => {
    const { user, onSaved } = setup(
      { kind: 'edit', label },
      {
        [patchRoute]: () =>
          errorResponse(409, 'VERSION_CONFLICT', 'Позицию уже изменили — обновите карточку'),
      },
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Позицию уже изменили — обновите карточку',
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('обрыв сети при сохранении — «Нет связи с сервером» в role=alert', async () => {
    const { user } = setup(
      { kind: 'edit', label },
      { 'POST /api/counterparties': () => Promise.reject(new TypeError('Failed to fetch')) },
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
  });
});
