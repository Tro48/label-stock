import { z } from 'zod';
import { commentSchema, deltaSchema, isoDateSchema, quantitySchema } from './fields';
import { labelSchema } from './label';

export const MOVEMENT_REASONS = [
  'created',
  'print',
  'consumption',
  'inventory',
  'correction',
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export const MOVEMENT_REASON_LABELS: Readonly<Record<MovementReason, string>> = {
  created: 'Создание',
  print: 'Допечатка',
  consumption: 'Списание',
  inventory: 'Инвентаризация',
  correction: 'Исправление',
};

export const movementSchema = z.object({
  id: z.string(),
  labelId: z.string(),
  delta: z.int(),
  quantityAfter: z.int(),
  reason: z.enum(MOVEMENT_REASONS),
  comment: z.string().nullable(),
  createdAt: z.string(),
});

const optionalComment = commentSchema.optional();

/**
 * Знак дельты задан операцией: списание только уменьшает, допечатка только увеличивает.
 * `created` через API не создаётся — его пишет сервер при создании позиции.
 */
export const createMovementSchema = z.discriminatedUnion('reason', [
  z.object({
    reason: z.literal('consumption'),
    delta: deltaSchema.max(-1, { message: 'Списание уменьшает остаток' }),
    comment: optionalComment,
  }),
  z.object({
    reason: z.literal('print'),
    delta: deltaSchema.min(1, { message: 'Допечатка увеличивает остаток' }),
    printedAt: isoDateSchema.optional(),
    comment: optionalComment,
  }),
  z.object({
    reason: z.literal('correction'),
    delta: deltaSchema.refine((delta) => delta !== 0, { message: 'Изменение не может быть нулём' }),
    comment: optionalComment,
  }),
  z.object({
    reason: z.literal('inventory'),
    setQuantity: quantitySchema,
    comment: optionalComment,
  }),
]);

export const movementResultSchema = z.object({
  label: labelSchema,
  // null, если инвентаризация подтвердила текущий остаток и менять было нечего.
  movement: movementSchema.nullable(),
});

export type Movement = z.infer<typeof movementSchema>;
export type CreateMovementInput = z.input<typeof createMovementSchema>;
export type CreateMovementData = z.output<typeof createMovementSchema>;
export type MovementResult = z.infer<typeof movementResultSchema>;
