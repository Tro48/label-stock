import { formatQuantity } from '../../shared/format';

interface QuantityTextProps {
  quantity: number;
  obsoleteQuantity?: number;
}

/** Нулевой остаток и старый макет подписаны текстом, а не только цветом. */
export function QuantityText({ quantity, obsoleteQuantity = 0 }: QuantityTextProps) {
  if (quantity === 0) {
    return (
      <span className="quantity--empty">
        0 <span className="quantity__note">— нет в наличии</span>
      </span>
    );
  }
  return (
    <>
      {formatQuantity(quantity)}
      {obsoleteQuantity > 0 && (
        <span className="quantity__obsolete">
          из них к утилизации: {formatQuantity(obsoleteQuantity)}
        </span>
      )}
    </>
  );
}
