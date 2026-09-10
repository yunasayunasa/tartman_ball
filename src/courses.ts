export type Vec = { x: number; y: number; z: number };
export type Point = { x: number; z: number };
export type Platform = Point & {
  id: string;
  w: number;
  d: number;
  y: number;
  safe: boolean;
  angle?: number;
};
export type Pad = Point & {
  id: string;
  type: 'dash' | 'jump';
  dx: number;
  dz: number;
  w: number;
  d: number;
};
export type Course = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  color: string;
  difficulty: string;
  platforms: Platform[];
  pads: Pad[];
  tarts: (Point & { id: string })[];
  checkpoints: Point[];
  start: Vec;
  goal: Point;
  route: Point[];
};
// 手作業で設計した点列。道の継ぎ目は重ね、落下用の隙間だけを明示する。
function road(points: Point[], widths: number[], gaps: number[] = []): Platform[] {
  const result: Platform[] = [];
  points.forEach((p, i) => {
    if (i === 0 || gaps.includes(i)) return;
    const a = points[i - 1],
      w = widths[Math.min(i - 1, widths.length - 1)];
    result.push({
      id: `road-${i}`,
      x: (p.x + a.x) / 2,
      z: (p.z + a.z) / 2,
      w,
      d: Math.hypot(p.x - a.x, p.z - a.z) + w,
      angle: Math.atan2(p.x - a.x, p.z - a.z),
      y: 0,
      safe: true,
    });
  });
  return result;
}
const p = (x: number, z: number): Point => ({ x, z });
function roundedCorners(route: Point[], radius: number): Point[] {
  const result = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    const a = route[i - 1],
      b = route[i],
      c = route[i + 1];
    const before = Math.hypot(b.x - a.x, b.z - a.z),
      after = Math.hypot(c.x - b.x, c.z - b.z);
    const distance = Math.min(radius, before * 0.4, after * 0.4);
    const entry = p(
      b.x + ((a.x - b.x) * distance) / before,
      b.z + ((a.z - b.z) * distance) / before,
    );
    const exit = p(b.x + ((c.x - b.x) * distance) / after, b.z + ((c.z - b.z) * distance) / after);
    result.push(entry);
    for (let segment = 1; segment <= 5; segment++) {
      const t = segment / 5,
        s = 1 - t;
      result.push(
        p(
          s * s * entry.x + 2 * s * t * b.x + t * t * exit.x,
          s * s * entry.z + 2 * s * t * b.z + t * t * exit.z,
        ),
      );
    }
  }
  result.push(route.at(-1)!);
  return result;
}
function make(
  id: number,
  name: string,
  subtitle: string,
  description: string,
  color: string,
  difficulty: string,
  route: Point[],
  widths: number[],
  cp: number[],
  pads: Pad[] = [],
  gaps: number[] = [],
): Course {
  const platforms = id === 1 ? road(roundedCorners(route, 6), [7]) : road(route, widths, gaps);
  const checkpoints = cp.map((i) => route[i]);
  [route[0], ...checkpoints, route.at(-1)!].forEach((a, i) =>
    platforms.push({ ...a, id: `island-${i}`, w: 7, d: 7, y: 0, safe: true }),
  );
  const tarts: Course['tarts'] = [];
  route.forEach((b, i) => {
    if (!i || gaps.includes(i)) return;
    const a = route[i - 1],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    for (let distance = 5; distance < length - 2; distance += 7) {
      const f = distance / length;
      tarts.push({
        id: `${id}-t${tarts.length}`,
        x: a.x + (b.x - a.x) * f,
        z: a.z + (b.z - a.z) * f,
      });
    }
  });
  return {
    id: `course-${id}`,
    name,
    subtitle,
    description,
    color,
    difficulty,
    platforms,
    pads,
    tarts,
    checkpoints,
    start: { ...route[0], y: 0.6 },
    goal: route.at(-1)!,
    route,
  };
}
const pad = (id: string, type: Pad['type'], x: number, z: number, dx = 0, dz = -1): Pad => ({
  id,
  type,
  x,
  z,
  dx,
  dz,
  w: 3.4,
  d: 2.1,
});
export const courses: Course[] = [
  make(
    1,
    'そよ風の散歩道',
    'BREEZE GARDEN',
    '広い道で、ころころ。まずは空の散歩から。',
    '#79cbae',
    'はじめの一歩',
    [p(0, 0), p(0, -25), p(12, -25), p(12, -53), p(-3, -53), p(-3, -83), p(8, -83), p(8, -139)],
    [7, 7, 6, 7, 6, 7, 7],
    [3, 5],
  ),
  make(
    2,
    '雲の仕立て屋',
    'CLOUD NEEDLE',
    '細い道と曲がり角。ゆっくりが、いちばん速い。',
    '#a9a4dc',
    '精密操作',
    [p(0, 0), p(0, -25), p(15, -25), p(15, -54), p(-7, -54), p(-7, -81), p(8, -81), p(8, -128)],
    [3.4, 3, 2.8, 3.2, 2.6, 3, 3.4],
    [2, 4, 6],
  ),
  make(
    3,
    '追い風エクスプレス',
    'TAILWIND EXPRESS',
    '金色の矢印でひとっ飛び。角の手前で減速を。',
    '#f3c770',
    'ダッシュ',
    [p(0, 0), p(0, -39), p(16, -39), p(16, -82), p(-3, -82), p(-3, -132), p(10, -132), p(10, -162)],
    [6, 5, 5, 5, 5, 5, 6],
    [2, 4, 6],
    [pad('d1', 'dash', 0, -12), pad('d2', 'dash', 16, -53), pad('d3', 'dash', -3, -96)],
  ),
  make(
    4,
    '空色の跳び石',
    'SKY SKIPPERS',
    '桃色の台からジャンプ。タルトの先へ着地しよう。',
    '#f1a6a8',
    'ジャンプ',
    [
      p(0, 0),
      p(0, -24),
      p(0, -34),
      p(0, -58),
      p(12, -58),
      p(12, -84),
      p(12, -94),
      p(12, -123),
      p(0, -123),
      p(0, -166),
    ],
    [6, 6, 7, 6, 6, 6, 7, 6, 6],
    [3, 7],
    [pad('j1', 'jump', 0, -25.5), pad('j2', 'jump', 12, -85.5)],
    [2, 6],
  ),
  make(
    5,
    'タルトの空中庭園',
    'THE TART SKYWAY',
    '追い風から大ジャンプ。空の旅の集大成。',
    '#7fc8de',
    'コンビネーション',
    [
      p(0, 0),
      p(0, -29),
      p(0, -46),
      p(0, -68),
      p(15, -68),
      p(15, -95),
      p(-4, -95),
      p(-4, -126),
      p(-4, -143),
      p(-4, -190),
    ],
    [6, 6, 8, 4, 3.2, 4, 6, 6, 8],
    [3, 6, 9],
    [
      pad('d1', 'dash', 0, -21),
      pad('j1', 'jump', 0, -30.5),
      pad('d2', 'dash', -4, -118),
      pad('j2', 'jump', -4, -127.5),
    ],
    [2, 8],
  ),
];
export function onPlatform(point: Point, platform: Platform, margin = 0): boolean {
  const dx = point.x - platform.x,
    dz = point.z - platform.z;
  const cos = Math.cos(platform.angle ?? 0),
    sin = Math.sin(platform.angle ?? 0);
  return (
    Math.abs(dx * cos - dz * sin) <= platform.w / 2 - margin &&
    Math.abs(dx * sin + dz * cos) <= platform.d / 2 - margin
  );
}
export function safeAt(point: Vec, course: Course): boolean {
  return (
    course.platforms.some(
      (s) => s.safe && onPlatform(point, s, 0.95) && Math.abs(point.y - 0.52 - s.y) < 0.15,
    ) && !course.pads.some((s) => onPlatform(point, { ...s, y: 0, safe: false }, -1.2))
  );
}
