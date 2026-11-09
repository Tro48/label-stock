import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Уникальный суффикс: тесты не чистят БД и не должны конфликтовать по номерам и штрихкодам. */
export function uniqueDigits(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
}

interface CreatedLabel {
  id: string;
  layoutNumber: string | null;
  barcode: string | null;
  quantity: number;
}

export async function createLabelViaApi(
  request: APIRequestContext,
  { quantity = 100, barcode }: { quantity?: number; barcode?: string } = {},
): Promise<CreatedLabel> {
  const counterpartyResponse = await request.post('/api/counterparties', {
    data: { name: `E2E Контрагент ${uniqueDigits()}` },
  });
  const counterparty = (await counterpartyResponse.json()) as { id: string };
  const response = await request.post('/api/labels', {
    data: {
      counterpartyId: counterparty.id,
      layoutNumber: `0${uniqueDigits()}`,
      barcode: barcode ?? `E2E${uniqueDigits()}`,
      printedAt: '2026-11-01',
      quantity,
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as CreatedLabel;
}

/**
 * Сканер-клавиатура: символы с интервалом меньше порога распознавания (35 мс) и Enter в конце.
 * Фокус не в поле ввода — проверяем глобальный перехват.
 */
export async function scanBarcode(page: Page, code: string): Promise<void> {
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press('Enter');
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(({ id, help, nodes }) => ({ id, help, count: nodes.length })),
  ).toEqual([]);
}

export const searchBox = (page: Page) =>
  page.getByRole('searchbox', { name: 'Найти или отсканировать штрихкод' });
