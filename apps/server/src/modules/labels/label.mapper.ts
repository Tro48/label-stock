import type { Label } from '@label-stock/shared';
import type { LabelWithCounterparty } from './labels.repository';

export function toLabelDto({ label, counterpartyName }: LabelWithCounterparty): Label {
  return {
    id: label.id,
    counterparty: { id: label.counterpartyId, name: counterpartyName },
    layoutNumber: label.layoutNumber,
    barcode: label.barcode,
    printedAt: label.printedAt,
    quantity: label.quantity,
    comment: label.comment,
    version: label.version,
    externalId: label.externalId,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
    deletedAt: label.deletedAt?.toISOString() ?? null,
  };
}
