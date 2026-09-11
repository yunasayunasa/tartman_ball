import { CatmullRomCurve3, Vector3 } from 'three';
import { buildStages } from './stages';
export type Vec = { x: number; y: number; z: number };
export type Point = { x: number; z: number; y?: number };
export type Surface =
  'grass' | 'wood' | 'sand' | 'cookie' | 'candy' | 'metal' | 'glass' | 'stone' | 'ice' | 'copper';
export type Motion = {
  kind: 'lift' | 'slide' | 'rotate';
  amplitude: number;
  period: number;
  stops?: boolean;
  phase?: number;
};
export type Platform = {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  safe: boolean;
  recoverySafe?: boolean;
  angle?: number;
  vertices?: Vec[];
  surface?: Surface;
  motion?: Motion;
  shape?: 'disc' | 'hex';
  effect?: { kind: 'conveyor' | 'wind'; x: number; z: number; strength: number };
};
export type Pad = {
  id: string;
  type: 'dash' | 'jump';
  x: number;
  y?: number;
  z: number;
  dx: number;
  dz: number;
  w: number;
  d: number;
  power?: number;
  duration?: number;
  launchSpeed?: number;
  jumpSpeed?: number;
};
export type Course = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  difficulty: string;
  theme: number;
  platforms: Platform[];
  pads: Pad[];
  tarts: (Vec & { id: string })[];
  checkpoints: Vec[];
  start: Vec;
  goal: Vec;
  route: Vec[];
  branches: Vec[][];
  sections?: (Vec & { title: string; hint: string })[];
};
const v = (x: number, z: number, y = 0): Vec => ({ x, y, z });
export const surfaceColors: Record<Surface, string> = {
  grass: '#72d77c',
  wood: '#c08a57',
  sand: '#d8a85f',
  cookie: '#edb869',
  candy: '#f69ac5',
  metal: '#36547b',
  glass: '#46d8ed',
  stone: '#9783c9',
  ice: '#b3f3ff',
  copper: '#d98c5f',
};
export function platformPose(p: Platform, time: number): { position: Vec; angle: number } {
  const m = p.motion,
    wave = m
      ? (m.stops
          ? Math.max(
              -1,
              Math.min(1, -Math.cos((time * Math.PI * 2) / m.period + (m.phase ?? 0)) * 1.8),
            )
          : Math.sin((time * Math.PI * 2) / m.period + (m.phase ?? 0))) * m.amplitude
      : 0;
  return {
    position: {
      x: p.x + (m?.kind === 'slide' ? wave : 0),
      y: p.y + (m?.kind === 'lift' ? wave : 0),
      z: p.z,
    },
    angle: (p.angle ?? 0) + (m?.kind === 'rotate' ? wave : 0),
  };
}
function triangleHeight(q: Point, a: Vec, b: Vec, c: Vec): number | undefined {
  const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(det) < 1e-8) return;
  const u = ((b.z - c.z) * (q.x - c.x) + (c.x - b.x) * (q.z - c.z)) / det;
  const w = ((c.z - a.z) * (q.x - c.x) + (a.x - c.x) * (q.z - c.z)) / det;
  if (u < -1e-5 || w < -1e-5 || u + w > 1.00001) return;
  return u * a.y + w * b.y + (1 - u - w) * c.y;
}
export function surfaceHeight(q: Point, p: Platform, time = 0): number | undefined {
  if (p.vertices) {
    const [a, b, c, d] = p.vertices;
    return triangleHeight(q, a, b, c) ?? triangleHeight(q, a, c, d);
  }
  const pose = platformPose(p, time),
    dx = q.x - pose.position.x,
    dz = q.z - pose.position.z;
  const x = dx * Math.cos(pose.angle) - dz * Math.sin(pose.angle),
    z = dx * Math.sin(pose.angle) + dz * Math.cos(pose.angle);
  if (p.shape && Math.hypot(x / (p.w / 2), z / (p.d / 2)) > (p.shape === 'hex' ? 0.86 : 1)) return;
  return Math.abs(x) <= p.w / 2 && Math.abs(z) <= p.d / 2 ? pose.position.y : undefined;
}
export function onPlatform(q: Point, p: Platform, margin = 0): boolean {
  if (surfaceHeight(q, p) === undefined) return false;
  if (margin <= 0) return true;
  return [
    [margin, 0],
    [-margin, 0],
    [0, margin],
    [0, -margin],
  ].every(([x, z]) => surfaceHeight({ x: q.x + x, z: q.z + z }, p) !== undefined);
}
export function safeAt(q: Vec, course: Course): boolean {
  const supports = (point: Point) =>
    course.platforms.some(
      (p) => p.safe && !p.motion && Math.abs((surfaceHeight(point, p) ?? -999) - q.y + 0.52) < 0.2,
    );
  return (
    supports(q) &&
    [
      [0.95, 0],
      [-0.95, 0],
      [0, 0.95],
      [0, -0.95],
    ].every(([x, z]) => supports({ x: q.x + x, z: q.z + z })) &&
    !course.pads.some(
      (p) => Math.hypot(q.x - p.x, q.z - p.z) < 3 && Math.abs(q.y - (p.y ?? 0) - 0.52) < 1,
    )
  );
}
// Connected strip vertices are shared at every sample: no overlapping box seams on curves or slopes.
function ribbon(
  points: Vec[],
  width: number,
  surface: Surface,
  prefix: string,
  bank = false,
): Platform[] {
  const edges = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1,
      nx = ((-(b.z - a.z) / length) * width) / 2,
      nz = (((b.x - a.x) / length) * width) / 2;
    const angleA = Math.atan2(p.x - a.x, p.z - a.z),
      angleB = Math.atan2(b.x - p.x, b.z - p.z);
    const turn = Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA));
    const tilt = bank
      ? Math.max(-0.65, Math.min(0.65, turn * 8)) * Math.min(1, i / 5, (points.length - 1 - i) / 5)
      : 0;
    return [
      { x: p.x + nx, y: p.y + tilt, z: p.z + nz },
      { x: p.x - nx, y: p.y - tilt, z: p.z - nz },
    ];
  });
  return points.slice(1).map((p, i) => ({
    id: prefix + '-' + i,
    x: (p.x + points[i].x) / 2,
    y: (p.y + points[i].y) / 2,
    z: (p.z + points[i].z) / 2,
    w: width,
    d: 3,
    safe: true,
    surface,
    vertices: [edges[i][0], edges[i + 1][0], edges[i + 1][1], edges[i][1]],
  }));
}
function sample(controls: Vec[]): Vec[] {
  const curve = new CatmullRomCurve3(
    controls.map((p) => new Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
  );
  return curve
    .getSpacedPoints(Math.ceil(curve.getLength() / 3))
    .map((p) => ({ x: p.x, y: p.y, z: p.z }));
}
const descriptions = [
  [
    'エメラルド海岸',
    'EMERALD COAST',
    '海沿いの曲線、木橋、追い風。青い海を飛び越えよう。',
    '#72d77c',
    '海の冒険 · 2〜3分',
  ],
  [
    '琥珀砂漠の滑走遺跡',
    'AMBER SPIRAL',
    '砂岩の螺旋を滑り、すり鉢と谷の勢いで遺跡を飛び越えよう。',
    '#d99a4e',
    '地形滑走 · 3〜4分',
  ],
  [
    'お菓子の天空工房',
    'CANDY WORKSHOP',
    'ウエハース橋から回転皿へ。巨大タルトを囲む甘い冒険。',
    '#f49dc6',
    '精密操作 · 2.5〜3.5分',
  ],
  [
    'ネオン急行',
    'NEON EXPRESS',
    '連続ダッシュで夜景を駆け抜ける。細い近道にも挑戦。',
    '#49dfe7',
    '高速走行 · 2〜3分',
  ],
  [
    '水晶の渓谷',
    'CRYSTAL CANYON',
    '光る洞窟、滑る氷、昇降する水晶。渓谷の向こうへ。',
    '#b4a0ed',
    '滑走と高低差 · 3〜4分',
  ],
  [
    '夕焼けの風車群島',
    'SUNSET ARCHIPELAGO',
    '島々を巡り、橋を渡り、夕日へ続くジャンプの旅。',
    '#f7a168',
    '立体ルート · 3〜4分',
  ],
];
const controls: Vec[][] = [
  [
    v(0, 0),
    v(0, -35),
    v(22, -80),
    v(-22, -135),
    v(-48, -195, 4),
    v(-12, -250, 0),
    v(42, -285, -4),
    v(78, -340, -4),
    v(35, -395, 2),
    v(-25, -450, 6),
    v(-60, -520, 6),
    v(-10, -580, 0),
    v(48, -640),
    v(48, -720),
    v(0, -790),
    v(0, -850),
  ],
  [
    v(0, 0, 20),
    v(0, -55, 20),
    v(55, -125, 18),
    v(70, -185, 16),
    v(30, -240, 14),
    v(-35, -240, 12),
    v(-70, -185, 10),
    v(-45, -125, 8),
    v(10, -105, 6),
    v(65, -145, 4),
    v(60, -210, 2),
    v(5, -250, 0),
    v(-60, -225, -2),
    v(-75, -155, -4),
    v(-25, -105, -6),
    v(55, -275, -4),
    v(105, -350, 8),
    v(30, -430, -8),
    v(-55, -500, 10),
    v(10, -585, 0),
    v(10, -700, 0),
  ],
  [
    v(0, 0),
    v(0, -40),
    v(35, -90, 3),
    v(65, -140, 5),
    v(15, -190, 5),
    v(-45, -230, 8),
    v(-55, -300, 10),
    v(5, -350, 12),
    v(65, -325, 14),
    v(85, -260, 16),
    v(35, -220, 18),
    v(-15, -260, 20),
    v(0, -320, 22),
    v(60, -380, 22),
    v(100, -450, 16),
    v(55, -510, 10),
    v(-5, -560, 5),
    v(-40, -640),
    v(0, -700),
  ],
  [
    v(0, 0),
    v(0, -100),
    v(0, -200),
    v(40, -280, 5),
    v(115, -300, 10),
    v(175, -250, 12),
    v(170, -170, 12),
    v(115, -120, 10),
    v(65, -170, 7),
    v(90, -250, 6),
    v(170, -350, 2),
    v(170, -460),
    v(120, -550),
    v(40, -590),
    v(-15, -660),
    v(-15, -790),
    v(-15, -920),
  ],
  [
    v(0, 0),
    v(0, -40),
    v(-30, -105, 4),
    v(-60, -175, 8),
    v(0, -225, 12),
    v(65, -290, 12),
    v(30, -355, 16),
    v(-40, -420, 20),
    v(-85, -490, 20),
    v(-30, -560, 12),
    v(45, -620, 4),
    v(85, -690, -2),
    v(30, -760, -2),
    v(-40, -830, 2),
    v(-40, -930),
    v(5, -1000),
  ],
  [
    v(0, 0),
    v(0, -45),
    v(45, -100, 6),
    v(90, -170, 12),
    v(30, -230, 15),
    v(-45, -280, 10),
    v(-75, -350, 6),
    v(-20, -420, 4),
    v(60, -460, 10),
    v(110, -530, 18),
    v(55, -600, 22),
    v(-15, -655, 18),
    v(-70, -725, 10),
    v(-10, -790, 6),
    v(45, -860, 2),
    v(45, -960),
    v(0, -1040),
  ],
];
function make(theme: number): Course {
  const route = sample(controls[theme]),
    [name, subtitle, description, color, difficulty] = descriptions[theme];
  // Level the approaches to fixed islands so their vertical sides never interrupt a slope.
  const flatCenters = [
    ...Array.from({ length: 5 }, (_, i) => Math.floor(((i + 1) * (route.length - 1)) / 6)),
    Math.floor((2 * (route.length - 1)) / 6) + 20,
  ];
  const jumps = theme === 1 ? [0.7, 0.75, 0.91] : theme === 4 ? [0.88, 0.92, 0.96] : [0.91];
  for (const fraction of jumps) flatCenters.push(Math.floor(route.length * fraction) + 5);
  if (theme === 2 || theme === 4)
    flatCenters.push(Math.floor(route.length * 0.6), Math.floor(route.length * 0.68));
  for (const center of flatCenters) {
    const height = route[center].y;
    for (let offset = -5; offset <= 5; offset++) {
      const p = route[center + offset];
      if (!p) continue;
      const blend = Math.max(0, Math.min(1, (5 - Math.abs(offset)) / 2));
      p.y = p.y * (1 - blend) + height * blend;
    }
  }
  const materials: Surface[][] = [
    ['grass', 'wood', 'grass'],
    ['sand', 'stone', 'sand'],
    ['cookie', 'candy', 'cookie'],
    ['metal', 'glass', 'metal'],
    ['stone', 'ice', 'stone'],
    ['copper', 'wood', 'grass'],
  ];
  const chapterSurfaces: Surface[][] = [
    ['grass', 'grass', 'wood', 'grass', 'wood', 'grass'],
    ['sand', 'sand', 'stone', 'sand', 'stone', 'sand'],
    ['cookie', 'cookie', 'candy', 'cookie', 'candy', 'cookie'],
    ['metal', 'metal', 'glass', 'metal', 'glass', 'metal'],
    ['stone', 'stone', 'stone', 'ice', 'stone', 'stone'],
    ['wood', 'copper', 'wood', 'wood', 'copper', 'grass'],
  ];
  const chapterWidths = [
    [7.5, 6, 5.5, 7, 8, 8],
    [9, 9, 10, 8, 9, 10],
    [7, 2.8, 6, 5, 4, 7],
    [8, 9, 8, 7, 8, 9],
    [6, 5, 2.8, 7, 4.5, 7],
    [7, 6, 6, 2.8, 7, 9],
  ];
  const course: Course = {
    id: 'course-' + (theme === 1 ? 6 : theme === 0 ? 1 : theme),
    theme,
    name,
    subtitle,
    description,
    color,
    difficulty,
    route,
    platforms: [],
    pads: [],
    tarts: [],
    checkpoints: [],
    start: { ...route[0], y: route[0].y + 0.6 },
    goal: route.at(-1)!,
    branches: [],
  };
  // Six chapters, with generous fixed checkpoint islands between challenges.
  for (let i = 0; i < 6; i++) {
    const from = Math.floor((i * (route.length - 1)) / 6),
      to = Math.floor(((i + 1) * (route.length - 1)) / 6);
    const width = chapterWidths[theme][i];
    course.platforms.push(
      ...ribbon(
        route.slice(from, to + 1),
        width,
        chapterSurfaces[theme][i],
        'chapter-' + i,
        (theme === 1 && i < 4) || (theme === 3 && i === 1),
      ),
    );
    if (i > 0) course.checkpoints.push({ ...route[from] });
  }
  [route[0], ...course.checkpoints, course.goal].forEach((p, i) =>
    course.platforms.push({
      ...p,
      id: 'island-' + i,
      w: 9,
      d: 9,
      safe: true,
      surface: materials[theme][0],
      shape: theme === 2 ? 'disc' : 'hex',
    }),
  );
  // A connected moving-footbridge detour leaves a checkpoint and rejoins before the next one.
  const anchor = course.checkpoints[1];
  const motion: Motion = {
    kind: theme === 1 || theme === 2 || theme === 5 ? 'rotate' : theme === 3 ? 'slide' : 'lift',
    amplitude: theme === 1 || theme === 2 || theme === 5 ? 0.7 : theme === 3 ? 3 : 1.8,
    period: 6,
  };
  const anchorIndex = route.findIndex((p) => p.x === anchor.x && p.z === anchor.z),
    reunion = route[anchorIndex + 20];
  const direction = route[anchorIndex + 1],
    directionLength = Math.hypot(direction.x - anchor.x, direction.z - anchor.z);
  const tx = (direction.x - anchor.x) / directionLength,
    tz = (direction.z - anchor.z) / directionLength,
    nx = -tz,
    nz = tx;
  const offset = (forward: number, side: number): Vec => ({
    x: anchor.x + tx * forward + nx * side,
    y: anchor.y,
    z: anchor.z + tz * forward + nz * side,
  });
  const challengeStart = offset(8, 18),
    challengeEnd = offset(26, 18),
    bridge = offset(17, 18);
  const approach = sample([anchor, offset(0, 10), challengeStart]),
    departure = sample([
      challengeEnd,
      {
        x: (challengeEnd.x + reunion.x) / 2,
        y: (challengeEnd.y + reunion.y) / 2,
        z: (challengeEnd.z + reunion.z) / 2,
      },
      reunion,
    ]);
  for (const p of departure.slice(-5)) p.y = reunion.y;
  course.platforms.push(
    ...ribbon(approach, 4.5, materials[theme][1], 'moving-entry'),
    ...ribbon(departure, 4.5, materials[theme][1], 'moving-exit'),
  );
  course.platforms.push(
    {
      ...challengeStart,
      id: 'challenge-entry',
      w: 8,
      d: 8,
      safe: true,
      surface: materials[theme][1],
      shape: 'disc',
    },
    {
      ...challengeEnd,
      id: 'challenge-exit',
      w: 8,
      d: 8,
      safe: true,
      surface: materials[theme][1],
      shape: 'disc',
    },
    {
      ...bridge,
      id: 'moving-bridge',
      w: 5.5,
      d: 14,
      safe: false,
      surface: materials[theme][1],
      angle: Math.atan2(tx, tz),
      motion,
    },
  );
  course.branches.push([...approach, offset(12, 18), bridge, offset(22, 18), ...departure]);
  // Branch reconnects ahead. No collectibles are exclusive to either branch.
  if (theme === 1 || theme === 3 || theme === 5) {
    const a = Math.floor(route.length * 0.6),
      b = Math.floor(route.length * 0.68);
    const entry = route[a],
      exit = route[b],
      dx = exit.x - entry.x,
      dz = exit.z - entry.z,
      len = Math.hypot(dx, dz),
      nx = -dz / len,
      nz = dx / len;
    const branch = sample([
      entry,
      { x: entry.x + dx * 0.12 + nx * 16, y: entry.y, z: entry.z + dz * 0.12 + nz * 16 },
      {
        x: entry.x + dx * 0.5 + nx * 26,
        y: (entry.y + exit.y) / 2 + 4,
        z: entry.z + dz * 0.5 + nz * 26,
      },
      { x: entry.x + dx * 0.88 + nx * 16, y: exit.y, z: entry.z + dz * 0.88 + nz * 16 },
      exit,
    ]);
    course.branches.push(branch);
    course.platforms.push(...ribbon(branch, 3, materials[theme][1], 'shortcut'));
  }
  const boostIndices =
    theme === 3
      ? [
          12,
          16,
          20,
          24,
          28,
          Math.floor(route.length * 0.82),
          Math.floor(route.length * 0.82) + 4,
          Math.floor(route.length * 0.82) + 8,
        ]
      : [
          Math.floor(route.length * 0.8),
          Math.floor(route.length * 0.8) + 4,
          Math.floor(route.length * 0.8) + 8,
          ...(theme === 5 ? [Math.floor(route.length * 0.8) + 12] : []),
        ];
  for (const index of boostIndices) {
    const p = route[index],
      next = route[index + 1],
      length = Math.hypot(next.x - p.x, next.z - p.z);
    course.pads.push({
      ...p,
      id: 'dash-' + index,
      type: 'dash',
      dx: (next.x - p.x) / length,
      dz: (next.z - p.z) / length,
      w: 4.5,
      d: 2.5,
      power: theme === 0 ? 15 : undefined,
    });
  }
  // A jump over a genuine gap, with a broad landing. Route is kept for guidance and physical route tests.
  const gap: Vec[] = [];
  for (const fraction of jumps) {
    const jumpIndex = Math.floor(route.length * fraction) + 1,
      launch = route[jumpIndex];
    const next = route[jumpIndex + 1],
      length = Math.hypot(next.x - launch.x, next.z - launch.z);
    course.pads.push({
      ...launch,
      id: 'jump-' + jumpIndex,
      type: 'jump',
      dx: (next.x - launch.x) / length,
      dz: (next.z - launch.z) / length,
      w: 5,
      d: 2.5,
    });
    const landing = route[jumpIndex + 4];
    course.platforms.push({
      ...landing,
      id: 'landing-' + jumpIndex,
      w: 9,
      d: 9,
      safe: true,
      surface: chapterSurfaces[theme][5],
      shape: theme === 2 ? 'disc' : 'hex',
    });
    gap.push(...route.slice(jumpIndex + 1, jumpIndex + 2));
  }
  course.platforms = course.platforms.filter(
    (p) => !p.vertices || !gap.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2),
  );
  route.forEach((p, i) => {
    if (
      i % 4 === 2 &&
      !gap.includes(p) &&
      !course.pads.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 4)
    )
      course.tarts.push({ ...p, id: 'tart-' + i });
  });
  return course;
}
export const courses = [make(0), ...buildStages()];
