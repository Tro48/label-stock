import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@label-stock/shared';
import { ApiError } from '../../shared/api/client';
import { interpretServerError } from './server-errors';

const GENERIC_MESSAGE = 'Что-то пошло не так. Попробуйте ещё раз';

describe('interpretServerError', () => {
  it.each(['layoutNumber', 'barcode', 'name'] as const)(
    'DUPLICATE по полю %s: ошибка у поля и ссылка на позицию',
    (field) => {
      const error = new ApiError(409, ERROR_CODES.duplicate, 'Значение уже занято', {
        field,
        conflictingId: 'label-7',
      });
      expect(interpretServerError(error)).toEqual({
        fieldErrors: { [field]: 'Значение уже занято' },
        duplicate: { field, conflictingId: 'label-7' },
        versionConflict: false,
      });
    },
  );

  it.each([
    ['без details', undefined],
    ['неизвестное поле', { field: 'quantity', conflictingId: 'x' }],
    ['без conflictingId', { field: 'barcode' }],
    ['conflictingId не строка', { field: 'barcode', conflictingId: 42 }],
  ])('DUPLICATE с битыми details (%s) — общая ошибка формы без ссылки', (_name, details) => {
    const error = new ApiError(409, ERROR_CODES.duplicate, 'Значение уже занято', details);
    expect(interpretServerError(error)).toEqual({
      fieldErrors: {},
      formError: 'Значение уже занято',
      versionConflict: false,
    });
  });

  it('VERSION_CONFLICT — флаг и текст в общую ошибку', () => {
    const error = new ApiError(409, ERROR_CODES.versionConflict, 'Позицию изменили, обновите');
    expect(interpretServerError(error)).toEqual({
      fieldErrors: {},
      formError: 'Позицию изменили, обновите',
      versionConflict: true,
    });
  });

  it('VALIDATION_ERROR с details — ошибки у полей, строковые значения только', () => {
    const error = new ApiError(400, ERROR_CODES.validation, 'Проверьте поля', {
      layoutNumber: 'Только цифры',
      counterpartyId: 'Выберите контрагента',
      nested: { message: 'не строка' },
      count: 3,
    });
    expect(interpretServerError(error)).toEqual({
      fieldErrors: { layoutNumber: 'Только цифры', counterpartyId: 'Выберите контрагента' },
      versionConflict: false,
    });
  });

  it.each([
    ['без details', undefined],
    ['пустые details', {}],
    ['details без строк', { field: ['a'] }],
  ])('VALIDATION_ERROR %s — общая ошибка формы', (_name, details) => {
    const error = new ApiError(400, ERROR_CODES.validation, 'Проверьте поля', details);
    expect(interpretServerError(error)).toEqual({
      fieldErrors: {},
      formError: 'Проверьте поля',
      versionConflict: false,
    });
  });

  it('неизвестный код — сообщение сервера в общую ошибку', () => {
    const error = new ApiError(500, 'INTERNAL_ERROR', 'Внутренняя ошибка');
    expect(interpretServerError(error)).toEqual({
      fieldErrors: {},
      formError: 'Внутренняя ошибка',
      versionConflict: false,
    });
  });

  it('сетевая ошибка — текст про связь', () => {
    const error = new ApiError(0, 'NETWORK_ERROR', 'Нет связи с сервером');
    expect(interpretServerError(error).formError).toBe('Нет связи с сервером');
  });

  it.each([new Error('TypeError: x is undefined'), 'строка', null, undefined])(
    'не ApiError (%s) — общий текст, без внутренних деталей',
    (error) => {
      expect(interpretServerError(error)).toEqual({
        fieldErrors: {},
        formError: GENERIC_MESSAGE,
        versionConflict: false,
      });
    },
  );
});
