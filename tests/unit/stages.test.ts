import { beforeAll, expect, it } from 'vitest';
import {
  courses,
  platformPose,
  platformsNear,
  restRemaining,
  surfaceHeight,
} from '../../src/courses';
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
    bridge = course.platforms.find((p) => p.motion)!,
    m = bridge.motion!;
  const q = { x: bridge.x, z: bridge.z + bridge.d / 2 - 3 };
  expect(surfaceHeight(q, bridge, 0)).toBeDefined();
  // 静止区間の後、振れ幅が最大付近になる時刻。
  const swing = m.period * (m.dwell! + (1 - m.dwell!) * 0.3);
  expect(surfaceHeight(q, bridge, swing)).toBeUndefined();
  expect(course.platforms.some((p) => p !== bridge && surfaceHeight(q, p) !== undefined)).toBe(
    false,
  );
});

it('rotating bridges rest connected for a readable window, then swing smoothly', () => {
  for (const course of [courses[2], courses[5]])
    for (const bridge of course.platforms.filter((p) => p.motion?.kind === 'rotate')) {
      const m = bridge.motion!;
      expect(m.dwell! * m.period, course.name + bridge.id).toBeGreaterThanOrEqual(3);
      expect(bridge.recoverySafe).toBe(false);
      let docked = 0,
        previous = platformPose(bridge, 0).angle;
      for (let t = 0; t < m.period; t += 0.01) {
        const angle = platformPose(bridge, t).angle;
        if (Math.abs(angle - (bridge.angle ?? 0)) < 1e-9) docked += 0.01;
        // 急に跳ねる動きをしない（最大角速度の上限）。
        expect(Math.abs(angle - previous)).toBeLessThan(0.02);
        previous = angle;
      }
      expect(docked).toBeCloseTo(m.dwell! * m.period, 0);
      expect(restRemaining(bridge, 0.001)).toBeGreaterThan(0);
    }
});

it('the platform grid finds exactly the same supports as scanning every platform', () => {
  for (const course of courses)
    for (let i = 0; i < course.route.length; i += 3)
      for (const [dx, dz, t] of [
        [0, 0, 0],
        [3.7, -1.2, 2.5],
        [-6.1, 4.4, 5.3],
        [9.5, 9.5, 7.9],
      ]) {
        const q = { x: course.route[i].x + dx, z: course.route[i].z + dz };
        const hits = (list: typeof course.platforms) =>
          list.filter((p) => surfaceHeight(q, p, t) !== undefined).map((p) => p.id);
        expect(hits(platformsNear(course, q)), course.name).toEqual(hits(course.platforms));
      }
});

it('every course starts on an island with ground behind and beside the ball', () => {
  for (const course of courses)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2,
        q = { x: course.start.x + Math.cos(a) * 3, z: course.start.z + Math.sin(a) * 3 };
      expect(
        course.platforms.some((p) => {
          const y = surfaceHeight(q, p);
          return y !== undefined && Math.abs(y - (course.start.y - 0.6)) < 0.1;
        }),
        `${course.name} ${k}`,
      ).toBe(true);
    }
});

it('roads arriving at an island reach its height, so the rim never becomes a wall', () => {
  for (const course of courses)
    for (const deck of course.platforms.filter((p) => p.shape && !p.motion)) {
      const r = (Math.min(deck.w, deck.d) / 2) * (deck.shape === 'hex' ? 0.86 : 1) + 0.05;
      course.route.forEach((p, i) => {
        if (Math.hypot(p.x - deck.x, p.z - deck.z) > 1 || Math.abs(p.y - deck.y) > 0.5) return;
        // 島へ入ってくる側の、縁のすぐ外の路面。下り（島から降りる側）は段差でも問題ない。
        const before = course.route
          .slice(0, i)
          .reverse()
          .find((q) => Math.hypot(q.x - deck.x, q.z - deck.z) > r + 0.5);
        if (!before) return;
        const d = Math.hypot(before.x - deck.x, before.z - deck.z),
          q = {
            x: deck.x + ((before.x - deck.x) / d) * r,
            z: deck.z + ((before.z - deck.z) / d) * r,
          };
        const heights = course.platforms
          .filter((road) => road.vertices)
          .map((road) => surfaceHeight(q, road))
          .filter((y): y is number => y !== undefined);
        if (heights.length)
          expect(Math.max(...heights), `${course.name} ${deck.id}`).toBeGreaterThan(deck.y - 0.1);
      });
    }
});
