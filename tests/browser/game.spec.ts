import { test, expect, type Page } from '@playwright/test';
type Snapshot = {
  phase: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  tarts: string[];
  checkpoint: number;
  elapsed: number;
  falls: number;
  records: Record<string, { time: number; tarts: number }>;
  memory: { geometries: number; textures: number };
  calls: number;
};
declare global {
  interface Window {
    __test: {
      snapshot(): Snapshot;
      teleport(p: { x: number; y: number; z: number }): void;
      course(): {
        tarts: { id: string; x: number; z: number }[];
        goal: { x: number; z: number };
        checkpoints: { x: number; z: number }[];
      };
      invalidateHistory(): void;
      pause(): void;
    };
  }
}
const snapshot = (page: Page) => page.evaluate(() => window.__test.snapshot());
async function begin(page: Page, index = 0) {
  await page.goto('/?test');
  await expect(page.locator('.course')).toHaveCount(5);
  await page.locator(`#course-${index}`).click();
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await expect(page.locator('#time')).toBeVisible();
}
test('5コースを自由に選択でき、スマホ縦画面からはみ出さない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await expect(page.locator('.course')).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await page.locator(`#course-${i}`).click();
    await expect(page.locator('#start')).toBeVisible();
    await page.locator('#back').click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
test('アナログスティックの強弱、指離し、キャンセル、慣性', async ({ page }) => {
  await begin(page);
  const box = (await page.locator('#joystick').boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y - 12);
  await page.mouse.down();
  await expect.poll(async () => (await snapshot(page)).velocity.z).toBeLessThan(-0.4);
  const low = Math.abs((await snapshot(page)).velocity.z);
  await page.mouse.move(x, y - 46);
  await expect
    .poll(async () => Math.abs((await snapshot(page)).velocity.z))
    .toBeGreaterThan(low + 1.5);
  await page.mouse.up();
  await expect(page.locator('#joystick span')).toHaveCSS('transform', 'none');
  expect((await snapshot(page)).velocity.z).toBeLessThan(0);
  await page.locator('#joystick').dispatchEvent('pointercancel', { pointerId: 1 });
  await expect(page.locator('#joystick span')).toHaveCSS('transform', 'none');
});
test('権限拒否からスティックに切り替えられる', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('denied'),
    });
  });
  await page.goto('/?test');
  await page.locator('#course-0').click();
  await page.locator('#start').click();
  await expect(page.locator('#input-error')).toContainText('許可がありません');
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await expect(page.locator('#time')).toBeVisible();
});
test('センサー未受信時はタイムアウトし、再試行かスティックを案内する', async ({ page }) => {
  await page.goto('/?test');
  await page.locator('#course-0').click();
  await page.locator('#start').click();
  await expect(page.locator('#input-error')).toContainText('受信できません', { timeout: 6000 });
  await expect(page.locator('#start')).toBeEnabled();
});
test('疑似センサー基準登録・入力・受信停止時の安全な中断', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: () => Promise.resolve('granted'),
    });
    setInterval(() => {
      if (!(window as unknown as { stopSensor?: boolean }).stopSensor)
        window.dispatchEvent(
          new DeviceOrientationEvent('deviceorientation', {
            alpha: 0,
            beta: (window as unknown as { beta?: number }).beta ?? 40,
            gamma: 0,
          }),
        );
    }, 30);
  });
  await page.goto('/?test');
  await page.locator('#course-0').click();
  await page.locator('#start').click();
  await expect(page.locator('#time')).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { beta: number }).beta = 25;
  });
  await expect.poll(async () => (await snapshot(page)).position.z).toBeLessThan(-0.5);
  await page.evaluate(() => {
    (window as unknown as { stopSensor: boolean }).stopSensor = true;
  });
  await expect(page.locator('#resume')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.panel')).toContainText('受信が止まりました');
});
test('中断中も時間は進み、物理は止まる。再開は明示操作', async ({ page }) => {
  await begin(page);
  await page.locator('#pause').click();
  const before = await snapshot(page);
  await expect
    .poll(async () => (await snapshot(page)).elapsed)
    .toBeGreaterThan(before.elapsed + 0.4);
  expect((await snapshot(page)).position).toEqual(before.position);
  expect((await snapshot(page)).phase).toBe('paused');
  await page.locator('#resume').click();
  await expect(page.locator('#time')).toBeVisible();
});
test('タルト取得→CP通過→履歴なし落下→復帰で取得とCPを保持する', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => {
    const t = window.__test.course().tarts[0];
    window.__test.teleport({ ...t, y: 0.6 });
  });
  await expect.poll(async () => (await snapshot(page)).tarts.length).toBe(1);
  await page.evaluate(() => {
    const cp = window.__test.course().checkpoints[0];
    window.__test.teleport({ ...cp, y: 0.6 });
  });
  await expect.poll(async () => (await snapshot(page)).checkpoint).toBe(0);
  await page.evaluate(() => {
    window.__test.invalidateHistory();
    window.__test.teleport({ x: 80, y: -12, z: -50 });
  });
  await expect.poll(async () => (await snapshot(page)).falls).toBe(1);
  const state = await snapshot(page);
  expect(state.checkpoint).toBe(0);
  expect(state.tarts).toHaveLength(1);
  expect(state.position.x).toBeCloseTo(12);
  await page.evaluate(() => {
    const t = window.__test.course().tarts[0];
    window.__test.teleport({ ...t, y: 0.6 });
  });
  await expect(page.locator('#tarts')).toContainText('1 /');
});
test('ゴールを一度だけ処理し、記録を保存、再読込で保持する', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => {
    window.__test.teleport({ ...window.__test.course().goal, y: 0.6 });
  });
  await expect(page.locator('.result')).toContainText('空の旅、クリア');
  const first = await snapshot(page);
  expect(first.tarts).toHaveLength(0);
  await expect(page.locator('.result')).toContainText('自己ベスト更新');
  const frozen = first.elapsed;
  await page.locator('#back').click();
  await page.reload();
  await expect(page.locator('#course-0')).not.toContainText('未記録');
  expect((await snapshot(page)).records['course-1'].time).toBe(frozen);
});
test('全収集マークと最初から再挑戦の初期化', async ({ page }) => {
  await begin(page);
  const tarts = await page.evaluate(() => window.__test.course().tarts);
  for (let i = 0; i < tarts.length; i++) {
    await page.evaluate((p) => window.__test.teleport({ ...p, y: 0.6 }), tarts[i]);
    await expect.poll(async () => (await snapshot(page)).tarts.length).toBe(i + 1);
  }
  await page.evaluate(() => window.__test.teleport({ ...window.__test.course().goal, y: 0.6 }));
  await expect(page.locator('.result')).toContainText('全タルト収集');
  await page.locator('#restart').click();
  const state = await snapshot(page);
  expect(state.phase).toBe('ready');
  expect(state.tarts).toHaveLength(0);
  expect(state.checkpoint).toBe(-1);
  expect(state.elapsed).toBe(0);
});
test('破損した保存データと保存拒否でも遊べる', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sky-tart-roll.v1', 'broken');
    Storage.prototype.setItem = () => {
      throw new DOMException('quota');
    };
  });
  await begin(page);
  await page.evaluate(() => window.__test.teleport({ ...window.__test.course().goal, y: 0.6 }));
  await expect(page.locator('.result')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('保存できません');
});
test('繰り返しコース選択しても描画資源が増え続けない', async ({ page }) => {
  await page.goto('/?test');
  await expect(page.locator('.course')).toHaveCount(5);
  const before = (await snapshot(page)).memory;
  for (let i = 0; i < 8; i++) {
    await page.locator(`#course-${i % 5}`).click();
    await page.locator('#back').click();
  }
  await expect
    .poll(async () => (await snapshot(page)).memory.geometries)
    .toBeLessThanOrEqual(before.geometries + 2);
  expect((await snapshot(page)).memory.textures).toBeLessThanOrEqual(before.textures + 1);
});
test('iPad相当の縦画面で操作ボタンが表示される（実機ではない）', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await begin(page);
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#pause')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(768);
});
test('背景へ移った通知で物理を止め、復帰通知だけでは再開しない', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#resume')).toBeVisible();
  const before = await snapshot(page);
  await expect
    .poll(async () => (await snapshot(page)).elapsed)
    .toBeGreaterThan(before.elapsed + 0.3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await snapshot(page)).phase).toBe('paused');
  expect((await snapshot(page)).position).toEqual(before.position);
  await page.locator('#resume').click();
  await expect(page.locator('#time')).toBeVisible();
});
test('ミュートと感度を保存し、再挑戦後も設定を保持する', async ({ page }) => {
  await begin(page);
  await page.locator('#pause').click();
  await page.locator('#muted').check();
  await page.locator('#sensitivity').fill('1.4');
  await page.locator('#restart').click();
  await page.locator('#start').click();
  await page.locator('#pause').click();
  await expect(page.locator('#muted')).toBeChecked();
  await expect(page.locator('#sensitivity')).toHaveValue('1.4');
  await page.reload();
  await page.locator('#course-0').click();
  await page.locator('#start').click();
  await page.locator('#pause').click();
  await expect(page.locator('#muted')).toBeChecked();
});
test('スマホ小画面とタブレットの表示資料を生成する', async ({ page }, info) => {
  await page.goto('/?test');
  await expect(page.locator('.course')).toHaveCount(5);
  await page.screenshot({ path: info.outputPath('menu.png') });
  await page.locator('#course-3').click();
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await expect(page.locator('#time')).toBeVisible();
  await page.screenshot({ path: info.outputPath('play.png') });
  await page.evaluate(() => window.__test.teleport({ x: 0, y: 0.6, z: -20 }));
  await expect.poll(async () => (await snapshot(page)).position.y).toBeLessThan(0.53);
  await page.screenshot({ path: info.outputPath('jump-approach.png') });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#pause').click();
  await expect(page.locator('#resume')).toBeInViewport();
  await page.locator('#back').scrollIntoViewIfNeeded();
  await expect(page.locator('#back')).toBeInViewport();
});
test('iPad相当の横向きでも縦持ち案内が出て物理は中断する', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 768, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5177/?test');
  await page.locator('#course-0').click();
  await page.locator('#stick').click();
  await page.locator('#start').click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('#landscape')).toBeVisible();
  expect((await snapshot(page)).phase).toBe('paused');
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('#landscape')).not.toBeVisible();
  await expect(page.locator('#resume')).toBeVisible();
  await context.close();
});
test('ミュート時は効果音ノードを生成しない', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioContext.prototype.createOscillator;
    (window as unknown as { soundCount: number }).soundCount = 0;
    AudioContext.prototype.createOscillator = function () {
      (window as unknown as { soundCount: number }).soundCount++;
      return original.call(this);
    };
  });
  await begin(page);
  const tarts = await page.evaluate(() => window.__test.course().tarts);
  await page.evaluate((t) => window.__test.teleport({ ...t, y: 0.6 }), tarts[0]);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { soundCount: number }).soundCount))
    .toBeGreaterThan(0);
  await page.locator('#pause').click();
  await page.locator('#muted').check();
  await page.locator('#resume').click();
  const count = await page.evaluate(() => (window as unknown as { soundCount: number }).soundCount);
  await page.evaluate((t) => window.__test.teleport({ ...t, y: 0.6 }), tarts[1]);
  await expect.poll(async () => (await snapshot(page)).tarts.length).toBe(2);
  expect(await page.evaluate(() => (window as unknown as { soundCount: number }).soundCount)).toBe(
    count,
  );
});
