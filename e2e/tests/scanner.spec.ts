import { expect, test } from '@playwright/test';
import { createLabelViaApi, scanBarcode, searchBox, uniqueDigits } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Остатки этикетки' })).toBeVisible();
});

test('скан → найдено → списание → фокус вернулся в поиск', async ({ page, request }) => {
  const label = await createLabelViaApi(request, { quantity: 100 });

  await scanBarcode(page, label.barcode!);

  const card = page.getByRole('dialog', { name: 'Карточка позиции' });
  await expect(card).toBeVisible();
  const amount = card.getByLabel('Количество, шт.');
  await expect(amount).toBeFocused();
  await amount.fill('30');
  await amount.press('Enter');

  await expect(card).toBeHidden();
  await expect(page.getByText('Списано 30 шт., остаток 70 шт.')).toBeVisible();
  await expect(searchBox(page)).toBeFocused();

  // Следующий скан сразу из строки поиска: код не должен остаться в поле.
  await scanBarcode(page, label.barcode!);
  await expect(card).toBeVisible();
  await expect(searchBox(page)).toHaveValue('');
});

test('Esc закрывает карточку после скана', async ({ page, request }) => {
  const label = await createLabelViaApi(request);
  await scanBarcode(page, label.barcode!);
  const card = page.getByRole('dialog', { name: 'Карточка позиции' });
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
});

test('скан → не найдено → создание с заполненным штрихкодом', async ({ page }) => {
  const barcode = `NEW${uniqueDigits()}`;

  await scanBarcode(page, barcode);

  await expect(page.getByText(`Штрихкод ${barcode} не найден`)).toBeVisible();
  await page.getByRole('button', { name: 'Создать позицию' }).click();

  const form = page.getByRole('dialog', { name: 'Новая позиция' });
  await expect(form.getByLabel('Штрихкод')).toHaveValue(barcode);
  await form.getByLabel(/Контрагент/).fill(`E2E Новый ${uniqueDigits()}`);
  await form.getByLabel('Остаток, шт.', { exact: false }).fill('250');
  await form.getByRole('button', { name: 'Сохранить' }).click();

  await expect(form).toBeHidden();
  await expect(page.getByText('Позиция создана')).toBeVisible();
  await expect(page.getByRole('cell', { name: barcode, exact: true })).toBeVisible();
});

test('списание больше остатка показывает понятную ошибку', async ({ page, request }) => {
  const label = await createLabelViaApi(request, { quantity: 5 });
  await scanBarcode(page, label.barcode!);
  const card = page.getByRole('dialog', { name: 'Карточка позиции' });
  await card.getByLabel('Количество, шт.').fill('6');
  await card.getByRole('button', { name: 'Списать' }).click();
  await expect(card.getByRole('alert')).toHaveText('Остаток не может уйти в минус');
});
