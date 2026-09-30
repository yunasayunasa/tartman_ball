import { beforeAll, describe, expect, it } from 'vitest';
import { courses, restRemaining, type Course, type Platform, type Vec } from '../../src/courses';
import { initPhysics, Physics } from '../../src/physics';
import { tuning } from '../../src/config';
import { normalize } from '../../src/input';
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

// 手前の島で待ち、橋が緑（静止）になってから reaction 秒後に対岸へ全力で傾ける。
function crossAfterDock(course: Course, bridge: Platform, reaction: number) {
  const axis = { x: Math.sin(bridge.angle ?? 0), z: Math.cos(bridge.angle ?? 0) };
  const decks = course.platforms.filter((p) => p.shape === 'disc' && !p.motion);
  const nearest = (x: number, z: number) =>
    decks.reduce((a, d) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(a.x - x, a.z - z) ? d : a));
  let from: Vec = nearest(bridge.x - (axis.x * bridge.d) / 2, bridge.z - (axis.z * bridge.d) / 2),
    to: Vec = nearest(bridge.x + (axis.x * bridge.d) / 2, bridge.z + (axis.z * bridge.d) / 2);
  if (from.z < to.z) [from, to] = [to, from];
  const game = new Physics(course, () => {});
  game.round.start(0);
  game.teleport({ ...from, y: from.y + 0.6 });
  let t = 0;
  const step = (x: number, z: number) => {
    game.step(normalize(x, z), t);
    t += tuning.step;
  };
  const hold = () => {
    const v = game.ball.linvel(),
      p = game.position;
    step((from.x - p.x) * 0.5 - v.x * 0.8, (from.z - p.z) * 0.5 - v.z * 0.8);
  };
  const full = bridge.motion!.dwell! * bridge.motion!.period;
  // 次に緑へ変わる瞬間まで待つ。
  while (t < 1 || restRemaining(bridge, game.simulationTime) < full - 0.05) hold();
  const go = t + reaction;
  while (t < go) hold();
  const length = Math.hypot(to.x - from.x, to.z - from.z),
    d = { x: (to.x - from.x) / length, z: (to.z - from.z) / length };
  try {
    for (const end = t + 8; t < end;) {
      if (game.round.phase !== 'playing') return false;
      const p = game.position;
      if (Math.hypot(p.x - to.x, p.z - to.z) < 2.5 && game.grounded) return true;
      const along = (p.x - from.x) * d.x + (p.z - from.z) * d.z;
      step(d.x - (p.x - from.x - along * d.x) * 0.5, d.z - (p.z - from.z - along * d.z) * 0.5);
    }
    return false;
  } finally {
    game.dispose();
  }
}

describe('回転橋のタイミング', () => {
  it.each([
    ['お菓子のウエハース橋', 2, 0],
    ['風車群島の最後の橋', 5, 2],
  ] as const)('%s: 緑になってすぐ渡れば成功し、出遅れると落ちる', (_, index, bridgeIndex) => {
    const course = courses[index],
      bridge = course.platforms.filter((p) => p.motion?.kind === 'rotate')[bridgeIndex];
    expect(crossAfterDock(course, bridge, 0.4)).toBe(true);
    expect(crossAfterDock(course, bridge, 1.6)).toBe(true);
    expect(crossAfterDock(course, bridge, 3.2)).toBe(false);
  });
});

describe('落下・ゴール・着地の物理', () => {
  it('落下中も球は落ち続け、空中で止まらない', () => {
    const game = new Physics(courses[0], () => {});
    game.round.start(0);
    game.teleport({ x: 60, y: -9, z: -20 });
    game.step({ x: 0, z: 0 }, 0);
    expect(game.round.phase).toBe('falling');
    const y = game.position.y;
    for (let i = 1; i < 30; i++) game.step({ x: 0, z: 0 }, i * tuning.step);
    expect(game.round.phase).toBe('falling');
    expect(game.position.y).toBeLessThan(y - 0.5);
    game.dispose();
  });
  it('ゴール後は入力を受けずに止まり、結果は変わらない', () => {
    const events: string[] = [];
    const course = courses[3],
      game = new Physics(course, (e) => events.push(e));
    game.round.start(0);
    const goal = course.goal;
    game.teleport({ ...goal, z: goal.z + 1.5, y: goal.y + 0.6 });
    game.ball.setLinvel({ x: 0, y: 0, z: -20 }, true);
    for (let i = 0; i < 10 && game.round.phase === 'playing'; i++)
      game.step({ x: 0, z: -1 }, i * tuning.step);
    expect(game.round.phase).toBe('finished');
    const time = game.round.finishedTime;
    for (let i = 0; i < 360; i++) game.step({ x: 1, z: -1 }, 1 + i * tuning.step);
    const v = game.ball.linvel();
    expect(Math.hypot(v.x, v.z)).toBeLessThan(0.3);
    // 最高速度で入っても、ゴールの島から落ちない。
    expect(Math.hypot(game.position.x - goal.x, game.position.z - goal.z)).toBeLessThan(6.5);
    expect(game.position.y).toBeGreaterThan(goal.y);
    expect(game.round.finishedTime).toBe(time);
    expect(events.filter((e) => e === 'goal')).toHaveLength(1);
    game.dispose();
  });
  it('ジャンプからの着地を一度だけ知らせ、強さを渡す', () => {
    const events: string[] = [];
    const course = courses[1],
      game = new Physics(course, (e) => events.push(e));
    game.round.start(0);
    const pad = course.pads.find((p) => p.type === 'jump')!;
    game.teleport({ ...pad, y: (pad.y ?? 0) + 0.52 });
    for (let i = 0; i < 240; i++) game.step({ x: 0, z: 0 }, i * tuning.step);
    expect(events).toContain('jump');
    expect(events.filter((e) => e === 'land')).toHaveLength(1);
    expect(events.indexOf('land')).toBeGreaterThan(events.indexOf('jump'));
    expect(game.landingSpeed).toBeGreaterThan(4);
    game.dispose();
  });
});
