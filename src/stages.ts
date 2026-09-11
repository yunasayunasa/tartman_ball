import { CatmullRomCurve3, Vector3 } from 'three';
import type { Course, Vec, Surface, Platform, Motion } from './courses';

const point = (x: number, z: number, y = 0): Vec => ({ x, y, z });
const direction = (a: Vec, b: Vec) => {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
};
function sample(points: Vec[]) {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(p.x, p.y, p.z)),
    false,
    'centripetal',
  );
  return curve
    .getSpacedPoints(Math.max(2, Math.ceil(curve.getLength() / 2.5)))
    .map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

// Share geometry tools, not a stage sequence. Each builder below authors its own main route.
class Stage {
  course: Course;
  private serial = 0;
  constructor(
    id: string,
    theme: number,
    name: string,
    subtitle: string,
    description: string,
    color: string,
    difficulty: string,
    start: Vec,
  ) {
    this.course = {
      id,
      theme,
      name,
      subtitle,
      description,
      color,
      difficulty,
      start: { ...start, y: start.y + 0.6 },
      goal: start,
      route: [],
      platforms: [],
      pads: [],
      tarts: [],
      checkpoints: [],
      branches: [],
      sections: [],
    };
  }
  id(prefix: string) {
    return `${prefix}-${this.serial++}`;
  }
  route(points: Vec[]) {
    for (const p of points) {
      const last = this.course.route.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.01)
        this.course.route.push({ ...p });
    }
  }
  road(
    controls: Vec[],
    width: number,
    surface: Surface,
    options: { trough?: number; rail?: boolean; conveyor?: boolean } = {},
  ) {
    const points = sample(controls);
    const cross = options.trough ? [-1, -0.5, 0, 0.5, 1] : [-1, 1];
    const edges = points.map((p, i) => {
      const d = direction(points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]);
      const blend = Math.min(1, i / 5, (points.length - 1 - i) / 5);
      return cross.map((t) => ({
        x: p.x - ((d.z * width) / 2) * t,
        y: p.y + (options.trough ?? 0) * t * t * blend,
        z: p.z + ((d.x * width) / 2) * t,
      }));
    });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1],
        d = direction(a, b);
      for (let j = 0; j < cross.length - 1; j++) {
        const vertices = [edges[i][j], edges[i + 1][j], edges[i + 1][j + 1], edges[i][j + 1]];
        this.course.platforms.push({
          id: this.id(options.trough ? 'trough' : 'road'),
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          z: (a.z + b.z) / 2,
          w: width,
          d: 2.5,
          safe: true,
          surface,
          vertices,
          ...(options.conveyor
            ? { effect: { kind: 'conveyor' as const, x: d.x, z: d.z, strength: 5 } }
            : {}),
        });
      }
      if (options.rail)
        for (const side of [-1, 1]) {
          this.course.platforms.push({
            id: this.id('rail'),
            x: (a.x + b.x) / 2 - ((d.z * width) / 2) * side,
            y: (a.y + b.y) / 2 + 0.65,
            z: (a.z + b.z) / 2 + ((d.x * width) / 2) * side,
            w: 0.3,
            d: Math.hypot(b.x - a.x, b.z - a.z) + 0.18,
            safe: false,
            surface: 'metal',
            angle: Math.atan2(d.x, d.z),
          });
        }
      if (i % 5 === 2) this.tart(a);
    }
    this.route(points);
    return points;
  }
  deck(
    p: Vec,
    width: number,
    depth: number,
    surface: Surface,
    shape?: 'disc' | 'hex',
    motion?: Motion,
    angle = 0,
  ) {
    const platform: Platform = {
      ...p,
      id: this.id(motion ? 'mechanism' : 'deck'),
      w: width,
      d: depth,
      surface,
      safe: !motion,
      recoverySafe: true,
      shape,
      motion,
      angle,
    };
    this.course.platforms.push(platform);
    return platform;
  }
  tart(p: Vec) {
    this.course.tarts.push({ ...p, id: this.id('tart') });
  }
  checkpoint(p: Vec, surface: Surface) {
    this.deck(p, 12, 12, surface, 'disc');
    this.course.checkpoints.push({ ...p });
  }
  section(p: Vec, title: string, hint: string) {
    this.course.sections!.push({ ...p, title, hint });
  }
  boost(p: Vec, next: Vec, duration = 2.2) {
    const d = direction(p, next);
    this.course.pads.push({
      ...p,
      id: this.id('dash'),
      type: 'dash',
      dx: d.x,
      dz: d.z,
      w: 5,
      d: 3.5,
      power: 22,
      duration,
    });
  }
  bounce(p: Vec, next: Vec) {
    const d = direction(p, next),
      distance = Math.hypot(next.x - p.x, next.z - p.z);
    this.course.pads.push({
      ...p,
      id: this.id('bounce'),
      type: 'jump',
      dx: d.x,
      dz: d.z,
      w: 5.5,
      d: 4.5,
      launchSpeed: distance * 1.07,
      jumpSpeed: 10,
    });
  }
  finish(p: Vec, surface: Surface) {
    this.deck(p, 14, 14, surface, 'disc');
    this.course.goal = { ...p };
    this.course.tarts = this.course.tarts.filter(
      (t) => !this.course.pads.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 3),
    );
    return this.course;
  }
}

