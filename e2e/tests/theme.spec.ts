import { expect, test, type Page } from '@playwright/test';
import { createLabelViaApi, expectNoAxeViolations, scanBarcode } from './fixtures';

const backgroundOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('тёмная тема', () => {
  test('включается по настройке системы', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await backgroundOf(page)).toBe('rgb(18, 20, 23)');
  });

  test('явный выбор сохраняется после перезагрузки и важнее системы', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByLabel('Тема').selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await backgroundOf(page)).toBe('rgb(18, 20, 23)');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.getByLabel('Тема').selectOption('light');
    expect(await backgroundOf(page)).toBe('rgb(255, 255, 255)');
  });

  test('axe: контраст и разметка в тёмной теме', async ({ page, request }) => {
    const label = await createLabelViaApi(request, { quantity: 0 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoAxeViolations(page);

    await scanBarcode(page, label.barcode!);
    await expect(page.getByRole('dialog', { name: 'Карточка позиции' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');

    await scanBarcode(page, 'DARKNOTFOUND1');
    await expect(page.getByText('Штрихкод DARKNOTFOUND1 не найден')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
