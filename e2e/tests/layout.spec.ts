import { expect, test, type Page } from '@playwright/test';
import { createLabelViaApi } from './fixtures';

const ROWS_TO_OVERFLOW = 20;

const scrollMetrics = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.screen > .table-scroll');
    return {
      viewportHeight: window.innerHeight,
      pageScrollHeight: document.documentElement.scrollHeight,
      pageScrollY: window.scrollY,
      listOverflows: list ? list.scrollHeight > list.clientHeight : false,
    };
  });

test.describe('прокручивается только список', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeAll(async ({ request }) => {
    const response = await request.get('/api/labels?pageSize=1');
    const { total } = (await response.json()) as { total: number };
    for (let created = total; created < ROWS_TO_OVERFLOW; created += 1) {
      await createLabelViaApi(request);
    }
  });

  test('страница не выше окна, даже когда список длиннее экрана', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    const metrics = await scrollMetrics(page);
    expect(metrics.listOverflows).toBe(true);
    // Раньше скрытые подписи кнопок в строках растягивали страницу до последней строки.
    expect(metrics.pageScrollHeight).toBe(metrics.viewportHeight);
  });

  test('колесо над фильтрами не прокручивает страницу, шапка и фильтры на месте', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('table')).toBeVisible();
    const search = page.getByRole('searchbox');
    const searchTopBefore = (await search.boundingBox())?.y;

    await search.hover();
    await page.mouse.wheel(0, 2000);
    await page.getByRole('row').nth(5).hover();
    await page.mouse.wheel(0, 2000);

    await expect.poll(async () => (await scrollMetrics(page)).pageScrollY).toBe(0);
    expect((await search.boundingBox())?.y).toBe(searchTopBefore);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  });
});
