import { beforeAll, describe, expect, it } from 'vitest';
import { courses } from '../../src/courses';
import { initPhysics, Physics } from '../../src/physics';
import { tuning } from '../../src/config';
beforeAll(initPhysics);

// 直線を一定入力で転がし、上下方向の速度の最大値を測る。
function roll(courseIndex: number, from: { x: number; z: number }, speed: number, seconds: number) {
  const c = courses[courseIndex];
  const game = new Physics(c, () => {});
  game.round.start(0);
  game.teleport({ x: from.x, y: c.start.y, z: from.z });
  for (let i = 0; i < 240; i++) game.step({ x: 0, z: 0 }, i * tuning.step);
  game.ball.setLinvel({ x: 0, y: 0, z: -speed }, true);
  game.ball.setAngvel({ x: -speed / tuning.radius, y: 0, z: 0 }, true);
  let bump = 0;
  for (let i = 0; i < seconds / tuning.step; i++) {
    game.step({ x: 0, z: -0.6 }, 2 + i * tuning.step);
    bump = Math.max(bump, Math.abs(game.ball.linvel().y));
  }
  const end = game.position;
  game.dispose();
  return { bump, end };
}

describe('転がりの手触り', () => {
  it.each([
    ['入門の曲線路', 0, { x: 0, z: -5 }, 9],
    ['ネオンの直線と島の縁', 3, { x: 0, z: -100 }, 9],
    ['ネオンの高速走行', 3, { x: 0, z: -2 }, 20],
    ['水晶の入口', 4, { x: 0, z: -2 }, 9],
  ] as const)('%s: 路面の継ぎ目や島の縁で球が跳ねない', (_, index, from, speed) => {
    const { bump, end } = roll(index, from, speed, 1.5);
    expect(end.z).toBeLessThan(from.z - 10);
    expect(bump).toBeLessThan(0.3);
  });
});
