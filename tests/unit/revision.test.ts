import { beforeAll, describe, expect, it } from 'vitest';
import { RouteCamera, screenToWorld } from '../../src/camera';
import { courses, safeAt, surfaceHeight, platformPose, type Course } from '../../src/courses';
import { Physics, initPhysics } from '../../src/physics';
import { Save } from '../../src/storage';
import { tuning } from '../../src/config';
beforeAll(initPhysics);
describe('追従カメラと画面基準入力', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('yaw=%sでも入力の長さと直交性を守る', (yaw) => {
    const right = screenToWorld({ x: 1, z: 0 }, yaw),
      forward = screenToWorld({ x: 0, z: -1 }, yaw);
    expect(Math.hypot(right.x, right.z)).toBeCloseTo(1);
    expect(right.x * forward.x + right.z * forward.z).toBeCloseTo(0);
    expect(forward.x).toBeCloseTo(-Math.sin(yaw));
    expect(forward.z).toBeCloseTo(-Math.cos(yaw));
  });
  it('停止時は向きを保持し、旋回を1秒0.8rad以内に制限する', () => {
    const camera = new RouteCamera(),
      c = courses[2],
      p = { ...c.route[0], y: 0.52 };
    camera.reset(p, c);
    const start = camera.yaw;
    camera.update({ ...c.route[10], y: 0.52 }, c, 1, 0);
    expect(camera.yaw).toBe(start);
    for (let i = 1; i < c.route.length - 1; i++) {
      const last = camera.yaw;
      camera.update({ ...c.route[i], y: c.route[i].y + 0.52 }, c, 1 / 60, 9);
      expect(Math.abs(camera.yaw - last)).toBeLessThanOrEqual(0.8 / 60 + 1e-9);
    }
  });
  it('上下に重なる道では高さの近い経路へ復帰する', () => {
    const c: Course = {
      ...courses[0],
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -10 },
      ],
      branches: [
        [
          { x: 0, y: 10, z: 0 },
          { x: 10, y: 10, z: 0 },
        ],
      ],
    };
    const camera = new RouteCamera();
    camera.reset({ x: 0, y: 10.52, z: 0 }, c);
    expect(camera.yaw).toBeCloseTo(-Math.PI / 2);
  });
});
describe('移行・高低差・動く床', () => {
  it('v1の記録を残し設定だけv2へ移行する', () => {
    const original = JSON.stringify({
      version: 1,
      records: { 'course-1': { time: 12, tarts: 5 } },
      settings: { mode: 'stick', sensitivity: 1.4, muted: true },
    });
    const entries = new Map([['sky-tart-roll.v1', original]]);
    const storage = {
      getItem: (k: string) => entries.get(k) ?? null,
      setItem: (k: string, v: string) => {
        entries.set(k, v);
      },
    };
    const save = new Save(storage);
    expect(save.records).toEqual({});
    expect(save.settings).toEqual({ mode: 'stick', sensitivity: 1.4, muted: true });
    save.records['course-1'] = { time: 150, tarts: 50 };
    expect(save.write()).toBe(true);
    expect(entries.get('sky-tart-roll.v1')).toBe(original);
    expect(new Save(storage).records['course-1'].time).toBe(150);
  });
  it('上り坂の高さを補間し、上下の支持面を区別する', () => {
    const ramp = {
      id: 'r',
      x: 0,
      y: 2,
      z: 0,
      w: 6,
      d: 10,
      safe: true,
      vertices: [
        { x: -3, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 3, y: 4, z: 10 },
        { x: -3, y: 4, z: 10 },
      ],
    };
    expect(surfaceHeight({ x: 0, z: 5 }, ramp)).toBeCloseTo(2);
    expect(surfaceHeight({ x: 10, z: 5 }, ramp)).toBeUndefined();
  });
  it.each(courses)('$name の動く床に乗れて、中断で周期も止まる', (course) => {
    const game = new Physics(course, () => {}),
      p = course.platforms.find((p) => p.motion)!;
    game.round.start(0);
    game.teleport({ x: p.x, y: p.y + 0.52, z: p.z });
    for (let i = 0; i < 120; i++) game.step({ x: 0, z: 0 }, i / 120);
    const pose = platformPose(p, game.simulationTime);
    expect(game.position.y).toBeCloseTo(pose.position.y + 0.52, 1);
    expect(safeAt(game.position, course)).toBe(false);
    const time = game.simulationTime,
      position = game.position;
    game.round.phase = 'paused';
    for (let i = 0; i < 120; i++) game.step({ x: 0, z: 0 }, 2 + i / 120);
    expect(game.simulationTime).toBe(time);
    expect(game.position).toEqual(position);
    game.dispose();
  });
  it('全分岐は本道の2点に接続し、片道限定タルトを要求しない', () => {
    for (const c of courses)
      for (const branch of c.branches) {
        for (const p of [branch[0], branch.at(-1)!])
          expect(c.route.some((q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 0.001)).toBe(
            true,
          );
      }
  });
});
describe('滑走調整', () => {
  it('同じ初速から3秒間の惰性距離を15〜25%伸ばす', () => {
    const c: Course = {
      ...courses[0],
      platforms: [{ id: 'flat', x: 0, y: 0, z: -100, w: 50, d: 500, safe: true }],
      pads: [],
      tarts: [],
      checkpoints: [],
    };
    const measure = (damping: number) => {
      const previous = tuning.damping;
      tuning.damping = damping;
      const game = new Physics(c, () => {});
      game.round.start(0);
      for (let i = 0; i < 60; i++) game.step({ x: 0, z: 0 }, i / 120);
      game.ball.setLinvel({ x: 0, y: 0, z: -7 }, true);
      game.ball.setAngvel({ x: -7 / tuning.radius, y: 0, z: 0 }, true);
      const start = game.position.z;
      for (let i = 0; i < 360; i++) game.step({ x: 0, z: 0 }, 0.5 + i / 120);
      const distance = start - game.position.z;
      game.dispose();
      tuning.damping = previous;
      return distance;
    };
    const ratio = measure(tuning.damping) / measure(0.52);
    expect(ratio).toBeGreaterThanOrEqual(1.15);
    expect(ratio).toBeLessThanOrEqual(1.25);
  });
});
