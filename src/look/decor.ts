import * as T from 'three';
import type { Course } from '../courses';
import type { Palette } from './palette';
import type { Bag } from './bag';
import { Clearance } from './placement';
import { random } from './textures';
import {
  at,
  balloon,
  box,
  bush,
  cactus,
  candyCane,
  crystalCluster,
  cupcake,
  donut,
  floatingIsland,
  flowers,
  gumdrop,
  halo,
  lollipop,
  palm,
  pillar,
  pyramid,
  rock,
  spire,
  tree,
  windmillBlades,
  windmillTower,
} from './models';

// コース脇の小さな浮島と、その上の飾り。道から水平に離し、道や飛ぶ先を隠さない。
type Kind = {
  make: () => T.BufferGeometry;
  scale: [number, number];
  weight: number;
  glow?: boolean;
  /** 島の中央に1つだけ置く大きなもの */
  big?: boolean;
};
type Floater = {
  make: () => T.BufferGeometry;
  scale: [number, number];
  count: number;
  glow?: boolean;
  colors?: string[];
  motion: 'spin' | 'bob';
};

function kinds(theme: number): { props: Kind[]; floaters: Floater[] } {
  switch (theme) {
    case 0:
      return {
        props: [
          { make: palm, scale: [0.9, 1.25], weight: 3 },
          { make: () => bush(['#3f9d4e', '#57b95a', '#7ccf6a'], 3), scale: [1.1, 1.8], weight: 3 },
          {
            make: () => flowers(['#ffffff', '#ffe36e', '#ff9ec4', '#9fd3ff'], 5),
            scale: [1, 1.5],
            weight: 2,
          },
          { make: () => rock('#d8d2bd', 8), scale: [0.8, 1.5], weight: 1 },
        ],
        floaters: [],
      };
    case 1:
      return {
        props: [
          { make: () => pillar(2), scale: [0.9, 1.3], weight: 3 },
          { make: cactus, scale: [0.8, 1.2], weight: 3 },
          { make: () => rock('#d49a5c', 4), scale: [1, 2], weight: 2 },
          { make: pyramid, scale: [7, 10], weight: 1, big: true },
        ],
        floaters: [],
      };
    case 2:
      return {
        props: [
          { make: () => lollipop('#ff6fa8', '#ffffff'), scale: [0.8, 1.2], weight: 3 },
          { make: candyCane, scale: [0.9, 1.2], weight: 2 },
          { make: () => cupcake('#ffd1e6'), scale: [1.2, 1.8], weight: 2 },
          { make: () => gumdrop('#8fe39a'), scale: [0.9, 1.4], weight: 2 },
        ],
        floaters: [{ make: () => donut('#ff8fc0'), scale: [2, 3.2], count: 14, motion: 'spin' }],
      };
    case 3:
      return {
        props: [{ make: box, scale: [1, 1], weight: 1, glow: true }],
        floaters: [
          {
            make: halo,
            scale: [1, 1.8],
            count: 18,
            glow: true,
            colors: ['#49e8ff', '#ff5fc8', '#b18cff'],
            motion: 'spin',
          },
        ],
      };
    case 4:
      return {
        props: [
          {
            make: () => crystalCluster(['#b89cff', '#8feaff', '#e9e2ff'], 7),
            scale: [1, 1.8],
            weight: 3,
            glow: true,
          },
          { make: () => spire('#5a4f8a', 3), scale: [1.4, 2.6], weight: 2 },
        ],
        floaters: [
          {
            make: () => crystalCluster(['#c5b0ff', '#9ff0ff'], 17),
            scale: [0.7, 1.2],
            count: 16,
            glow: true,
            motion: 'spin',
          },
        ],
      };
    default:
      return {
        props: [
          { make: windmillTower, scale: [1, 1.2], weight: 2, big: true },
          { make: () => tree('#7cc36d', '#f0a86e'), scale: [1, 1.4], weight: 3 },
          {
            make: () => flowers(['#ffc2d6', '#ffffff', '#ffe08a', '#c9a2ff'], 9),
            scale: [1, 1.6],
            weight: 2,
          },
        ],
        floaters: [
          { make: () => balloon('#ff8a7a', '#ffe2a8'), scale: [1.2, 1.6], count: 6, motion: 'bob' },
          { make: () => balloon('#7fc8ff', '#ffffff'), scale: [1.2, 1.6], count: 5, motion: 'bob' },
        ],
      };
  }
}