function desert() {
  const s = new Stage(
    'course-6',
    1,
    '琥珀砂漠の滑走遺跡',
    'AMBER SPIRAL',
    'すり鉢の壁でラインを選び、螺旋から谷へ。高低差を勢いに変えよう。',
    '#d99a4e',
    'ライン選びと地形滑走',
    point(0, 0, 24),
  );
  s.road([point(0, 0, 24), point(0, -35, 24)], 14, 'sand');
  s.section(point(0, -12, 24), 'SPIRAL DROP', '壁を使って曲がろう');
  const spiral = Array.from({ length: 45 }, (_, i) => {
    const angle = (i / 44) * Math.PI * 2.5;
    return point(Math.sin(angle) * 65, -100 + Math.cos(angle) * 65, 24 - (i / 44) * 24);
  });
  s.road(spiral, 18, 'sand', { trough: 3.2 });
  const exit = spiral.at(-1)!;
  s.road([exit, point(72, -125, 0), point(90, -145, 0)], 14, 'sand');
  s.checkpoint(point(90, -145, 0), 'sand');
  s.section(point(90, -145, 0), 'DUNE SURF', '谷で加速、上りで飛び出す');
  s.road(
    [
      point(90, -145, 0),
      point(100, -185, -7),
      point(65, -235, -11),
      point(20, -275, 1),
      point(-20, -315, 5),
    ],
    18,
    'sand',
    { trough: 3 },
  );
  s.road([point(-20, -315, 5), point(-30, -340, 5)], 12, 'stone');
  s.checkpoint(point(-30, -340, 5), 'stone');
  s.section(point(-30, -340, 5), 'RUIN LEAP', '発射台から遺跡へ');
  const jump = point(-30, -365, 5),
    landing = point(-30, -379, 5);
  s.road([point(-30, -340, 5), jump], 12, 'stone');
  s.deck(jump, 10, 10, 'sand', 'disc');
  s.bounce(jump, landing);
  s.deck(landing, 12, 12, 'stone', 'disc');
  s.route([jump, landing]);
  s.road([landing, point(-40, -430, 0), point(0, -480, -5), point(40, -525, 0)], 16, 'sand', {
    trough: 2.6,
  });
  return s.finish(point(40, -525, 0), 'stone');
}

