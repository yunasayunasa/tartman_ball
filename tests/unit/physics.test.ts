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
function drive(game: Physics, route: Point[], maxTime = 180) {
  let index = 1,
    time = 0;
  while (time < maxTime && game.round.phase !== 'finished') {
    const target = route[Math.min(index, route.length - 1)],
      pos = game.position,
      v = game.ball.linvel();
    const dx = target.x - pos.x,
      dz = target.z - pos.z,
      distance = Math.hypot(dx, dz);
    const next = route[index + 1],
      previous = route[index - 1];
    const straight =
      next &&
      previous &&
      Math.abs(
        (target.x - previous.x) * (next.z - target.z) -
          (target.z - previous.z) * (next.x - target.x),
      ) < 0.01;
    if (distance < (straight ? 3 : 0.85) && index < route.length - 1) {
      index++;
      continue;
    }
    const dashJump = game.course.pads.some(
      (p) =>
        p.type === 'dash' &&
        game.course.pads.some(
          (j) => j.type === 'jump' && j.x === p.x && Math.abs(j.z - p.z) < 12,
        ) &&
        Math.abs(pos.x - p.x) < 2 &&
        pos.z < p.z + 1 &&
        pos.z > p.z - 30,
    );
    const speed = dashJump ? 15 : straight ? 7.5 : Math.min(6.5, Math.sqrt(distance * 9));
    const desiredX = distance > 0.01 ? (dx / distance) * speed : 0;
    const desiredZ = distance > 0.01 ? (dz / distance) * speed : 0;
    game.step(normalize((desiredX - v.x) * 0.65, (desiredZ - v.z) * 0.65), time);
    time += tuning.step;
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
    expect(game.ball.linvel().x).toBe(0);
    expect(game.ball.angvel().x).toBe(0);
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
    game.teleport({ x: 0, y: 0.52, z: -12 });
    advance(game, 0.08);
    expect(events.filter((e) => e === 'dash')).toHaveLength(1);
    advance(game, 0.3, 0, 0, 0.08);
    game.teleport({ x: 0, y: 0.52, z: -12 });
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
    expect(result.time).toBeGreaterThanOrEqual(30);
    expect(result.time).toBeLessThanOrEqual(120);
    expect(events.filter((e) => e === 'goal')).toHaveLength(1);
    if (course.pads.some((p) => p.type === 'jump')) expect(events).toContain('jump');
    if (course.pads.some((p) => p.type === 'dash')) expect(events).toContain('dash');
    game.dispose();
  });
  it.each(courses)('$name の全CPから静止状態で再出発できる', (course) => {
    for (const cp of course.checkpoints) {
      const game = new Physics(course, () => {});
      game.round.start(0);
      game.teleport({ ...cp, y: 0.6 });
      const index = course.route.findIndex((p) => p.x === cp.x && p.z === cp.z);
      const route = course.route.slice(index);
      const result = drive(game, route.length === 1 ? [cp, cp] : route);
      expect(result, `${course.name} CP ${index}: ${JSON.stringify(result)}`).toMatchObject({
        phase: 'finished',
        falls: 0,
      });
      game.dispose();
    }
  });
});
