import { expect, test } from '@playwright/test';
import { createLabelViaApi, expectNoAxeViolations, scanBarcode } from './fixtures';

test('общая история: операция, поиск по макету и штрихкоду, доступность', async ({
  page,
  request,
}) => {
  const label = await createLabelViaApi(request, { quantity: 100 });
  const movement = await request.post(`/api/labels/${label.id}/movements`, {
    data: { reason: 'consumption', delta: -7, comment: 'E2E история' },
  });
  expect(movement.status()).toBe(201);

  await page.goto('/#/history');
  // The table's two matching data rows because creation and consumption both belong to the unique test label;
  // no other test uses the generated unique values.
  const table = page.getByRole('table', { name: /История изменений:/ });
  const row = table.getByRole('row').filter({ hasText: label.layoutNumber! });
  await expect(row).toHaveCount(2);
  await expect(row.first()).toContainText('Списание');
  await expect(row.first()).toContainText('−7');
  await expect(row.first()).toContainText('93');
  await expect(row.first()).toContainText('E2E история');

  const search = page.getByRole('searchbox', { name: 'Поиск по истории' });
  await search.fill('no-such-layout');
  await expect(page.getByText('Ничего не найдено. Измените условия поиска.')).toBeVisible();
  await search.fill(label.layoutNumber!);
  await expect(row).toHaveCount(2);
  await search.fill(label.barcode!.slice(-8));
  await expect(row).toHaveCount(2);
  await search.fill('');
  await page.getByRole('heading', { name: 'История изменений' }).click();
  await scanBarcode(page, label.barcode!);
  await expect(search).toHaveValue(label.barcode!);
  await expect(row).toHaveCount(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expectNoAxeViolations(page);
});
