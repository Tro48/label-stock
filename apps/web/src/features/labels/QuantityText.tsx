import { formatQuantity } from '../../shared/format';

/** Нулевой остаток подписан текстом, а не только цветом. */
export function QuantityText({ quantity }: { quantity: number }) {
  if (quantity > 0) return <>{formatQuantity(quantity)}</>;
  return (
    <span className="quantity--empty">
      0 <span className="quantity__note">— нет в наличии</span>
    </span>
  );
}
