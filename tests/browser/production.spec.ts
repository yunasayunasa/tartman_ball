import { test, expect } from '@playwright/test';
test('本番ビルドをリポジトリ配下から配信し、外部依存なしで起動・収集する', async ({ page }) => {
  const failures: string[] = [],
    external: string[] = [],
    errors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://127.0.0.1:5178/') &&
      !request.url().startsWith('data:') &&
      !request.url().startsWith('blob:')
    )
      external.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5178/sky-tart-roll/?test');
  await expect(page.locator('.course')).toHaveCount(6);
  await expect(page.locator('#world')).toHaveAttribute('data-character', 'NlaTrack');
  expect(await page.evaluate(() => '__test' in window)).toBe(false);
  for (let i = 0; i < 6; i++) {
    await page.locator(`#course-${i}`).click();
    await expect(page.locator('#start')).toBeVisible();
    await page.locator('#stick').click();
    await page.locator('#start').click();
    await expect(page.locator('#time')).toBeVisible();
    await page.goto('http://127.0.0.1:5178/sky-tart-roll/?test');
  }
  await page.locator('#course-0').click();
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#world')).toHaveAttribute('data-character-state', 'running');
  await expect(page.locator('#tarts')).toHaveText(/^[1-9]\d* \//);
  await page.keyboard.up('ArrowUp');
  expect(await page.locator('#tarts').innerText()).toMatch(/^[1-9]/);
  await expect(page.locator('#pause')).toBeVisible();
  expect(
    (await page.request.get('http://127.0.0.1:5178/sky-tart-roll/licenses/NOTICE.txt')).status(),
  ).toBe(200);
  expect(failures).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
