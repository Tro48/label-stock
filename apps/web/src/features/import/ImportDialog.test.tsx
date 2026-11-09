import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IMPORT_MAX_BYTES, type ImportResult } from '@label-stock/shared';
import { errorResponse, jsonResponse, mockFetchRoutes } from '../../test/fetch-mock';
import { renderWithProviders } from '../../test/render';
import { ImportDialog } from './ImportDialog';

const CSV = 'Контрагент;Дата печати;Остаток\r\nРомашка;01.11.2026;1\r\n';

function makeResult(overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    applied: false,
    created: 2,
    updated: 1,
    unchanged: 3,
    errors: [],
    errorsTruncated: false,
    ...overrides,
  };
}

const csvFile = (content: BlobPart = CSV, name = 'ostatki.csv') =>
  new File([content], name, { type: 'text/csv' });

// Живой регион уведомлений приложения тоже role=status, поэтому отчёт ищем внутри диалога.
const report = () => within(screen.getByRole('dialog')).getByRole('status');

type Handler = Parameters<typeof mockFetchRoutes>[0][string];

function setup(handler: Handler) {
  const fetchMocks = mockFetchRoutes({ 'POST /api/import.csv': handler });
  const onClose = vi.fn();
  const onImported = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(<ImportDialog onClose={onClose} onImported={onImported} />);
  const fileInput = () => screen.getByLabelText('CSV-файл');
  const check = () => user.click(screen.getByRole('button', { name: 'Проверить файл' }));
  const chooseAndCheck = async (file: File = csvFile()) => {
    await user.upload(fileInput(), file);
    await check();
  };
  return { ...fetchMocks, onClose, onImported, user, fileInput, check, chooseAndCheck };
}

/** Ответ на пробный прогон и на запись — по параметру dryRun. */
const byDryRun =
  (dryRun: ImportResult, apply: ImportResult): Handler =>
  ({ url }) =>
    jsonResponse(200, url.includes('dryRun=true') ? dryRun : apply);

