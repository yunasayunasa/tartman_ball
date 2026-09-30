import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Course, Platform, Surface, Vec } from '../courses';
import type { Palette } from './palette';
import type { Bag } from './bag';
import { curbTexture, glowSeams, random, strataTexture, surfaceTexture } from './textures';
import { jitter } from './models';

// 道と島の見た目。当たり判定（物理）とは別に、厚み・縁石・地層・岩を付ける。
const CURB = 0.55; // 縁石の幅（m）
const SHADE = 1.4; // 縁の内側を少し暗くする幅（m）
const DEPTH = 2.2; // 道の厚み（m）

class Buffer {
  position: number[] = [];
  normal: number[] = [];
  uv: number[] = [];
  color: number[] = [];
  vertex(p: Vec, n: Vec, u: number, v: number, c = 1) {
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x / l, n.y / l, n.z / l);
    this.uv.push(u, v);
    this.color.push(c, c, c);
  }
  /** a-b-c-d の四角形（2三角形）。 */
  quad(
    a: Vec,
    b: Vec,
    c: Vec,
    d: Vec,
    n: Vec | Vec[],
    uv: number[][],
    shade: number[] = [1, 1, 1, 1],
  ) {
    const ns = Array.isArray(n) ? n : [n, n, n, n],
      corners = [a, b, c, d];
    this.face(corners, ns, uv, shade, 0, 1, 2);
    this.face(corners, ns, uv, shade, 0, 2, 3);
  }
  tri(a: Vec, b: Vec, c: Vec, n: Vec, uv: number[][], shade: number[] = [1, 1, 1]) {
    this.face([a, b, c], [n, n, n], uv, shade, 0, 1, 2);
  }
  // 巻き順を法線の向きにそろえる。両面描画では裏向きの面の陰影が反転するため。
  private face(
    p: Vec[],
    n: Vec[],
    uv: number[][],
    shade: number[],
    i: number,
    j: number,
    k: number,
  ) {
    const e1 = { x: p[j].x - p[i].x, y: p[j].y - p[i].y, z: p[j].z - p[i].z },
      e2 = { x: p[k].x - p[i].x, y: p[k].y - p[i].y, z: p[k].z - p[i].z };
    const cross = {
      x: e1.y * e2.z - e1.z * e2.y,
      y: e1.z * e2.x - e1.x * e2.z,
      z: e1.x * e2.y - e1.y * e2.x,
    };
    const facing = cross.x * n[i].x + cross.y * n[i].y + cross.z * n[i].z >= 0;
    for (const o of facing ? [i, j, k] : [i, k, j])
      this.vertex(p[o], n[o], uv[o][0], uv[o][1], shade[o]);
  }
  geometry() {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new T.Float32BufferAttribute(this.color, 3));
    return g;
  }
  get empty() {
    return this.position.length === 0;
  }
}
// 頂点色を使う材質に、頂点色のない形状を渡すと黒くなる。白で埋めておく。
function paint(g: T.BufferGeometry) {
  const count = g.getAttribute('position').count;
  g.setAttribute('color', new T.Float32BufferAttribute(new Array(count * 3).fill(1), 3));
  return g;
}
const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const down = (p: Vec, depth: number, inward: Vec, inset: number): Vec => ({
  x: p.x + inward.x * inset,
  y: p.y - depth,
  z: p.z + inward.z * inset,
});
function normalOf(a: Vec, b: Vec, c: Vec): Vec {
  const u = new T.Vector3(b.x - a.x, b.y - a.y, b.z - a.z),
    v = new T.Vector3(c.x - a.x, c.y - a.y, c.z - a.z),
    n = u.cross(v).normalize();
  return n.y < 0 ? { x: -n.x, y: -n.y, z: -n.z } : { x: n.x, y: n.y, z: n.z };
}
// 大きな周期のむら。タイルの繰り返しを目立たなくする。
const tint = (p: Vec) =>
  0.94 + 0.06 * Math.sin(p.x * 0.11 + Math.sin(p.z * 0.07) * 2) * Math.cos(p.z * 0.09);