function candy() {
  const s = new Stage(
    'course-2',
    2,
    'お菓子の天空工房',
    'CANDY HOPSCOTCH',
    '跳ねるクッキーを次々と渡り、回転するウエハース橋へ。着地点を選ぼう。',
    '#f49dc6',
    '連続ジャンプと着地',
    point(0, 0),
  );
  let anchor = point(0, 0);
  for (let act = 0; act < 3; act++) {
    const entry = point(anchor.x, anchor.z - 25, anchor.y);
    s.road([anchor, entry], 7, 'cookie');
    s.section(entry, 'COOKIE HOP ' + (act + 1), '桃色パッドで次のクッキーへ');
    const stones = [
      entry,
      ...Array.from({ length: act + 5 }, (_, i) =>
        point(anchor.x + (i % 2 === 0 ? 4 : -4), entry.z - (i + 1) * 13, anchor.y),
      ),
    ];
    for (let i = 0; i < stones.length; i++) {
      s.deck(stones[i], 10, 10, i % 2 ? 'candy' : 'cookie', 'disc');
      if (i < stones.length - 1) s.bounce(stones[i], stones[i + 1]);
      s.tart({ ...stones[i], x: stones[i].x + 3.3 });
    }
    s.route(stones);
    anchor = stones.at(-1)!;
    const cp = point(anchor.x, anchor.z - 18, anchor.y);
    s.road([anchor, cp], 6, 'cookie');
    s.checkpoint(cp, 'cookie');
    if (act < 2) {
      const bridge = point(cp.x, cp.z - 19, cp.y),
        dock = point(cp.x, cp.z - 38, cp.y);
      s.road([cp, point(cp.x, cp.z - 8, cp.y)], 6, 'cookie');
      s.deck(bridge, 5, 26, 'candy', undefined, { kind: 'rotate', amplitude: 0.65, period: 7 });
      s.deck(dock, 12, 12, 'cookie', 'disc');
      s.route([point(cp.x, cp.z - 8, cp.y), bridge, dock]);
      s.section(cp, 'WAFER TURN', '橋がつながるのを待とう');
      anchor = dock;
    } else anchor = cp;
  }
  const goal = point(anchor.x, anchor.z - 28, anchor.y);
  s.road([anchor, goal], 9, 'candy');
  return s.finish(goal, 'cookie');
}

function neon() {
  const s = new Stage(
    'course-3',
    3,
    'ネオン急行',
    'NEON EXPRESS',
    '光のレーンを連続ブースト。広いバンクを曲がり、夜景を一気に駆け抜けよう。',
    '#49dfe7',
    '高速旋回とダッシュ連鎖',
    point(0, 0),
  );
  s.section(point(0, -8), 'BOOST RUN', 'ダッシュ中も左右へ曲がれる');
  s.road([point(0, 0), point(0, -115)], 14, 'metal', { rail: true, conveyor: true });
  for (const z of [-18, -52, -87]) s.boost(point(0, z), point(0, z - 10));
  s.checkpoint(point(0, -115), 'metal');
  const bend = s.road(
    [
      point(0, -115),
      point(8, -155),
      point(42, -195),
      point(94, -205),
      point(145, -185),
      point(178, -140),
      point(180, -90),
    ],
    16,
    'glass',
    { rail: true },
  );
  s.section(point(0, -115), 'LIGHT BANK', '先を見ながら大きく曲がろう');
  for (const i of [8, 27, 48, 65]) if (bend[i + 1]) s.boost(bend[i], bend[i + 1], 2.6);
  s.road(
    [
      point(180, -90),
      point(180, -40),
      point(210, 0),
      point(260, 10),
      point(305, -20),
      point(320, -75),
    ],
    16,
    'metal',
    { rail: true, conveyor: true },
  );
  s.checkpoint(point(320, -75), 'metal');
  s.section(point(320, -75), 'FINAL EXPRESS', '光のゲートを駆け抜けよう');
  s.road([point(320, -75), point(320, -255)], 14, 'glass', { rail: true });
  for (const z of [-96, -131, -166, -201]) s.boost(point(320, z), point(320, z - 10));
  return s.finish(point(320, -255), 'metal');
}