describe('ImportDialog', () => {
  it('диалог с заголовком, фокус на выборе файла, кнопки «Загрузить» до проверки нет', () => {
    setup(() => jsonResponse(200, makeResult()));
    expect(screen.getByRole('dialog', { name: 'Загрузка из CSV' })).toBeInTheDocument();
    expect(screen.getByLabelText('CSV-файл')).toHaveFocus();
    expect(screen.getByLabelText('CSV-файл')).toHaveAccessibleDescription(/«Контрагент»/);
    expect(screen.queryByRole('button', { name: 'Загрузить' })).not.toBeInTheDocument();
  });

  it('«Проверить файл» шлёт пробный прогон с содержимым файла', async () => {
    const { chooseAndCheck, requests } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck();
    await screen.findByText(/Ошибок нет/);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/import.csv?dryRun=true',
      body: CSV,
    });
  });

  it('файл в Windows-1251 уходит на сервер уже кириллицей', async () => {
    const { chooseAndCheck, requests } = setup(() => jsonResponse(200, makeResult()));
    // «Контрагент» в Windows-1251.
    const cp1251 = new Uint8Array([0xca, 0xee, 0xed, 0xf2, 0xf0, 0xe0, 0xe3, 0xe5, 0xed, 0xf2]);
    await chooseAndCheck(csvFile(cp1251));
    await screen.findByText(/Ошибок нет/);
    expect(requests[0]?.body).toBe('Контрагент');
  });

  it('без ошибок: числа в отчёте и кнопка «Загрузить»', async () => {
    const { chooseAndCheck } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck();
    await waitFor(() =>
      expect(report()).toHaveTextContent(
        'Ошибок нет. Будет создано: 2, обновлено: 1, без изменений: 3.',
      ),
    );
    expect(screen.getByRole('button', { name: 'Загрузить' })).toBeEnabled();
  });

  it('с ошибками: список «Строка N: …», кнопки «Загрузить» нет', async () => {
    const { chooseAndCheck } = setup(() =>
      jsonResponse(
        200,
        makeResult({
          errors: [
            { line: 2, message: 'Остаток: ожидается целое число не меньше нуля' },
            { line: 5, message: 'Номер макета 7 уже есть в строке 2' },
          ],
        }),
      ),
    );
    await chooseAndCheck();
    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Строка 2: Остаток: ожидается целое число не меньше нуля',
      'Строка 5: Номер макета 7 уже есть в строке 2',
    ]);
    expect(report()).toHaveTextContent(/ничего не загружено/);
    expect(screen.queryByRole('button', { name: 'Загрузить' })).not.toBeInTheDocument();
  });

  it('ошибок больше лимита — сказано, что показаны первые', async () => {
    const errors = Array.from({ length: 100 }, (_, index) => ({ line: index + 2, message: 'x' }));
    const { chooseAndCheck } = setup(() =>
      jsonResponse(200, makeResult({ errors, errorsTruncated: true })),
    );
    await chooseAndCheck();
    expect(await screen.findByText(/Показаны первые 100\./)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(100);
  });

  it('ошибки с одинаковым номером строки показываются все', async () => {
    const { chooseAndCheck } = setup(() =>
      jsonResponse(
        200,
        makeResult({
          errors: [
            { line: 2, message: 'Контрагент: Недопустимый символ' },
            { line: 2, message: 'Комментарий: Недопустимый символ' },
          ],
        }),
      ),
    );
    await chooseAndCheck();
    expect(await screen.findAllByRole('listitem')).toHaveLength(2);
  });

  it('«Загрузить» шлёт запись тем же текстом и вызывает onImported', async () => {
    const applied = makeResult({ applied: true });
    const { chooseAndCheck, user, requests, onImported } = setup(byDryRun(makeResult(), applied));
    await chooseAndCheck();
    await user.click(await screen.findByRole('button', { name: 'Загрузить' }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith(applied));
    expect(requests.map((request) => request.url)).toEqual([
      '/api/import.csv?dryRun=true',
      '/api/import.csv?dryRun=false',
    ]);
    expect(requests[1]?.body).toBe(CSV);
  });

  it('запись вернула ошибки (данные успели измениться) — отчёт с ошибками, onImported нет', async () => {
    const { chooseAndCheck, user, onImported } = setup(
      byDryRun(
        makeResult(),
        makeResult({ errors: [{ line: 3, message: 'Штрихкод уже занят другой позицией' }] }),
      ),
    );
    await chooseAndCheck();
    await user.click(await screen.findByRole('button', { name: 'Загрузить' }));
    expect(
      await screen.findByText('Строка 3: Штрихкод уже занят другой позицией'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить' })).not.toBeInTheDocument();
    expect(onImported).not.toHaveBeenCalled();
  });

  it('смена файла сбрасывает отчёт и кнопку «Загрузить»', async () => {
    const { chooseAndCheck, user, fileInput } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck();
    await screen.findByRole('button', { name: 'Загрузить' });
    await user.upload(fileInput(), csvFile('другой', 'other.csv'));
    expect(screen.queryByText(/Ошибок нет/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Загрузить' })).not.toBeInTheDocument();
  });

  it('смена файла убирает и сообщение об ошибке', async () => {
    const { chooseAndCheck, user, fileInput } = setup(() =>
      errorResponse(400, 'VALIDATION_ERROR', 'Файл пустой'),
    );
    await chooseAndCheck();
    await screen.findByRole('alert');
    await user.upload(fileInput(), csvFile());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('файл не выбран — ошибка без запроса', async () => {
    const { check, fetchMock } = setup(() => jsonResponse(200, makeResult()));
    await check();
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите CSV-файл');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('пустой файл — ошибка без запроса', async () => {
    const { chooseAndCheck, fetchMock } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck(csvFile(''));
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите CSV-файл');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('файл больше 5 МБ — ошибка без запроса', async () => {
    const { chooseAndCheck, fetchMock } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck(csvFile(new Uint8Array(IMPORT_MAX_BYTES + 1)));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Файл больше 5 МБ, разбейте его на части',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ровно 5 МБ — уходит на проверку', async () => {
    const { chooseAndCheck, fetchMock } = setup(() => jsonResponse(200, makeResult()));
    await chooseAndCheck(csvFile(new Uint8Array(IMPORT_MAX_BYTES).fill(0x41)));
    await screen.findByText(/Ошибок нет/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ошибка сервера 400 — role=alert с текстом сервера, отчёта нет', async () => {
    const { chooseAndCheck } = setup(() =>
      errorResponse(400, 'VALIDATION_ERROR', 'В первой строке файла нет столбцов: «Остаток»'),
    );
    await chooseAndCheck();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'В первой строке файла нет столбцов: «Остаток»',
    );
    expect(report()).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Загрузить' })).not.toBeInTheDocument();
  });

  it('нет связи с сервером — понятное сообщение', async () => {
    const { chooseAndCheck } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    await chooseAndCheck();
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
  });

  it('ошибка сервера при записи — role=alert, onImported не вызывается', async () => {
    const { chooseAndCheck, user, onImported } = setup(({ url }) =>
      url.includes('dryRun=true')
        ? jsonResponse(200, makeResult())
        : errorResponse(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера'),
    );
    await chooseAndCheck();
    await user.click(await screen.findByRole('button', { name: 'Загрузить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Внутренняя ошибка сервера');
    expect(onImported).not.toHaveBeenCalled();
  });

  it('пока идёт проверка — «Проверяем…» и кнопка заблокирована', async () => {
    let respond: (response: Response) => void = () => {};
    const { chooseAndCheck } = setup(() => new Promise<Response>((resolve) => (respond = resolve)));
    await chooseAndCheck();
    expect(await screen.findByRole('button', { name: 'Проверяем…' })).toBeDisabled();
    respond(jsonResponse(200, makeResult()));
    expect(await screen.findByRole('button', { name: 'Проверить файл' })).toBeEnabled();
  });

  it('«Отмена» и «Закрыть» вызывают onClose', async () => {
    const { user, onClose } = setup(() => jsonResponse(200, makeResult()));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
