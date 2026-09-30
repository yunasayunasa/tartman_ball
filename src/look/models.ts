import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { random } from './textures';

// 頂点色つきの小さなローポリ模型。1種類を1つの形状にまとめ、InstancedMeshで大量に置く。
type Part = { geometry: T.BufferGeometry; color: T.ColorRepresentation; matrix?: T.Matrix4 };
export const at = (
  x: number,
  y: number,
  z: number,
  scale: number | [number, number, number] = 1,
  rotation: [number, number, number] = [0, 0, 0],
) =>
  new T.Matrix4().compose(
    new T.Vector3(x, y, z),
    new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
    typeof scale === 'number' ? new T.Vector3(scale, scale, scale) : new T.Vector3(...scale),
  );
/** 部品を頂点色つきで1つの形状にまとめる。position / normal / color だけを持つ。 */
export function build(parts: Part[]) {
  const pieces = parts.map(({ geometry, color, matrix }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    if (matrix) g.applyMatrix4(matrix);
    g.deleteAttribute('uv');
    if (g.hasAttribute('uv1')) g.deleteAttribute('uv1');
    const c = new T.Color(color),
      count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    // 面ごとの法線で、ローポリらしい陰影にする。
    g.computeVertexNormals();
    return g;
  });
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  return merged;
}
/** 頂点を少しずつずらして岩らしい凹凸を付ける（位置に応じた決定的な揺らぎ）。 */
export function jitter(geometry: T.BufferGeometry, amount: number, seed: number) {
  const position = geometry.getAttribute('position'),
    rnd = random(seed),
    offsets = new Map<string, [number, number, number]>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(3)},${position.getY(i).toFixed(3)},${position.getZ(i).toFixed(3)}`;
    if (!offsets.has(key))
      offsets.set(key, [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount]);
    const [dx, dy, dz] = offsets.get(key)!;
    position.setXYZ(i, position.getX(i) + dx, position.getY(i) + dy, position.getZ(i) + dz);
  }
  return geometry;
}

/** 浮島: 上面（草など）と、下へ尖る岩。高さ1・半径1が基準。 */
export function floatingIsland(top: string, rock: string, deep: string, seed: number) {
  return build([
    { geometry: jitter(new T.CylinderGeometry(1, 0.92, 0.28, 9, 1), 0.08, seed), color: top },
    {
      geometry: jitter(new T.ConeGeometry(0.92, 1.4, 9, 2), 0.16, seed + 1),
      color: rock,
      matrix: at(0, -0.84, 0, 1, [Math.PI, 0, 0]),
    },
    {
      geometry: jitter(new T.ConeGeometry(0.45, 0.9, 6, 1), 0.1, seed + 2),
      color: deep,
      matrix: at(0.1, -1.6, 0.05, 1, [Math.PI, 0, 0]),
    },
  ]);
}
export function palm() {
  const parts: Part[] = [];
  for (let i = 0; i < 6; i++)
    parts.push({
      geometry: new T.CylinderGeometry(0.16 - i * 0.012, 0.19 - i * 0.012, 0.95, 6),
      color: i % 2 ? '#a6784e' : '#94683f',
      matrix: at(Math.sin(i * 0.28) * 0.5, 0.45 + i * 0.9, 0, 1, [0, 0, -0.08 * i]),
    });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push({
      geometry: new T.ConeGeometry(0.42, 2.8, 4, 1),
      color: i % 2 ? '#3f9d4e' : '#4fb85a',
      matrix: at(
        1.2 + Math.cos(a) * 1.1,
        5.2,
        Math.sin(a) * 1.1,
        [1, 1, 0.25],
        [Math.sin(a) * 1.25, -a, Math.PI / 2 - 0.55 + Math.cos(a) * 0.2],
      ),
    });
  }
  for (const [x, z] of [
    [1.1, 0.2],
    [1.3, -0.2],
    [0.95, -0.15],
  ])
    parts.push({
      geometry: new T.IcosahedronGeometry(0.2, 0),
      color: '#6b4a2a',
      matrix: at(x, 5, z),
    });
  return build(parts);
}
export function bush(colors: string[], seed: number) {
  const rnd = random(seed);
  return build(
    Array.from({ length: 5 }, (_, i) => ({
      geometry: new T.IcosahedronGeometry(0.5 + rnd() * 0.35, 0),
      color: colors[i % colors.length],
      matrix: at(rnd() * 1.4 - 0.7, 0.35 + rnd() * 0.4, rnd() * 1.4 - 0.7),
    })),
  );
}
export function rock(color: string, seed: number) {
  return build([{ geometry: jitter(new T.DodecahedronGeometry(1, 0), 0.35, seed), color }]);
}
export function cactus() {
  const green = '#5aa652',
    light = '#6fbd62';
  return build([
    { geometry: new T.CylinderGeometry(0.4, 0.45, 4, 8), color: green, matrix: at(0, 2, 0) },
    {
      geometry: new T.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      color: light,
      matrix: at(0, 4, 0),
    },
    {
      geometry: new T.CylinderGeometry(0.28, 0.28, 1.4, 7),
      color: green,
      matrix: at(0.75, 2.2, 0, 1, [0, 0, Math.PI / 2]),
    },
    {
      geometry: new T.CylinderGeometry(0.28, 0.28, 1.6, 7),
      color: light,
      matrix: at(1.35, 2.9, 0),
    },
    {
      geometry: new T.CylinderGeometry(0.25, 0.25, 1.1, 7),
      color: green,
      matrix: at(-0.6, 1.6, 0, 1, [0, 0, Math.PI / 2]),
    },
    {
      geometry: new T.CylinderGeometry(0.25, 0.25, 1.2, 7),
      color: light,
      matrix: at(-1.05, 2.1, 0),
    },
    { geometry: new T.IcosahedronGeometry(0.22, 0), color: '#ff7aa8', matrix: at(0, 4.35, 0) },
  ]);
}
/** 砂岩の柱。上が欠けたもの。 */
export function pillar(seed: number) {
  const rnd = random(seed),
    h = 3 + rnd() * 3;
  return build([
    { geometry: new T.BoxGeometry(2.2, 0.5, 2.2), color: '#c98a52', matrix: at(0, 0.25, 0) },
    {
      geometry: new T.CylinderGeometry(0.75, 0.85, h, 10),
      color: '#e3aa68',
      matrix: at(0, 0.5 + h / 2, 0),
    },
    {
      geometry: jitter(new T.CylinderGeometry(0.72, 0.75, 0.7, 10), 0.3, seed),
      color: '#d49a5c',
      matrix: at(0, 0.5 + h + 0.3, 0, 1, [0.12, 0, 0.1]),
    },
  ]);
}
export function pyramid() {
  return build([
    {
      geometry: new T.ConeGeometry(1, 1, 4, 1),
      color: '#e8b570',
      matrix: at(0, 0.5, 0, 1, [0, Math.PI / 4, 0]),
    },
  ]);
}
export function lollipop(color: string, stripe: string) {
  const parts: Part[] = [
    { geometry: new T.CylinderGeometry(0.1, 0.1, 5, 6), color: '#fff6ee', matrix: at(0, 2.5, 0) },
  ];
  for (let i = 0; i < 6; i++)
    parts.push({
      geometry: new T.TorusGeometry(0.35 + i * 0.28, 0.16, 5, 18),
      color: i % 2 ? color : stripe,
      matrix: at(0, 6.2, 0),
    });
  parts.push({ geometry: new T.CircleGeometry(0.35, 12), color: stripe, matrix: at(0, 6.2, 0.02) });
  return build(parts);
}
export function candyCane() {
  const parts: Part[] = [];
  for (let i = 0; i < 8; i++)
    parts.push({
      geometry: new T.CylinderGeometry(0.28, 0.28, 0.7, 8),
      color: i % 2 ? '#ffffff' : '#ff5a7a',
      matrix: at(0, 0.35 + i * 0.7, 0),
    });
  for (let i = 0; i < 6; i++) {
    const a = (i / 5) * Math.PI;
    parts.push({
      geometry: new T.SphereGeometry(0.3, 8, 6),
      color: i % 2 ? '#ffffff' : '#ff5a7a',
      matrix: at(0.8 - Math.cos(a) * 0.8, 5.6 + Math.sin(a) * 0.8, 0),
    });
  }
  return build(parts);
}
export function cupcake(frosting: string) {
  return build([
    {
      geometry: new T.CylinderGeometry(1, 0.75, 1.1, 12),
      color: '#f2a65a',
      matrix: at(0, 0.55, 0),
    },
    {
      geometry: new T.SphereGeometry(1.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      color: frosting,
      matrix: at(0, 1.05, 0, [1, 0.8, 1]),
    },
    { geometry: new T.ConeGeometry(0.55, 0.8, 10), color: frosting, matrix: at(0, 1.9, 0) },
    { geometry: new T.SphereGeometry(0.26, 8, 6), color: '#e0304a', matrix: at(0, 2.4, 0) },
  ]);
}
export function donut(icing: string) {
  return build([
    { geometry: new T.TorusGeometry(1, 0.5, 8, 16), color: '#e2a35e' },
    {
      geometry: new T.TorusGeometry(1, 0.42, 6, 16, Math.PI * 2),
      color: icing,
      matrix: at(0, 0, 0.14, [1, 1, 0.9]),
    },
  ]);
}
export function gumdrop(color: string) {
  return build([
    {
      geometry: new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      color,
      matrix: at(0, 0, 0, [1, 1.2, 1]),
    },
  ]);
}
export function crystalCluster(colors: string[], seed: number) {
  const rnd = random(seed);
  return build(
    Array.from({ length: 6 }, (_, i) => {
      const h = 1.5 + rnd() * 3.5;
      return {
        geometry: new T.OctahedronGeometry(1, 0),
        color: colors[i % colors.length],
        matrix: at(
          rnd() * 1.6 - 0.8,
          h * 0.45,
          rnd() * 1.6 - 0.8,
          [0.35 + rnd() * 0.25, h / 2, 0.35 + rnd() * 0.25],
          [rnd() * 0.5 - 0.25, rnd() * 3, rnd() * 0.5 - 0.25],
        ),
      };
    }),
  );
}
export function spire(color: string, seed: number) {
  return build([
    { geometry: jitter(new T.ConeGeometry(1, 4, 6, 3), 0.25, seed), color, matrix: at(0, 2, 0) },
  ]);
}
export function windmillTower() {
  return build([
    { geometry: new T.CylinderGeometry(0.9, 1.4, 6, 8), color: '#fff3df', matrix: at(0, 3, 0) },
    { geometry: new T.ConeGeometry(1.25, 1.6, 8), color: '#c25b4e', matrix: at(0, 6.8, 0) },
    { geometry: new T.BoxGeometry(0.7, 1.2, 0.2), color: '#8a5a3c', matrix: at(0, 0.6, 1.25) },
    { geometry: new T.BoxGeometry(0.5, 0.5, 0.2), color: '#ffd98f', matrix: at(0, 3.8, 1.02) },
  ]);
}
export function windmillBlades() {
  const parts: Part[] = [
    {
      geometry: new T.CylinderGeometry(0.22, 0.22, 0.5, 8),
      color: '#7a5a44',
      matrix: at(0, 0, 0, 1, [Math.PI / 2, 0, 0]),
    },
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    parts.push({
      geometry: new T.BoxGeometry(0.9, 3.2, 0.08),
      color: '#f7ead2',
      matrix: at(Math.sin(a) * 1.9, Math.cos(a) * 1.9, 0, 1, [0, 0, -a]),
    });
    parts.push({
      geometry: new T.BoxGeometry(0.12, 3.6, 0.12),
      color: '#9a7250',
      matrix: at(Math.sin(a) * 1.9, Math.cos(a) * 1.9, 0.05, 1, [0, 0, -a]),
    });
  }
  return build(parts);
}
export function balloon(color: string, stripe: string) {
  const parts: Part[] = [];
  for (let i = 0; i < 8; i++)
    parts.push({
      geometry: new T.SphereGeometry(1.6, 12, 10, (i / 8) * Math.PI * 2, Math.PI / 4),
      color: i % 2 ? color : stripe,
      matrix: at(0, 3.2, 0, [1, 1.15, 1]),
    });
  parts.push({
    geometry: new T.CylinderGeometry(0.45, 0.35, 0.5, 8),
    color: '#9a6a40',
    matrix: at(0, 0.25, 0),
  });
  for (const [x, z] of [
    [0.3, 0.3],
    [-0.3, 0.3],
    [0.3, -0.3],
    [-0.3, -0.3],
  ])
    parts.push({
      geometry: new T.CylinderGeometry(0.02, 0.02, 1.4, 3),
      color: '#5a4030',
      matrix: at(x, 1.1, z),
    });
  return build(parts);
}
export function tree(leaf: string, leaf2: string) {
  return build([
    { geometry: new T.CylinderGeometry(0.2, 0.3, 2, 6), color: '#8a5a3c', matrix: at(0, 1, 0) },
    { geometry: new T.IcosahedronGeometry(1.3, 0), color: leaf, matrix: at(0, 2.8, 0) },
    { geometry: new T.IcosahedronGeometry(0.9, 0), color: leaf2, matrix: at(0.5, 3.6, 0.2) },
  ]);
}
export function flowers(colors: string[], seed: number) {
  const rnd = random(seed),
    parts: Part[] = [];
  for (let i = 0; i < 12; i++) {
    const x = rnd() * 3 - 1.5,
      z = rnd() * 3 - 1.5;
    parts.push({
      geometry: new T.CylinderGeometry(0.03, 0.03, 0.5, 3),
      color: '#4f9a45',
      matrix: at(x, 0.25, z),
    });
    parts.push({
      geometry: new T.IcosahedronGeometry(0.16, 0),
      color: colors[i % colors.length],
      matrix: at(x, 0.55, z),
    });
  }
  return build(parts);
}
/** ネオンの輪。 */
export function halo() {
  return build([{ geometry: new T.TorusGeometry(3, 0.12, 6, 36), color: '#ffffff' }]);
}
export function box() {
  return build([{ geometry: new T.BoxGeometry(1, 1, 1), color: '#ffffff', matrix: at(0, 0.5, 0) }]);
}
