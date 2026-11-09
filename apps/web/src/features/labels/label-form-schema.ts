import { z } from 'zod';
import {
  barcodeSchema,
  commentSchema,
  counterpartyNameSchema,
  isoDateSchema,
  layoutNumberSchema,
  quantitySchema,
  todayIsoDate,
  type Label,
} from '@label-stock/shared';

// Правила полей берутся из общего пакета — те же, что проверяет сервер.
const baseFields = {
  counterpartyName: counterpartyNameSchema,
  layoutNumber: layoutNumberSchema,
  barcode: barcodeSchema,
  printedAt: isoDateSchema,
  comment: commentSchema,
};

export const quantityInputSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, { message: 'Только целое число не меньше нуля' })
  .transform(Number)
  .pipe(quantitySchema);

/** Остаток вводится только при создании, дальше он меняется операциями. */
export function labelFormSchema(requireQuantity: boolean) {
  return z.object({
    ...baseFields,
    quantity: z.string().transform((value, context) => {
      if (!requireQuantity) return 0;
      const result = quantityInputSchema.safeParse(value);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        context.addIssue({ code: 'custom', message: issue.message });
      }
      return z.NEVER;
    }),
  });
}

export type LabelFormOutput = z.output<ReturnType<typeof labelFormSchema>>;

export type LabelFormValues = z.input<ReturnType<typeof labelFormSchema>>;

export type LabelFormField = keyof LabelFormValues;

export function labelToFormValues(label: Label): LabelFormValues {
  return {
    counterpartyName: label.counterparty.name,
    layoutNumber: label.layoutNumber ?? '',
    barcode: label.barcode ?? '',
    printedAt: label.printedAt,
    quantity: String(label.quantity),
    comment: label.comment ?? '',
  };
}

export function emptyFormValues(barcode = ''): LabelFormValues {
  return {
    counterpartyName: '',
    layoutNumber: '',
    barcode,
    printedAt: todayIsoDate(),
    quantity: '0',
    comment: '',
  };
}
