import { z } from 'zod';
import { BARCODE_MAX_LENGTH, normalizeBarcode } from '../barcode';
import { isValidIsoDate } from '../dates';

export const INT32_MAX = 2_147_483_647;
export const LAYOUT_NUMBER_MAX_LENGTH = 20;
export const COMMENT_MAX_LENGTH = 1000;
export const COUNTERPARTY_NAME_MAX_LENGTH = 200;
// Ограничение на сырой ввод до нормализации, чтобы не гонять мегабайтные строки.
const BARCODE_RAW_MAX_LENGTH = 256;

const emptyToNull = (value: string): string | null => (value === '' ? null : value);

// PostgreSQL не хранит символ 0x00 в text: без проверки такой ввод превращается в 500.
/** Строка свободного текста, которую можно сохранить в БД. */
export const plainTextSchema = () =>
  z
    .string()
    .refine((value) => !value.includes('\0'), { message: 'Недопустимый символ' })
    .trim();

/** Строка поиска: те же ограничения, что у свободного текста, плюс длина. */
export const searchTextSchema = plainTextSchema().max(200).optional();

export const uuidSchema = z.uuid({ message: 'Некорректный идентификатор' });

export const isoDateSchema = z
  .string({ message: 'Укажите дату' })
  .refine(isValidIsoDate, { message: 'Некорректная дата' });

export const quantitySchema = z
  .int({ message: 'Только целое число' })
  .min(0, { message: 'Не может быть меньше нуля' })
  .max(INT32_MAX, { message: 'Слишком большое число' });

export const deltaSchema = z
  .int({ message: 'Только целое число' })
  .min(-INT32_MAX, { message: 'Слишком большое число' })
  .max(INT32_MAX, { message: 'Слишком большое число' });

/** Пустая строка — «номера нет». Ведущие нули сохраняются: `007` остаётся `007`. */
export const layoutNumberSchema = z
  .string()
  .trim()
  .max(LAYOUT_NUMBER_MAX_LENGTH, { message: `Не длиннее ${LAYOUT_NUMBER_MAX_LENGTH} цифр` })
  .regex(/^\d*$/, { message: 'Только цифры' })
  .transform(emptyToNull)
  .nullable();

export const barcodeSchema = z
  .string()
  .max(BARCODE_RAW_MAX_LENGTH, { message: 'Слишком длинный штрихкод' })
  .transform(normalizeBarcode)
  .pipe(z.string().max(BARCODE_MAX_LENGTH, { message: 'Слишком длинный штрихкод' }))
  .transform(emptyToNull)
  .nullable();

export const commentSchema = plainTextSchema()
  .max(COMMENT_MAX_LENGTH, { message: `Не длиннее ${COMMENT_MAX_LENGTH} символов` })
  .transform(emptyToNull)
  .nullable();

export const counterpartyNameSchema = plainTextSchema()
  .min(1, { message: 'Укажите контрагента' })
  .max(COUNTERPARTY_NAME_MAX_LENGTH, {
    message: `Не длиннее ${COUNTERPARTY_NAME_MAX_LENGTH} символов`,
  });
