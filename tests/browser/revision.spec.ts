import { test, expect } from '@playwright/test';
for (let course = 0; course < 5; course++) {
  test('テーマ' + (course + 1) + 'の近接カメラ・景観・描画負荷', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?test');
    await page.locator('#course-' + course).click();
    await page.locator('#stick').click();
    await page.locator('#start').click();
    await expect(page.locator('#time')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__test.snapshot().framing.height))
      .toBeGreaterThan(0.12);
    const frame = await page.evaluate(() => window.__test.snapshot().framing);
    expect(frame.height).toBeLessThan(0.18);
    expect(frame.y).toBeGreaterThan(0.5);
    expect(frame.y).toBeLessThan(0.78);
    await page.screenshot({ path: info.outputPath('start.png') });
    for (const [name, ratio] of [
      ['vista', 0.5],
      ['finale', 0.9],
    ] as const) {
      await page.evaluate((ratio) => {
        const path = window.__test.course().route,
          p = path[Math.floor(path.length * ratio)];
        window.__test.teleport({ ...p, y: p.y + 0.6 });
      }, ratio);
      await expect
        .poll(() => page.evaluate(() => window.__test.snapshot().framing.x))
        .toBeGreaterThan(0.45);
      await page.screenshot({ path: info.outputPath(name + '.png') });
    }
    expect((await page.evaluate(() => window.__test.snapshot())).calls).toBeLessThan(220);
    expect(errors).toEqual([]);
  });
}
test('旧記録を混ぜず、操作設定は公開版の更新後も引き継ぐ', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sky-tart-roll.v1',
      JSON.stringify({
        version: 1,
        records: { 'course-1': { time: 10, tarts: 5 } },
        settings: { mode: 'stick', sensitivity: 1.3, muted: true },
      }),
    );
  });
  await page.goto('/?test');
  await expect(page.locator('#course-0')).toContainText('未記録');
  await page.locator('#course-0').click();
  await expect(page.locator('#stick')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#start').click();
  await page.locator('#pause').click();
  await expect(page.locator('#muted')).toBeChecked();
  await expect(page.locator('#sensitivity')).toHaveValue('1.3');
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('sky-tart-roll.v1')!).records['course-1'].time,
    ),
  ).toBe(10);
});
