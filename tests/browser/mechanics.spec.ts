import { test, expect } from '@playwright/test';

test('neon boost animates, leaves a trail, and clears after restart', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await page.locator('#course-3').click();
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await page.evaluate(() => {
    const pad = window.__test.course().pads.find((p) => p.type === 'dash')!;
    window.__test.teleport({ ...pad, y: (pad.y ?? 0) + 0.52 });
  });
  await expect.poll(() => page.evaluate(() => window.__test.snapshot().dash.active)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__test.snapshot().dash.trailVertices))
    .toBeGreaterThan(30);
  await expect
    .poll(() => page.evaluate(() => window.__test.snapshot().dash.fov))
    .toBeGreaterThan(59);
  await page.screenshot({ path: info.outputPath('neon-boost.png') });
  const before = await page.evaluate(() => window.__test.snapshot().dash.streakPhase);
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => window.__test.snapshot().velocity.x))
    .toBeGreaterThan(5);
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.__test.snapshot().dash.streakPhase)).toBeGreaterThan(
    before,
  );
  await page.screenshot({ path: info.outputPath('neon-turn.png') });
  await page.locator('#pause').click();
  await page.locator('#restart').click();
  await expect
    .poll(() => page.evaluate(() => window.__test.snapshot().dash.intensity))
    .toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('all stages render their main-route mechanic without page errors', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let index = 0; index < 6; index++) {
    await page.goto('/?test');
    await page.locator(`#course-${index}`).click();
    await page.locator('#stick').click();
    await page.locator('#start').click();
    await page.evaluate((index) => {
      const c = window.__test.course();
      const section = c.sections?.[0];
      const target = section ?? c.route[8];
      window.__test.teleport({ ...target, y: target.y + 0.6 });
    }, index);
    await expect(page.locator('#time')).toBeVisible();
    await page.waitForTimeout(250);
    await page.screenshot({ path: info.outputPath(`stage-${index}.png`) });
    expect(await page.evaluate(() => window.__test.snapshot().phase)).toBe('playing');
  }
  expect(errors).toEqual([]);
});