function crystal() {
  const s = new Stage(
    'course-4',
    4,
    '水晶の渓谷',
    'CRYSTAL ASCENT',
    '昇降水晶に乗って上段へ。凍った坂を滑り、光の橋がつながる瞬間を待とう。',
    '#b4a0ed',
    '昇降床と氷の滑走',
    point(0, 0),
  );
  let anchor = point(0, 0);
  for (let i = 0; i < 3; i++) {
    const dock = point(anchor.x, anchor.z - 34, anchor.y);
    s.road([anchor, dock], 8, 'stone');
    s.deck(dock, 12, 12, 'stone', 'disc');
    s.section(dock, 'CRYSTAL LIFT ' + (i + 1), '床に乗って、上段の高さで進もう');
    const lift = point(dock.x, dock.z - 11, dock.y + 4),
      upper = point(dock.x, dock.z - 22, dock.y + 8);
    s.deck(lift, 10, 12, 'glass', undefined, {
      kind: 'lift',
      amplitude: 4,
      period: 9,
      stops: true,
    });
    s.deck(upper, 12, 12, 'stone', 'disc');
    s.route([dock, { ...lift, y: dock.y }, lift, { ...lift, y: upper.y }, upper]);
    s.checkpoint(upper, 'stone');
    const out = point(upper.x + (i % 2 ? -38 : 38), upper.z - 55, upper.y);
    s.road([upper, point(upper.x, upper.z - 18, upper.y), out], 8, 'ice', { rail: true });
    anchor = out;
  }
  s.section(anchor, 'ICE DESCENT', '氷のカーブでは早めに曲がろう');
  const goal = point(anchor.x, anchor.z - 160, 4);
  s.road(
    [
      anchor,
      point(anchor.x + 42, anchor.z - 45, 20),
      point(anchor.x - 20, anchor.z - 100, 9),
      goal,
    ],
    12,
    'ice',
    { rail: true },
  );
  return s.finish(goal, 'stone');
}

function windmill() {
  const s = new Stage(
    'course-5',
    5,
    '夕焼けの風車群島',
    'WINDMILL CROSSING',
    '大きな回転橋と横風の島。風を受け止め、橋がつながるタイミングで渡ろう。',
    '#f7a168',
    '風向きと回転橋',
    point(0, 0),
  );
  let anchor = point(0, 0);
  for (let act = 0; act < 3; act++) {
    const entry = point(anchor.x, anchor.z - 30, anchor.y);
    s.road([anchor, entry], 9, 'wood');
    s.section(entry, 'TURNING BRIDGES', '橋の向きがそろったら渡ろう');
    let dock = entry;
    s.deck(dock, 12, 12, 'grass', 'disc');
    for (let j = 0; j < 3; j++) {
      const next = point(dock.x + (j === 1 ? 10 : 0), dock.z - 26, dock.y);
      const mid = point((dock.x + next.x) / 2, (dock.z + next.z) / 2, dock.y),
        d = direction(dock, next);
      s.deck(
        mid,
        5,
        Math.hypot(next.x - dock.x, next.z - dock.z) - 9,
        'copper',
        undefined,
        { kind: 'rotate', amplitude: 1.05, period: 7 + j, phase: j * 0.5 },
        Math.atan2(d.x, d.z),
      );
      s.deck(next, 12, 12, 'grass', 'disc');
      s.route([dock, mid, next]);
      s.tart(next);
      dock = next;
    }
    s.checkpoint(dock, 'grass');
    s.section(dock, 'CROSSWIND', '流れる風を見て、風上へ傾けよう');
    const end = point(dock.x + (act % 2 ? -30 : 30), dock.z - 68, dock.y);
    const before = s.course.platforms.length;
    const path = s.road([dock, point(dock.x, dock.z - 24, dock.y), end], 10, 'wood');
    const d = direction(path[0], path.at(-1)!);
    for (const p of s.course.platforms.slice(before))
      p.effect = {
        kind: 'wind',
        x: -d.z * (act % 2 ? -1 : 1),
        z: d.x * (act % 2 ? -1 : 1),
        strength: 4,
      };
    s.checkpoint(end, 'grass');
    anchor = end;
  }
  const goal = point(anchor.x, anchor.z - 35, anchor.y);
  s.road([anchor, goal], 10, 'copper');
  return s.finish(goal, 'grass');
}

export function buildStages(): Course[] {
  return [desert(), candy(), neon(), crystal(), windmill()];
}
