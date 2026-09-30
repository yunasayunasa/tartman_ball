import * as T from 'three';
import { glowTexture } from './textures';

// 取得・着地・ジャンプ・ゴールの粒。種類ごとに1回の描画で、使い回しの枠に入れる。
type Particle = {
  position: T.Vector3;
  velocity: T.Vector3;
  life: number;
  max: number;
  gravity: number;
  drag: number;
  color: T.Color;
  spin: T.Vector3;
  rotation: T.Euler;
};
class Pool {
  items: Particle[] = [];
  cursor = 0;
  constructor(size: number) {
    for (let i = 0; i < size; i++)
      this.items.push({
        position: new T.Vector3(),
        velocity: new T.Vector3(),
        life: 0,
        max: 1,
        gravity: 0,
        drag: 0,
        color: new T.Color(),
        spin: new T.Vector3(),
        rotation: new T.Euler(),
      });
  }
  next() {
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    return p;
  }
  step(dt: number) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.rotation.x += p.spin.x * dt;
      p.rotation.y += p.spin.y * dt;
      p.rotation.z += p.spin.z * dt;
    }
  }
}
export type BurstKind = 'glow' | 'dust' | 'confetti';
export class Bursts {
  private pools: Record<BurstKind, Pool> = {
    glow: new Pool(160),
    dust: new Pool(80),
    confetti: new Pool(140),
  };
  private points: Record<'glow' | 'dust', T.Points<T.BufferGeometry, T.PointsMaterial>>;
  private confetti: T.InstancedMesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  private m = new T.Matrix4();
  private q = new T.Quaternion();
  private scale = new T.Vector3();
  constructor(scene: T.Scene) {
    const glow = glowTexture();
    const make = (kind: 'glow' | 'dust', size: number, blending: T.Blending) => {
      const count = this.pools[kind].items.length,
        g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(count * 4), 4));
      const points = new T.Points(
        g,
        new T.PointsMaterial({
          size,
          map: glow,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending,
        }),
      );
      points.frustumCulled = false;
      points.renderOrder = 6;
      scene.add(points);
      return points;
    };
    this.points = {
      glow: make('glow', 0.42, T.AdditiveBlending),
      dust: make('dust', 0.7, T.NormalBlending),
    };
    this.confetti = new T.InstancedMesh(
      new T.PlaneGeometry(0.22, 0.13),
      new T.MeshBasicMaterial({ side: T.DoubleSide }),
      this.pools.confetti.items.length,
    );
    this.confetti.frustumCulled = false;
    for (let i = 0; i < this.pools.confetti.items.length; i++) {
      this.confetti.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0));
      this.confetti.setColorAt(i, new T.Color());
    }
    scene.add(this.confetti);
  }
  emit(
    kind: BurstKind,
    origin: T.Vector3,
    count: number,
    velocity: (i: number) => T.Vector3,
    options: { life: number; gravity: number; drag?: number; colors: string[] },
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.pools[kind].next();
      p.position.copy(origin);
      p.velocity.copy(velocity(i));
      p.life = p.max = options.life * (0.8 + Math.random() * 0.4);
      p.gravity = options.gravity;
      p.drag = options.drag ?? 0;
      p.color.set(options.colors[i % options.colors.length]);
      p.spin.set(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
      p.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    }
  }
  clear() {
    for (const pool of Object.values(this.pools)) for (const p of pool.items) p.life = 0;
  }
  update(dt: number) {
    for (const kind of ['glow', 'dust'] as const) {
      const pool = this.pools[kind],
        g = this.points[kind].geometry;
      pool.step(dt);
      const positions = g.getAttribute('position') as T.BufferAttribute,
        colors = g.getAttribute('color') as T.BufferAttribute;
      pool.items.forEach((p, i) => {
        positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
        const k = p.life > 0 ? Math.min(1, (p.life / p.max) * 1.4) : 0;
        if (kind === 'glow') colors.setXYZW(i, p.color.r * k, p.color.g * k, p.color.b * k, 1);
        else colors.setXYZW(i, p.color.r, p.color.g, p.color.b, k * 0.8);
      });
      positions.needsUpdate = colors.needsUpdate = true;
    }
    const pool = this.pools.confetti;
    pool.step(dt);
    pool.items.forEach((p, i) => {
      const s = p.life > 0 ? Math.min(1, p.life * 2) : 0;
      this.m.compose(p.position, this.q.setFromEuler(p.rotation), this.scale.set(s, s, s));
      this.confetti.setMatrixAt(i, this.m);
      this.confetti.setColorAt(i, p.color);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }
}
