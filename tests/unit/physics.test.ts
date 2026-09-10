import { beforeAll, describe, expect, it } from 'vitest';
import { courses, type Point } from '../../src/courses';
import { initPhysics, Physics, type GameEvent } from '../../src/physics';
import { tuning } from '../../src/config';
import { normalize } from '../../src/input';

beforeAll(async () => {
  await initPhysics();
});
function advance(game: Physics, seconds: number, x = 0, z = 0, start = 0) {
  for (let i = 0; i < seconds / tuning.step; i++) game.step({ x, z }, start + i * tuning.step);
}
// 入力だけを与えるルート追従。位置変更せずRapierの力・衝突で最後まで走る。
function drive(game: Physics, route: Point[], maxTime = 300, cruise = 7.5) {
  let index = 1,
    time = 0;
  while (time < maxTime && game.round.phase !== 'finished') {
    // Advance over points passed in flight; never steer back toward a skipped point over a gap.
    let nearest = index,
      nearestDistance = Infinity;
    for (let j = Math.max(0, index - 1); j < Math.min(route.length, index + 10); j++) {
      const distance = Math.hypot(route[j].x - game.position.x, route[j].z - game.position.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = j;
      }
    }
    index = Math.max(index, Math.min(route.length - 1, nearest + 1));
    const target = route[Math.min(index, route.length - 1)],
      pos = game.position,
      v = game.ball.linvel();
    const dx = target.x - pos.x,
      dz = target.z - pos.z,
      distance = Math.hypot(dx, dz);
    if (distance < 5 && index < route.length - 1) {
      index++;
      continue;
    }
    const speed = cruise;
    const desiredX = distance > 0.01 ? (dx / distance) * speed : 0;
    const desiredZ = distance > 0.01 ? (dz / distance) * speed : 0;
    game.step(normalize((desiredX - v.x) * 0.65, (desiredZ - v.z) * 0.65), time);
    time += tuning.step;
    if (game.round.phase === 'falling') break;
  }
  return { time, index, falls: game.round.falls, position: game.position, phase: game.round.phase };
}
describe('Rapier 実物理', () => {
  it('慣性を残し逆入力で減速できる', () => {
    const game = new Physics(courses[0], () => {});
    game.round.start(0);
    advance(game, 1, 0, -1);
    const accelerated = game.ball.linvel().z;
    advance(game, 0.3, 0, 0, 1);
    const coast = game.ball.linvel().z;
    expect(accelerated).toBeLessThan(-2);
    expect(coast).toBeLessThan(-1);
    expect(coast).toBeGreaterThan(accelerated);
    advance(game, 0.5, 0, 1, 1.3);
    expect(game.ball.linvel().z).toBeGreaterThan(coast);
    game.dispose();
  });
  it('落下復帰はCPを守り速度をリセットする', () => {
    const game = new Physics(courses[0], () => {});
    game.round.start(0);
    game.round.reachCheckpoint(0);
    game.teleport({ x: 100, y: -10, z: -30 });
    advance(game, 0.1);
    expect(game.round.phase).toBe('falling');
    advance(game, 0.8, 0, 0, 0.1);
    expect(game.position.x).toBeCloseTo(courses[0].checkpoints[0].x);
    expect(game.ball.linvel().x).toBeCloseTo(0, 3);
    expect(game.ball.angvel().x).toBeCloseTo(0, 3);
    game.dispose();
  });
  it('ジャンプ台の下面・横からは発動しない', () => {
    const events: GameEvent[] = [];
    const game = new Physics(courses[3], (e) => events.push(e));
    game.round.start(0);
    game.teleport({ x: 0, y: -2, z: -23 });
    advance(game, 0.1);
    expect(events).not.toContain('jump');
    game.dispose();
  });
  it('ダッシュパネルは一接触で一度、離れて再利用できる', () => {
    const events: GameEvent[] = [];
    const game = new Physics(courses[2], (e) => events.push(e));
    game.round.start(0);
    const pad = game.course.pads.find((p) => p.type === 'dash')!;
    game.teleport({ ...pad, y: (pad.y ?? 0) + 0.52 });
    advance(game, 0.08);
    expect(events.filter((e) => e === 'dash')).toHaveLength(1);
    advance(game, 0.3, 0, 0, 0.08);
    game.teleport({ ...pad, y: (pad.y ?? 0) + 0.52 });
    advance(game, 0.05, 0, 0, 0.4);
    expect(events.filter((e) => e === 'dash')).toHaveLength(2);
    game.dispose();
  });
  it.each(courses)('$name を共通アナログ入力と実物理だけで踏破する', (course) => {
    const events: GameEvent[] = [];
    const game = new Physics(course, (e) => events.push(e));
    game.round.start(0);
    const result = drive(game, course.route);
    expect(result, JSON.stringify(result)).toMatchObject({ phase: 'finished', falls: 0 });
    expect(result.time).toBeGreaterThanOrEqual(120);
    expect(result.time).toBeLessThanOrEqual(240);
    expect(events.filter((e) => e === 'goal')).toHaveLength(1);
    expect(events.filter((e) => e === 'jump')).toHaveLength(
      course.pads.filter((p) => p.type === 'jump').length,
    );
    if (course.pads.some((p) => p.type === 'dash')) expect(events).toContain('dash');
    game.dispose();
  });
  it.each(courses)(
    '$name の全分岐を実物理で渡って本道へ戻れる',
    (course) => {
      for (const branch of course.branches)
        for (const phase of [0, 1.5, 3, 4.5]) {
          const c = {
            ...course,
            start: { ...branch[0], y: branch[0].y + 0.6 },
            goal: branch.at(-1)!,
            route: branch,
            checkpoints: [],
          };
          const game = new Physics(c, () => {});
          game.round.start(0);
          advance(game, phase);
          const result = drive(game, branch, 90, 4);
          expect(
            result,
            course.name + ' phase ' + phase + ' ' + JSON.stringify(result),
          ).toMatchObject({ phase: 'finished', falls: 0 });
          game.dispose();
        }
    },
    20000,
  );
  it.each(courses)(
    '$name の全CPから静止状態で再出発できる',
    (course) => {
      for (const cp of course.checkpoints) {
        const game = new Physics(course, () => {});
        game.round.start(0);
        game.teleport({ ...cp, y: cp.y + 0.6 });
        const index = course.route.findIndex((p) => p.x === cp.x && p.z === cp.z);
        const route = course.route.slice(index);
        const result = drive(game, route.length === 1 ? [cp, cp] : route);
        expect(result, `${course.name} CP ${index}: ${JSON.stringify(result)}`).toMatchObject({
          phase: 'finished',
          falls: 0,
        });
        game.dispose();
      }
    },
    20000,
  );
});
