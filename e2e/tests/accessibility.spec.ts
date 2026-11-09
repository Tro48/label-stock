import { expect, test } from '@playwright/test';
import { createLabelViaApi, expectNoAxeViolations, scanBarcode } from './fixtures';

test.describe('axe: нарушений WCAG 2.2 AA нет', () => {
  test('главный экран', async ({ page, request }) => {
    await createLabelViaApi(request, { quantity: 0 });
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('карточка позиции и вкладка истории', async ({ page, request }) => {
    const label = await createLabelViaApi(request);
    await page.goto('/');
    await scanBarcode(page, label.barcode!);
    const card = page.getByRole('dialog', { name: 'Карточка позиции' });
    await expect(card).toBeVisible();
    await expectNoAxeViolations(page);

    await card.getByRole('tab', { name: 'История' }).click();
    await expect(card.getByRole('table')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('форма позиции с ошибками валидации', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Добавить' }).click();
    const form = page.getByRole('dialog', { name: 'Новая позиция' });
    await form.getByLabel('Номер макета').fill('12a');
    await form.getByRole('button', { name: 'Сохранить' }).click();
    await expect(form.getByText('Только цифры', { exact: true }).last()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('скан не найден', async ({ page }) => {
    await page.goto('/');
    await scanBarcode(page, 'NOTFOUND123456');
    await expect(page.getByText('Штрихкод NOTFOUND123456 не найден')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('удалённые позиции', async ({ page, request }) => {
    const label = await createLabelViaApi(request);
    await request.delete(`/api/labels/${label.id}`);
    await page.goto('/#/deleted');
    await expect(page.getByRole('heading', { name: 'Удалённые позиции' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
