import * as T from 'three';
import type { Palette } from './palette';
import { glowTexture, random } from './textures';

// カメラの周りを漂う小さな粒（花粉・砂・スプリンクル・光の粒・雪・花びら）。1回の描画。
const COUNT = 80,
  BOX = new T.Vector3(34, 16, 34);
export class Ambient {
  readonly points: T.Points<T.BufferGeometry, T.PointsMaterial>;
  private base = new Float32Array(COUNT * 3);
  private phase = new Float32Array(COUNT);
  private wind = new T.Vector3();
  private sway = 0.4;
  constructor(scene: T.Scene) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(COUNT * 3), 3));
    this.points = new T.Points(
      geometry,
      new T.PointsMaterial({
        size: 0.22,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }
  setPalette(palette: Palette) {
    const rnd = random(7),
      colors = this.points.geometry.getAttribute('color') as T.BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      this.base.set([rnd() * BOX.x, rnd() * BOX.y, rnd() * BOX.z], i * 3);
      this.phase[i] = rnd() * Math.PI * 2;
      const c = new T.Color(palette.particles.colors[i % palette.particles.colors.length]);
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
    const kind = palette.particles.kind,
      m = this.points.material;
    // 種類ごとの流れ方と大きさ
    this.wind.set(
      ...(
        {
          pollen: [0.5, 0.15, -0.3],
          sand: [2.4, 0.1, 0.6],
          sprinkle: [0.2, -0.6, 0.1],
          data: [0, 0.8, 0],
          snow: [0.3, -0.9, 0.2],
          petal: [1.1, -0.4, 0.4],
        } as Record<string, [number, number, number]>
      )[kind],
    );
    this.sway = kind === 'data' ? 0.1 : 0.5;
    m.size = kind === 'sand' ? 0.12 : kind === 'sprinkle' || kind === 'petal' ? 0.26 : 0.2;
    m.blending = kind === 'data' || kind === 'snow' ? T.AdditiveBlending : T.NormalBlending;
    m.opacity = kind === 'sand' ? 0.55 : 0.85;
    m.needsUpdate = true;
  }
  update(camera: T.Camera, time: number) {
    const position = this.points.geometry.getAttribute('position') as T.BufferAttribute,
      c = camera.position;
    for (let i = 0; i < COUNT; i++) {
      const wrap = (value: number, size: number, center: number) =>
        center - size / 2 + ((((value - (center - size / 2)) % size) + size) % size);
      const sway = Math.sin(time * 0.7 + this.phase[i]) * this.sway;
      position.setXYZ(
        i,
        wrap(this.base[i * 3] + this.wind.x * time + sway, BOX.x, c.x),
        wrap(this.base[i * 3 + 1] + this.wind.y * time, BOX.y, c.y - 2),
        wrap(this.base[i * 3 + 2] + this.wind.z * time + sway, BOX.z, c.z),
      );
    }
    position.needsUpdate = true;
  }
}
