import type { Label } from '@label-stock/shared';

/** Короткое имя позиции для подписей кнопок и сообщений: номер макета, иначе штрихкод. */
export function labelTitle(label: Label): string {
  return label.layoutNumber ?? label.barcode ?? label.counterparty.name;
}
