import { beforeAll, expect, it } from 'vitest';
import { courses, type Course } from '../../src/courses';
import { initPhysics, Physics } from '../../src/physics';
import { tuning } from '../../src/config';

beforeAll(initPhysics);
function boosted() {
  const course: Course = {
    ...courses[0],
    start: { x: 0, y: 0.52, z: 0 },
    goal: { x: 0, y: 0, z: -400 },
    platforms: [{ id: 'floor', x: 0, y: 0, z: -100, w: 200, d: 500, safe: true }],
    pads: [{ id: 'boost', x: 0, y: 0, z: 0, dx: 0, dz: -1, type: 'dash', w: 4, d: 3, power: 22 }],
    tarts: [],
    checkpoints: [],
  };
  const game = new Physics(course, () => {});
  game.round.start(0);
  game.step({ x: 0, z: 0 }, 0);
  return game;
}
it('boost follows steering instead of continuing to push in the panel direction', () => {
  const game = boosted();
  try {
    expect(game.dashActive).toBe(true);
    for (let i = 1; i <= 120; i++) game.step({ x: 1, z: 0 }, i * tuning.step);
    const velocity = game.ball.linvel();
    expect(velocity.x).toBeGreaterThan(Math.abs(velocity.z));
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(24.1);
  } finally {
    game.dispose();
  }
});
it('boost pauses with simulation and clears on recovery', () => {
  const game = boosted();
  try {
    game.round.phase = 'paused';
    game.step({ x: 0, z: 0 }, 20);
    expect(game.dashActive).toBe(true);
    game.teleport({ x: 0, y: 0.52, z: -10 });
    expect(game.dashActive).toBe(false);
  } finally {
    game.dispose();
  }
});
