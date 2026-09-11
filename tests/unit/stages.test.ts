import { beforeAll, expect, it } from 'vitest';
import { courses, platformPose, surfaceHeight } from '../../src/courses';
import { initPhysics, Physics } from '../../src/physics';
import { tuning } from '../../src/config';
beforeAll(initPhysics);

it.each(courses)('$name starts and restarts on supported ground', (course) => {
  const game = new Physics(course, () => {});
  game.round.start(0);
  try {
    for (const p of [course.start, ...course.checkpoints.map((p) => ({ ...p, y: p.y + 0.6 }))]) {
      game.teleport(p);
      for (let i = 0; i < 30; i++) game.step({ x: 0, z: 0 }, i * tuning.step);
      expect(game.round.phase).toBe('playing');
      expect(game.grounded).toBe(true);
    }
  } finally {
    game.dispose();
  }
});

it('each stage has real main-route mechanics, not ineffective mesh flags', () => {
  expect(courses.map((c) => c.id)).toEqual([
    'course-1',
    'course-6',
    'course-2',
    'course-3',
    'course-4',
    'course-5',
  ]);
  for (const c of courses)
    for (const p of c.platforms)
      expect(!!p.motion && !!p.vertices, c.name + ' ' + p.id).toBe(false);
  expect(courses[1].platforms.filter((p) => p.id.startsWith('trough')).length).toBeGreaterThan(300);
  expect(courses[2].pads.filter((p) => p.launchSpeed).length).toBeGreaterThan(12);
  expect(courses[3].pads.filter((p) => p.type === 'dash').length).toBeGreaterThan(8);
  expect(courses[4].platforms.filter((p) => p.motion?.kind === 'lift')).toHaveLength(3);
  expect(courses[5].platforms.filter((p) => p.motion?.kind === 'rotate')).toHaveLength(9);
});

it('candy stepping stones have real gaps and launches land on the next stone', () => {
  const course = courses[2],
    pads = course.pads.filter((p) => p.launchSpeed);
  for (const index of [0, 5, 11]) {
    const pad = pads[index];
    const game = new Physics(course, () => {});
    game.round.start(0);
    game.teleport({ ...pad, y: (pad.y ?? 0) + 0.52 });
    let airborne = false,
      landed = false;
    try {
      for (let i = 0; i < 160; i++) {
        game.step({ x: 0, z: 0 }, i * tuning.step);
        if (game.position.y > (pad.y ?? 0) + 1.5) airborne = true;
        if (airborne && game.grounded) {
          landed = true;
          break;
        }
      }
      expect(landed, `pad ${index}: ${JSON.stringify(game.position)}`).toBe(true);
      expect(Math.hypot(game.position.x - pad.x, game.position.z - pad.z)).toBeGreaterThan(8);
      expect(game.round.history.length).toBeGreaterThan(0);
      const gap = { x: pad.x + pad.dx * 7, z: pad.z + pad.dz * 7 };
      expect(course.platforms.some((p) => surfaceHeight(gap, p) !== undefined)).toBe(false);
    } finally {
      game.dispose();
    }
  }
});

it('crystal lifts physically carry a standing ball from the lower dock to the upper dock', () => {
  const course = courses[4],
    lift = course.platforms.find((p) => p.motion?.kind === 'lift')!;
  const game = new Physics(course, () => {});
  game.round.start(0);
  const initial = platformPose(lift, 0).position;
  game.teleport({ ...initial, y: initial.y + 0.52 });
  try {
    for (let i = 0; i < 540; i++) game.step({ x: 0, z: 0 }, i * tuning.step);
    const top = platformPose(lift, game.simulationTime).position;
    expect(top.y - initial.y).toBeCloseTo(8);
    expect(game.position.y).toBeCloseTo(top.y + 0.52, 1);
    expect(game.round.history.some((h) => h.platformId === lift.id)).toBe(true);
    game.teleport({ x: 1000, y: top.y - 12, z: lift.z });
    game.step({ x: 0, z: 0 }, 5);
    expect(game.round.phase).toBe('falling');
    game.step({ x: 0, z: 0 }, 6);
    const recoveryHeight = platformPose(lift, game.simulationTime).position.y;
    expect(game.position.x).toBeCloseTo(lift.x);
    expect(game.position.y).toBeCloseTo(recoveryHeight + 0.6, 1);
  } finally {
    game.dispose();
  }
});

it('rotating bridges change their physical footprint and have no fixed bypass below', () => {
  const course = courses[5],
    bridge = course.platforms.find((p) => p.motion)!;
  const q = { x: bridge.x, z: bridge.z + bridge.d / 2 - 3 };
  expect(surfaceHeight(q, bridge, 0)).toBeDefined();
  expect(surfaceHeight(q, bridge, bridge.motion!.period / 4)).toBeUndefined();
  expect(course.platforms.some((p) => p !== bridge && surfaceHeight(q, p) !== undefined)).toBe(
    false,
  );
});
