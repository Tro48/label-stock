import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QuantityText } from './QuantityText';

const NBSP = '\u00a0';

const textOf = (element: Parameters<typeof render>[0]) => render(element).container.textContent;

describe('QuantityText', () => {
  it('положительный остаток — число с разделителем разрядов', () => {
    expect(textOf(<QuantityText quantity={1_200} />)).toBe(`1${NBSP}200`);
  });

  it('нулевой остаток подписан текстом, а не только цветом', () => {
    expect(textOf(<QuantityText quantity={0} />)).toBe('0 — нет в наличии');
  });

  it('старый макет подписан текстом «из них к утилизации»', () => {
    const { container, getByText } = render(
      <QuantityText quantity={1_500} obsoleteQuantity={1_000} />,
    );
    expect(container.textContent).toBe(`1${NBSP}500из них к утилизации: 1${NBSP}000`);
    expect(getByText(/из них к утилизации/)).toHaveClass('quantity__obsolete');
  });

  it('obsoleteQuantity = 0 — подписи нет', () => {
    expect(textOf(<QuantityText quantity={10} obsoleteQuantity={0} />)).toBe('10');
  });

  it('без obsoleteQuantity — подписи нет', () => {
    expect(textOf(<QuantityText quantity={10} />)).not.toContain('утилизации');
  });

  it('весь остаток — старый макет', () => {
    expect(textOf(<QuantityText quantity={5} obsoleteQuantity={5} />)).toBe(
      '5из них к утилизации: 5',
    );
  });

  it('нулевой остаток не показывает подпись старого макета', () => {
    expect(textOf(<QuantityText quantity={0} obsoleteQuantity={3} />)).toBe('0 — нет в наличии');
  });
});
