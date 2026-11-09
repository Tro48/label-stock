import { expect, test } from '@playwright/test';
import { expectNoAxeViolations, searchBox, uniqueDigits } from './fixtures';

const HEADER = 'Контрагент;№ макета;Штрихкод;Дата печати;Остаток;Комментарий';

function csvFile(lines: string[]) {
  return {
    name: 'ostatki.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`\uFEFF${[HEADER, ...lines].join('\r\n')}\r\n`, 'utf-8'),
  };
}

test('загрузка из CSV: проверка, отчёт и запись', async ({ page }) => {
  const layoutNumber = `0${uniqueDigits()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Загрузить из CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Загрузка из CSV' });

  await dialog
    .getByLabel('CSV-файл')
    .setInputFiles(csvFile([`E2E Импорт;${layoutNumber};;01.11.2026;1 500;из файла`]));
  await dialog.getByRole('button', { name: 'Проверить файл' }).click();
  await expect(dialog.getByText('Ошибок нет. Будет создано: 1')).toBeVisible();
  await expectNoAxeViolations(page);

  await dialog.getByRole('button', { name: 'Загрузить' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Загружено из CSV: создано 1')).toBeVisible();

  await searchBox(page).fill(layoutNumber);
  await expect(page.getByRole('row').filter({ hasText: layoutNumber })).toContainText('1 500');
});

test('загрузка из CSV с ошибками ничего не пишет и показывает строки', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Загрузить из CSV' }).click();
  const dialog = page.getByRole('dialog', { name: 'Загрузка из CSV' });

  await dialog.getByLabel('CSV-файл').setInputFiles(csvFile(['E2E Ошибка;12a;;31.02.2026;-5;']));
  await dialog.getByRole('button', { name: 'Проверить файл' }).click();

  await expect(dialog.getByText('В файле есть ошибки, ничего не загружено')).toBeVisible();
  await expect(dialog.getByText('Строка 2: № макета: Только цифры')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Загрузить' })).toHaveCount(0);
  await expectNoAxeViolations(page);
});
