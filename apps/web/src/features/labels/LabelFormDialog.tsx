import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  hasEan13ChecksumWarning,
  normalizeBarcode,
  type DuplicateDetails,
  type Label,
} from '@label-stock/shared';
import { Dialog } from '../../shared/ui/Dialog';
import { FormField } from '../../shared/ui/FormField';
import { CounterpartyInput } from '../counterparties/CounterpartyInput';
import { ensureCounterparty } from '../counterparties/api';
import { useCreateLabel, useUpdateLabel } from './api';
import {
  emptyFormValues,
  labelFormSchema,
  labelToFormValues,
  type LabelFormField,
  type LabelFormOutput,
  type LabelFormValues,
} from './label-form-schema';
import { interpretServerError } from './server-errors';

export type LabelFormMode = { kind: 'create'; barcode?: string } | { kind: 'edit'; label: Label };

interface LabelFormDialogProps {
  mode: LabelFormMode;
  onClose: () => void;
  onSaved: (label: Label, created: boolean) => void;
  onOpenLabel: (labelId: string) => void;
  returnFocusTo?: () => HTMLElement | null | undefined;
}

const DUPLICATE_LINK_TEXT: Record<DuplicateDetails['field'], string> = {
  layoutNumber: 'Открыть позицию с этим номером',
  barcode: 'Открыть позицию с этим штрихкодом',
  name: 'Открыть контрагента',
};

export function LabelFormDialog({
  mode,
  onClose,
  onSaved,
  onOpenLabel,
  returnFocusTo,
}: LabelFormDialogProps) {
  const isCreate = mode.kind === 'create';
  const [formError, setFormError] = useState<string>();
  const [duplicate, setDuplicate] = useState<DuplicateDetails>();
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();

  const form = useForm<LabelFormValues, unknown, LabelFormOutput>({
    resolver: zodResolver(labelFormSchema(isCreate)),
    defaultValues: isCreate ? emptyFormValues(mode.barcode) : labelToFormValues(mode.label),
    mode: 'onTouched',
  });
  const { register, control, handleSubmit, formState, setError } = form;
  const { errors, isSubmitting } = formState;
  const barcodeWarning = hasEan13ChecksumWarning(
    normalizeBarcode(useWatch({ control, name: 'barcode' }) ?? ''),
  );

  const submit = handleSubmit(async (values) => {
    setFormError(undefined);
    setDuplicate(undefined);
    try {
      const counterparty = await ensureCounterparty(values.counterpartyName);
      const fields = {
        counterpartyId: counterparty.id,
        layoutNumber: values.layoutNumber,
        barcode: values.barcode,
        printedAt: values.printedAt,
        comment: values.comment,
      };
      const saved = isCreate
        ? await createLabel.mutateAsync({ ...fields, quantity: values.quantity })
        : await updateLabel.mutateAsync({
            id: mode.label.id,
            input: { ...fields, version: mode.label.version },
          });
      onSaved(saved, isCreate);
    } catch (error) {
      const outcome = interpretServerError(error);
      for (const [field, message] of Object.entries(outcome.fieldErrors)) {
        // Ошибки контрагента сервер возвращает по counterpartyId или name — в форме это одно поле.
        const formField = (
          field === 'counterpartyId' || field === 'name' ? 'counterpartyName' : field
        ) as LabelFormField;
        setError(formField, { message }, { shouldFocus: true });
      }
      setFormError(outcome.formError);
      setDuplicate(outcome.duplicate);
    }
  });

  return (
    <Dialog
      title={isCreate ? 'Новая позиция' : 'Редактирование позиции'}
      onClose={onClose}
      returnFocusTo={returnFocusTo}
    >
      <form noValidate onSubmit={submit} className="form">
        <FormField label="Контрагент" required error={errors.counterpartyName?.message}>
          {(aria) => (
            <Controller
              control={control}
              name="counterpartyName"
              render={({ field }) => (
                <CounterpartyInput {...aria} {...field} className="input" data-autofocus />
              )}
            />
          )}
        </FormField>

        <FormField label="Номер макета" error={errors.layoutNumber?.message} hint="Только цифры">
          {(aria) => (
            <input {...aria} {...register('layoutNumber')} inputMode="numeric" className="input" />
          )}
        </FormField>

        <FormField
          label="Штрихкод"
          error={errors.barcode?.message}
          hint={barcodeWarning ? 'Контрольная сумма EAN-13 не сходится — проверьте код' : undefined}
        >
          {(aria) => <input {...aria} {...register('barcode')} className="input" />}
        </FormField>

        <FormField label="Дата печати" required error={errors.printedAt?.message}>
          {(aria) => <input {...aria} {...register('printedAt')} type="date" className="input" />}
        </FormField>

        {isCreate && (
          <FormField label="Остаток, шт." required error={errors.quantity?.message}>
            {(aria) => (
              <input {...aria} {...register('quantity')} inputMode="numeric" className="input" />
            )}
          </FormField>
        )}

        <FormField label="Комментарий" error={errors.comment?.message}>
          {(aria) => <textarea {...aria} {...register('comment')} rows={3} className="input" />}
        </FormField>

        {formError && (
          <p role="alert" className="alert alert--error">
            {formError}
          </p>
        )}
        {duplicate?.conflictingId && duplicate.field !== 'name' && (
          <button
            type="button"
            className="button button--link"
            onClick={() => onOpenLabel(duplicate.conflictingId)}
          >
            {DUPLICATE_LINK_TEXT[duplicate.field]}
          </button>
        )}

        <footer className="form__actions">
          <button type="submit" className="button button--primary" disabled={isSubmitting}>
            {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button type="button" className="button button--secondary" onClick={onClose}>
            Отмена
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