export function buildTerrain(course: Course, palette: Palette, bag: Bag) {
  const glow = !!palette.curb.glow;
  const surfaceMaps = new Map<Surface, T.Texture>();
  const mapFor = (surface: Surface) => {
    if (!surfaceMaps.has(surface)) surfaceMaps.set(surface, bag.add(surfaceTexture(surface)));
    return surfaceMaps.get(surface)!;
  };
  const surfaceMaterial = (surface: Surface, layer: 'road' | 'island' | 'branch') => {
    const neon = surface === 'metal' || surface === 'glass';
    const m = bag.add(
      new T.MeshLambertMaterial({
        map: mapFor(surface),
        vertexColors: true,
        side: T.DoubleSide,
        ...(neon
          ? { emissive: '#ffffff', emissiveIntensity: 1, emissiveMap: bag.add(glowSeams(surface)) }
          : {}),
      }),
    );
    if (layer !== 'road') {
      m.polygonOffset = true;
      m.polygonOffsetFactor = layer === 'island' ? -2 : -1;
      m.polygonOffsetUnits = -1;
    }
    return m;
  };
  const curbMap = bag.add(curbTexture(palette));
  const curbMaterial = bag.add(
    new T.MeshLambertMaterial({
      map: curbMap,
      side: T.DoubleSide,
      ...(glow
        ? { emissive: palette.curb.glow, emissiveIntensity: 0.9, emissiveMap: curbMap }
        : {}),
    }),
  );
  const strata = bag.add(strataTexture(palette, course.theme * 13 + 1));
  const skirtMaterial = bag.add(new T.MeshLambertMaterial({ map: strata, side: T.DoubleSide }));
  const rockMaterial = bag.add(
    new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: T.DoubleSide }),
  );

  const tops = new Map<string, { buffer: Buffer; material: T.Material }>();
  const topBuffer = (surface: Surface, layer: 'road' | 'island' | 'branch') => {
    const key = surface + '/' + layer;
    if (!tops.has(key))
      tops.set(key, { buffer: new Buffer(), material: surfaceMaterial(surface, layer) });
    return tops.get(key)!.buffer;
  };
  const curbs = new Buffer(),
    skirts = new Buffer(),
    under = new Buffer();
  const underColor = new T.Color(palette.underside);
  const objects: T.Object3D[] = [];
  const movers: { group: T.Group; platform: Platform; trim: T.MeshStandardMaterial }[] = [];
  const rocks: T.BufferGeometry[] = [];
  const rails: T.BufferGeometry[] = [];
  const glass: T.BufferGeometry[] = [];

  for (const p of course.platforms) {
    const surface = p.surface ?? 'grass';
    if (p.vertices) {
      const [a, b, c, d] = p.vertices,
        lane = p.lane ?? { outer: [true, true], along: [0, 3], across: [0, 1], width: p.w };
      const layer = p.id.startsWith('shortcut') || p.id.startsWith('moving-') ? 'branch' : 'road';
      const quadWidth = Math.max(0.1, (lane.across[1] - lane.across[0]) * lane.width);
      // 幅方向の切れ目: 縁石・影・中央
      const cuts = new Set([0, 1]);
      const band = Math.min(0.45, CURB / quadWidth),
        shade = Math.min(0.49, (CURB + SHADE) / quadWidth);
      if (lane.outer[0]) cuts.add(band).add(shade);
      if (lane.outer[1]) cuts.add(1 - band).add(1 - shade);
      const ts = [...cuts].sort((x, y) => x - y);
      const row0 = (t: number) => lerp(a, d, t),
        row1 = (t: number) => lerp(b, c, t);
      const acrossAt = (t: number) => lane.across[0] + (lane.across[1] - lane.across[0]) * t;
      const shadeAt = (t: number) => {
        const edge = Math.min(lane.outer[0] ? t : 1, lane.outer[1] ? 1 - t : 1) * quadWidth;
        return edge <= CURB + 0.01 ? 0.84 : edge >= CURB + SHADE - 0.01 ? 1 : 0.9;
      };
      const n = normalOf(a, b, c);
      for (let k = 0; k < ts.length - 1; k++) {
        const t0 = ts[k],
          t1 = ts[k + 1];
        const corners = [row0(t0), row1(t0), row1(t1), row0(t1)];
        const isCurb =
          (lane.outer[0] && t1 <= band + 1e-6) || (lane.outer[1] && t0 >= 1 - band - 1e-6);
        if (isCurb) {
          // 縁石: 横は外縁0→内側1、縦は2mで1周期
          const uAt = (t: number) =>
            lane.outer[0] && t1 <= band + 1e-6 ? t / band : (1 - t) / band;
          curbs.quad(corners[0], corners[1], corners[2], corners[3], n, [
            [uAt(t0), lane.along[0] / 2],
            [uAt(t0), lane.along[1] / 2],
            [uAt(t1), lane.along[1] / 2],
            [uAt(t1), lane.along[0] / 2],
          ]);
          continue;
        }
        const u0 = (acrossAt(t0) * lane.width) / 4,
          u1 = (acrossAt(t1) * lane.width) / 4;
        topBuffer(surface, layer).quad(
          corners[0],
          corners[1],
          corners[2],
          corners[3],
          n,
          [
            [u0, lane.along[0] / 4],
            [u0, lane.along[1] / 4],
            [u1, lane.along[1] / 4],
            [u1, lane.along[0] / 4],
          ],
          [
            shadeAt(t0) * tint(corners[0]),
            shadeAt(t0) * tint(corners[1]),
            shadeAt(t1) * tint(corners[2]),
            shadeAt(t1) * tint(corners[3]),
          ],
        );
      }
      // 外縁から下へ伸びる地層の側面と、底面。
      const inward0 = { x: d.x - a.x, y: 0, z: d.z - a.z },
        l0 = Math.hypot(inward0.x, inward0.z) || 1;
      inward0.x /= l0;
      inward0.z /= l0;
      const inset = DEPTH * 0.3;
      const bottom = [
        down(a, DEPTH, inward0, lane.outer[0] ? inset : 0),
        down(b, DEPTH, inward0, lane.outer[0] ? inset : 0),
        down(c, DEPTH, { x: -inward0.x, y: 0, z: -inward0.z }, lane.outer[1] ? inset : 0),
        down(d, DEPTH, { x: -inward0.x, y: 0, z: -inward0.z }, lane.outer[1] ? inset : 0),
      ];
      const sideUV = (s0: number, s1: number) => [
        [s0 / 4, 1],
        [s1 / 4, 1],
        [s1 / 4, 0],
        [s0 / 4, 0],
      ];
      if (lane.outer[0]) {
        const out = { x: -inward0.x, y: -0.3, z: -inward0.z };
        skirts.quad(a, b, bottom[1], bottom[0], out, sideUV(lane.along[0], lane.along[1]));
      }
      if (lane.outer[1]) {
        const out = { x: inward0.x, y: -0.3, z: inward0.z };
        skirts.quad(d, c, bottom[2], bottom[3], out, sideUV(lane.along[0], lane.along[1]));
      }
      under.quad(bottom[0], bottom[1], bottom[2], bottom[3], { x: 0, y: -1, z: 0 }, [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
      continue;
    }
    if (p.id.startsWith('rail')) {
      // 手すり: 光る棒と、下の透ける板。当たり判定の箱と同じ位置。
      const matrix = new T.Matrix4().compose(
        new T.Vector3(p.x, p.y, p.z),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), p.angle ?? 0),
        new T.Vector3(1, 1, 1),
      );
      rails.push(new T.BoxGeometry(0.16, 0.14, p.d).translate(0, -0.05, 0).applyMatrix4(matrix));
      glass.push(new T.BoxGeometry(0.06, 0.62, p.d).translate(0, -0.42, 0).applyMatrix4(matrix));
      continue;
    }
    if (p.motion) {
      movers.push(movingPlatform(p, surfaceMaterial(surface, 'island'), skirtMaterial, bag));
      objects.push(movers.at(-1)!.group);
      continue;
    }
    if (p.shape) {
      deck(p, topBuffer(surface, 'island'), curbs, skirts, rocks, palette);
      continue;
    }
    // その他の箱（試験用の床など）
    const slab = new T.Mesh(
      bag.add(paint(new T.BoxGeometry(p.w, 1, p.d))),
      surfaceMaterial(surface, 'road'),
    );
    slab.position.set(p.x, p.y - 0.5, p.z);
    slab.rotation.y = p.angle ?? 0;
    objects.push(slab);
  }
  for (const { buffer, material } of tops.values())
    if (!buffer.empty) objects.push(new T.Mesh(bag.add(buffer.geometry()), material));
  if (!curbs.empty) objects.push(new T.Mesh(bag.add(curbs.geometry()), curbMaterial));
  if (!skirts.empty) objects.push(new T.Mesh(bag.add(skirts.geometry()), skirtMaterial));
  if (!under.empty) {
    const g = under.geometry(),
      colors = g.getAttribute('color');
    for (let i = 0; i < colors.count; i++)
      colors.setXYZ(i, underColor.r, underColor.g, underColor.b);
    objects.push(new T.Mesh(bag.add(g), rockMaterial));
  }
  if (rocks.length) {
    objects.push(new T.Mesh(bag.add(mergeGeometries(rocks)!), rockMaterial));
    rocks.forEach((g) => g.dispose());
  }
  if (rails.length) {
    const bar = new T.Mesh(
      bag.add(mergeGeometries(rails)!),
      bag.add(new T.MeshBasicMaterial({ color: palette.rail })),
    );
    const panel = new T.Mesh(
      bag.add(mergeGeometries(glass)!),
      bag.add(
        new T.MeshBasicMaterial({
          color: palette.rail,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      ),
    );
    [...rails, ...glass].forEach((g) => g.dispose());
    objects.push(bar, panel);
  }
  return { objects, movers };
}

/** 固定の島: 上面・縁石の輪・側面の地層・下へ垂れる岩。 */
function deck(
  p: Platform,
  top: Buffer,
  curbs: Buffer,
  skirts: Buffer,
  rocks: T.BufferGeometry[],
  palette: Palette,
) {
  const sides = p.shape === 'hex' ? 6 : 32,
    angle = p.angle ?? 0,
    rx = p.w / 2,
    rz = p.d / 2;
  const ring = (scale: number, y = p.y) =>
    Array.from({ length: sides + 1 }, (_, i) => {
      const a = (i / sides) * Math.PI * 2,
        x = Math.cos(a) * rx * scale,
        z = Math.sin(a) * rz * scale;
      return {
        x: p.x + x * Math.cos(angle) + z * Math.sin(angle),
        y,
        z: p.z - x * Math.sin(angle) + z * Math.cos(angle),
      };
    });
  const radius = Math.min(rx, rz),
    inner = Math.max(0.3, 1 - CURB / radius),
    outer = ring(1),
    edge = ring(inner),
    shade = ring(Math.max(0.2, inner - SHADE / radius / 2));
  const up = { x: 0, y: 1, z: 0 };
  const planar = (q: Vec) => [q.x / 4, q.z / 4];
  const center = { x: p.x, y: p.y, z: p.z };
  for (let i = 0; i < sides; i++) {
    // 中央 → 影の輪 → 縁石の内側
    top.tri(
      center,
      shade[i],
      shade[i + 1],
      up,
      [planar(center), planar(shade[i]), planar(shade[i + 1])],
      [tint(center), tint(shade[i]), tint(shade[i + 1])],
    );
    top.quad(
      shade[i],
      edge[i],
      edge[i + 1],
      shade[i + 1],
      up,
      [planar(shade[i]), planar(edge[i]), planar(edge[i + 1]), planar(shade[i + 1])],
      [1, 0.86, 0.86, 1],
    );
    const arc0 = ((i / sides) * Math.PI * 2 * radius) / 2,
      arc1 = (((i + 1) / sides) * Math.PI * 2 * radius) / 2;
    curbs.quad(outer[i], outer[i + 1], edge[i + 1], edge[i], up, [
      [0, arc0],
      [0, arc1],
      [1, arc1],
      [1, arc0],
    ]);
    const b0 = { ...outer[i], y: p.y - 1.4 },
      b1 = { ...outer[i + 1], y: p.y - 1.4 };
    const out = { x: outer[i].x - p.x, y: 0, z: outer[i].z - p.z };
    skirts.quad(outer[i], outer[i + 1], b1, b0, out, [
      [arc0 / 2, 1],
      [arc1 / 2, 1],
      [arc1 / 2, 0.36],
      [arc0 / 2, 0.36],
    ]);
  }
  // 下に垂れる岩（島の外周より少し内側に収め、隣の昇降床などに食い込まない）
  const seed = Math.round(p.x * 7 + p.z * 13);
  const rnd = random(seed);
  const cone = jitter(
    new T.ConeGeometry(radius * 0.62, radius * 0.55 + 1.4, sides === 6 ? 6 : 9, 2),
    radius * 0.12,
    seed,
  );
  cone.rotateX(Math.PI);
  cone.rotateY(rnd() * Math.PI);
  cone.translate(p.x, p.y - 1.3 - (radius * 0.55 + 1.4) / 2, p.z);
  const g = cone.toNonIndexed();
  cone.dispose();
  g.deleteAttribute('uv');
  const colors: number[] = [],
    position = g.getAttribute('position'),
    top0 = new T.Color(palette.strata[2]),
    bottom = new T.Color(palette.underside);
  for (let i = 0; i < position.count; i++) {
    const t = Math.min(1, (p.y - 1.3 - position.getY(i)) / (radius * 0.55 + 1.4));
    const c = top0.clone().lerp(bottom, t);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  rocks.push(g);
}

/** 動く床・回転橋: 上面の模様と側面の地層、つながり具合を示す光の縁（描画3回）。 */
function movingPlatform(p: Platform, top: T.Material, side: T.Material, bag: Bag) {
  const group = new T.Group();
  if (p.shape) {
    const disc = new T.Mesh(
      bag.add(paint(new T.CylinderGeometry(p.w / 2, p.w / 2, 1, p.shape === 'hex' ? 6 : 32))),
      top,
    );
    disc.position.y = -0.5;
    group.add(disc);
  } else {
    const body = new T.Mesh(bag.add(new T.BoxGeometry(p.w, 1, p.d)), side);
    body.position.y = -0.51;
    const surface = bag.add(paint(new T.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2)));
    const uv = surface.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * p.w) / 4, (uv.getY(i) * p.d) / 4);
    group.add(body, new T.Mesh(surface, top));
  }
  group.position.set(p.x, p.y, p.z);
  group.rotation.y = p.angle ?? 0;
  const trim = bag.add(
    new T.MeshStandardMaterial({
      color: p.motion!.kind === 'lift' ? '#70e8ff' : '#ffe7a2',
      emissive: '#58baca',
      emissiveIntensity: 0.6,
      roughness: 0.6,
    }),
  );
  // 静止区間のある橋は、つながり具合を遠くから読めるよう光の縁を太くし、両端にも付ける。
  const signal = p.motion!.dwell ? 0.42 : 0.12;
  const edges: T.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    edges.push(new T.BoxGeometry(signal, 0.07, p.d).translate(s * (p.w / 2 - signal), 0.05, 0));
    if (p.motion!.dwell)
      edges.push(new T.BoxGeometry(p.w, 0.07, signal).translate(0, 0.05, s * (p.d / 2 - signal)));
  }
  group.add(new T.Mesh(bag.add(mergeGeometries(edges)!), trim));
  edges.forEach((g) => g.dispose());
  return { group, platform: p, trim };
}
