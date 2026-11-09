import { expect, test, type Locator, type Page } from '@playwright/test';
import { createLabelViaApi, searchBox } from './fixtures';

async function tabUntilFocused(page: Page, target: Locator, maxSteps = 15) {
  for (let step = 0; step < maxSteps; step++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

async function findRow(page: Page, layoutNumber: string) {
  await searchBox(page).fill(layoutNumber);
  const row = page.getByRole('row').filter({ hasText: layoutNumber });
  await expect(row).toHaveCount(1);
  return row;
}

test('удаление → отмена из уведомления', async ({ page, request }) => {
  const label = await createLabelViaApi(request);
  await page.goto('/');
  const row = await findRow(page, label.layoutNumber!);

  await row.getByRole('button', { name: /Удалить/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Удалить позицию?' });
  await confirm.getByRole('button', { name: 'Удалить' }).click();

  await expect(page.getByText('Позиция удалена')).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.getByText('Позиция восстановлена')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: label.layoutNumber! })).toHaveCount(1);
});

test('удаление → восстановление из «Удалённых»', async ({ page, request }) => {
  const label = await createLabelViaApi(request);
  await request.delete(`/api/labels/${label.id}`);

  await page.goto('/');
  await page.getByRole('link', { name: 'Удалённые' }).click();
  await expect(page.getByRole('heading', { name: 'Удалённые позиции' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: label.layoutNumber! });
  await row.getByRole('button', { name: /Восстановить/ }).click();
  await expect(page.getByText('Позиция восстановлена')).toBeVisible();

  await page.getByRole('link', { name: 'Остатки' }).click();
  await findRow(page, label.layoutNumber!);
});

test('весь путь с клавиатуры: создать позицию и списать', async ({ page }) => {
  await page.goto('/');
  const layoutNumber = `00${Date.now()}`.slice(0, 14);

  // Tab-порядок: ссылка «к содержимому», навигация, поиск, фильтр, чекбокс, «Добавить».
  const addButton = page.getByRole('button', { name: 'Добавить' });
  await tabUntilFocused(page, addButton);
  await page.keyboard.press('Enter');

  const form = page.getByRole('dialog', { name: 'Новая позиция' });
  await expect(form.getByLabel(/Контрагент/)).toBeFocused();
  await page.keyboard.type(`E2E Клавиатура ${layoutNumber}`);
  await page.keyboard.press('Tab');
  await page.keyboard.type(layoutNumber);
  // Дальше штрихкод и дата печати (по умолчанию сегодня). В Chromium Tab ходит и по сегментам
  // даты, поэтому до поля остатка идём, пока оно не получит фокус.
  await tabUntilFocused(page, form.getByLabel(/Остаток/));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');

  await expect(form).toBeHidden();
  await expect(page.getByText('Позиция создана')).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: layoutNumber });
  const changeButton = row.getByRole('button', { name: /Изменить остаток/ });
  await changeButton.focus();
  await page.keyboard.press('Enter');
  const card = page.getByRole('dialog', { name: 'Карточка позиции' });
  await page.keyboard.type('15');
  await page.keyboard.press('Enter');
  await expect(card).toBeHidden();
  await expect(page.getByText('Списано 15 шт., остаток 25 шт.')).toBeVisible();
});

test('дубль номера макета: ошибка у поля и ссылка на занявшую позицию', async ({
  page,
  request,
}) => {
  const existing = await createLabelViaApi(request);
  await page.goto('/');
  await page.getByRole('button', { name: 'Добавить' }).click();
  const form = page.getByRole('dialog', { name: 'Новая позиция' });
  await form.getByLabel(/Контрагент/).fill('E2E Дубль');
  await form.getByLabel('Номер макета').fill(existing.layoutNumber!);
  await form.getByRole('button', { name: 'Сохранить' }).click();

  await expect(form.getByText('Номер макета уже занят другой позицией')).toBeVisible();
  await form.getByRole('button', { name: 'Открыть позицию с этим номером' }).click();
  await expect(page.getByRole('dialog', { name: 'Карточка позиции' })).toContainText(
    existing.layoutNumber!,
  );
});