export function buildDecor(course: Course, palette: Palette, bag: Bag) {
  const group = new T.Group();
  const space = new Clearance(course),
    rnd = random(course.theme * 101 + course.route.length);
  const lambert = bag.add(new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const glow = bag.add(new T.MeshBasicMaterial({ vertexColors: true }));
  const { props, floaters } = kinds(course.theme);
  const route = course.route;
  // 脇の浮島
  const islands: { x: number; y: number; z: number; r: number; toward: number }[] = [];
  let side = 1;
  for (let i = 4, travelled = 0; i < route.length - 1; i++) {
    travelled += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    if (travelled < 24) continue;
    travelled = 0;
    side = rnd() < 0.7 ? -side : side;
    const p = route[i],
      q = route[i + 1],
      l = Math.hypot(q.x - p.x, q.z - p.z) || 1,
      nx = -(q.z - p.z) / l,
      nz = (q.x - p.x) / l;
    const r = 3.5 + rnd() * 4,
      lateral = 16 + r + rnd() * 14;
    const x = p.x + nx * side * lateral + (rnd() - 0.5) * 8,
      z = p.z + nz * side * lateral + (rnd() - 0.5) * 8;
    if (!space.clear(x, z, 12 + r)) continue;
    islands.push({ x, y: p.y - 1.5 - rnd() * 5, z, r, toward: Math.atan2(p.x - x, p.z - z) });
  }
  const [top, soil, , deep] = palette.strata;
  const islandMesh = new T.InstancedMesh(
    bag.add(floatingIsland(top, soil, deep, course.theme * 7 + 1)),
    lambert,
    Math.max(1, islands.length),
  );
  islandMesh.count = islands.length;
  islands.forEach((s, i) =>
    islandMesh.setMatrixAt(i, at(s.x, s.y, s.z, [s.r, s.r * 0.8, s.r], [0, rnd() * 6, 0])),
  );
  group.add(islandMesh);

  // 島の上の飾り
  const placements = props.map(() => [] as T.Matrix4[]);
  const blades: { x: number; y: number; z: number; s: number; yaw: number; phase: number }[] = [];
  const total = props.reduce((a, k) => a + k.weight, 0);
  const pick = () => {
    let r = rnd() * total;
    return props.findIndex((k) => (r -= k.weight) < 0);
  };
  for (const s of islands) {
    const surface = s.y + 0.112 * s.r;
    const bigIndex = props.findIndex((k) => k.big);
    if (bigIndex >= 0 && rnd() < 0.3) {
      const k = props[bigIndex],
        scale = k.scale[0] + rnd() * (k.scale[1] - k.scale[0]);
      placements[bigIndex].push(
        at(s.x, surface, s.z, course.theme === 1 ? scale * (s.r / 6) : scale, [0, s.toward, 0]),
      );
      if (course.theme === 5)
        blades.push({ x: s.x, y: surface, z: s.z, s: scale, yaw: s.toward, phase: rnd() * 6 });
      continue;
    }
    const count = 1 + Math.floor(rnd() * 3);
    for (let n = 0; n < count; n++) {
      let index = pick();
      if (props[index].big) index = props.findIndex((k) => !k.big);
      const k = props[index],
        a = rnd() * Math.PI * 2,
        d = rnd() * s.r * 0.5,
        scale = k.scale[0] + rnd() * (k.scale[1] - k.scale[0]);
      if (course.theme === 3)
        // ネオンの柱: 細く高い光の塔
        placements[index].push(
          at(s.x + Math.cos(a) * d, surface, s.z + Math.sin(a) * d, [0.5, 4 + rnd() * 8, 0.5]),
        );
      else
        placements[index].push(
          at(s.x + Math.cos(a) * d, surface, s.z + Math.sin(a) * d, scale, [0, rnd() * 6, 0]),
        );
    }
  }
  props.forEach((k, i) => {
    if (!placements[i].length) return;
    const mesh = new T.InstancedMesh(
      bag.add(k.make()),
      k.glow ? glow : lambert,
      placements[i].length,
    );
    placements[i].forEach((m, j) => {
      mesh.setMatrixAt(j, m);
      if (course.theme === 3) mesh.setColorAt(j, new T.Color(j % 2 ? '#49e8ff' : '#ff5fc8'));
    });
    group.add(mesh);
  });

  // 動くもの: 風車の羽根、空に浮かぶ飾り
  const animated: {
    mesh: T.InstancedMesh;
    items: {
      p: T.Vector3;
      s: number;
      phase: number;
      yaw: number;
      motion: 'spin' | 'bob' | 'blade';
    }[];
  }[] = [];
  if (blades.length) {
    const mesh = new T.InstancedMesh(bag.add(windmillBlades()), lambert, blades.length);
    animated.push({
      mesh,
      items: blades.map((b) => ({
        p: new T.Vector3(b.x, b.y, b.z).add(
          new T.Vector3(0, 5.2, 1.4)
            .multiplyScalar(b.s)
            .applyAxisAngle(new T.Vector3(0, 1, 0), b.yaw),
        ),
        s: b.s,
        phase: b.phase,
        yaw: b.yaw,
        motion: 'blade' as const,
      })),
    });
    group.add(mesh);
  }
  for (const f of floaters) {
    const items: (typeof animated)[number]['items'] = [];
    for (let tries = 0; tries < 400 && items.length < f.count; tries++) {
      const p = route[Math.floor(rnd() * route.length)];
      const a = rnd() * Math.PI * 2,
        d = 24 + rnd() * 30;
      const x = p.x + Math.cos(a) * d,
        z = p.z + Math.sin(a) * d;
      if (!space.clear(x, z, 22)) continue;
      items.push({
        p: new T.Vector3(x, p.y + 3 + rnd() * 12, z),
        s: f.scale[0] + rnd() * (f.scale[1] - f.scale[0]),
        phase: rnd() * 6,
        yaw: rnd() * 6,
        motion: f.motion,
      });
    }
    if (!items.length) continue;
    const mesh = new T.InstancedMesh(bag.add(f.make()), f.glow ? glow : lambert, items.length);
    if (f.colors)
      items.forEach((_, i) => mesh.setColorAt(i, new T.Color(f.colors![i % f.colors!.length])));
    animated.push({ mesh, items });
    group.add(mesh);
  }
  const q = new T.Quaternion(),
    e = new T.Euler(),
    v = new T.Vector3(),
    m = new T.Matrix4();
  const update = (time: number) => {
    for (const { mesh, items } of animated) {
      items.forEach((it, i) => {
        v.copy(it.p);
        if (it.motion === 'blade') e.set(0, it.yaw, -time * 0.9 - it.phase, 'YXZ');
        else if (it.motion === 'bob') {
          v.y += Math.sin(time * 0.5 + it.phase) * 0.9;
          e.set(0, it.yaw + time * 0.05, 0);
        } else e.set(time * 0.3 + it.phase, time * 0.5 + it.yaw, 0);
        mesh.setMatrixAt(i, m.compose(v, q.setFromEuler(e), new T.Vector3(it.s, it.s, it.s)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { group, update };
}
