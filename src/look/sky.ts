import * as T from 'three';
import type { Course } from '../courses';
import type { Palette } from './palette';
import { Bag } from './bag';
import { Clearance } from './placement';
import { cloudTexture, random, rainbowTexture, windowTexture } from './textures';
import { at, box, crystalCluster, cupcake, floatingIsland, pillar, tree } from './models';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_Position.z = p.w * 0.99999;
}`;
const skyFragment = /* glsl */ `
uniform vec3 top;
uniform vec3 middle;
uniform vec3 horizon;
uniform vec3 under;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunSize;
uniform float glow;
uniform float stars;
uniform float time;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0
    ? mix(mix(horizon, middle, smoothstep(0.0, 0.28, h)), top, smoothstep(0.28, 0.95, h))
    : mix(horizon, under, smoothstep(0.0, 0.3, -h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunColor * (smoothstep(sunSize, sunSize + 0.0005, s) * 1.4 + pow(s, 7.0) * glow * 0.6 + pow(s, 90.0) * glow);
  if (stars > 0.0 && h > 0.0) {
    float n = hash(floor(d * 260.0));
    float twinkle = 0.55 + 0.45 * sin(time * 2.3 + n * 60.0);
    c += step(0.9972, n) * stars * twinkle * smoothstep(0.0, 0.25, h) * vec3(0.9, 0.95, 1.0);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// カメラへ向く雲の板。1回の描画ですべての雲を描く。
const billboardVertex = /* glsl */ `
attribute vec3 offset;
attribute vec3 shape;
varying vec2 vUv;
varying float vAlpha;
varying float vFog;
uniform float fogNear;
uniform float fogFar;
void main() {
  vUv = uv;
  vAlpha = shape.z;
  vec4 mv = viewMatrix * vec4(offset, 1.0);
  mv.xy += position.xy * shape.xy;
  vFog = smoothstep(fogNear, fogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const billboardFragment = /* glsl */ `
uniform sampler2D map;
uniform vec3 color;
uniform vec3 shade;
uniform vec3 fogColor;
varying vec2 vUv;
varying float vAlpha;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  vec3 c = mix(shade, color, smoothstep(0.25, 0.75, vUv.y));
  c = mix(c, fogColor, vFog * 0.8);
  gl_FragColor = vec4(c, t.a * vAlpha * (1.0 - vFog * 0.6));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// 虹・オーロラ・格子など、奥に置く発光する板。
const bandVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vLocal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const rainbowFragment = /* glsl */ `
uniform sampler2D map;
uniform float inner;
uniform float outer;
varying vec3 vLocal;
void main() {
  float r = (length(vLocal.xy) - inner) / (outer - inner);
  vec4 c = texture2D(map, vec2(0.5, r));
  gl_FragColor = vec4(c.rgb, c.a * 0.55 * smoothstep(0.0, 0.25, vLocal.y / outer));
  #include <colorspace_fragment>
}`;
const auroraFragment = /* glsl */ `
uniform float time;
varying vec2 vUv;
void main() {
  float wave = sin(vUv.x * 18.0 + time * 0.6) * 0.5 + sin(vUv.x * 7.0 - time * 0.4) * 0.5;
  float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  float curtain = 0.55 + 0.45 * sin(vUv.x * 60.0 + wave * 3.0);
  vec3 c = mix(vec3(0.25, 1.0, 0.75), vec3(0.65, 0.45, 1.0), vUv.y + wave * 0.15);
  gl_FragColor = vec4(c, band * curtain * 0.45 * smoothstep(0.0, 0.1, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x)));
  #include <colorspace_fragment>
}`;
const gridFragment = /* glsl */ `
uniform float time;
varying vec3 vLocal;
void main() {
  vec2 p = vLocal.xy / 12.0;
  vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float fade = 1.0 - smoothstep(120.0, 420.0, length(vLocal.xy));
  float pulse = 0.7 + 0.3 * sin(time * 1.5 - length(vLocal.xy) * 0.03);
  vec3 c = mix(vec3(1.0, 0.3, 0.8), vec3(0.3, 0.9, 1.0), smoothstep(-200.0, 200.0, vLocal.y));
  gl_FragColor = vec4(c * pulse, line * fade * 0.8);
  #include <colorspace_fragment>
}`;
const seaFragment = /* glsl */ `
uniform float time;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 fogColor;
uniform vec3 cameraXZ;
varying vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  float w = sin(p.x * 0.09 + time * 0.8) * sin(p.y * 0.07 - time * 0.6)
    + 0.5 * sin((p.x + p.y) * 0.21 + time * 1.4);
  vec3 c = mix(deep, shallow, 0.5 + 0.25 * w);
  float sparkle = smoothstep(0.82, 1.0, sin(p.x * 0.8 + time * 2.0) * sin(p.y * 0.65 - time * 1.7));
  c += vec3(1.0) * sparkle * 0.35;
  float d = length(p - cameraXZ.xz);
  c = mix(c, fogColor, smoothstep(60.0, 420.0, d));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const color = (value: string) => new T.Color(value);

export class Sky {
  private dome: T.Mesh<T.SphereGeometry, T.ShaderMaterial>;
  private group = new T.Group();
  private bag = new Bag();
  private timed: T.ShaderMaterial[] = [];
  private sea?: T.ShaderMaterial;
  constructor(scene: T.Scene) {
    this.dome = new T.Mesh(
      new T.SphereGeometry(100, 32, 16),
      new T.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: T.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new T.Color() },
          middle: { value: new T.Color() },
          horizon: { value: new T.Color() },
          under: { value: new T.Color() },
          sunColor: { value: new T.Color() },
          sunDir: { value: new T.Vector3(0, 1, 0) },
          sunSize: { value: 0.999 },
          glow: { value: 0.3 },
          stars: { value: 0 },
          time: { value: 0 },
        },
      }),
    );
    // 不透明な物の後に描き、道や島に隠れた画素の計算を省く（空は常に最遠）。
    this.dome.renderOrder = 1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome, this.group);
  }
  build(course: Course, palette: Palette) {
    this.clear();
    const u = this.dome.material.uniforms;
    u.top.value.set(palette.sky[0]);
    u.middle.value.set(palette.sky[1]);
    u.horizon.value.set(palette.sky[2]);
    u.under.value.set(palette.sky[3]);
    u.sunColor.value.set(palette.sun.color);
    u.sunDir.value.set(...palette.sun.direction).normalize();
    u.sunSize.value = palette.sun.size;
    u.glow.value = palette.sun.glow;
    u.stars.value = palette.stars;
    const space = new Clearance(course),
      rnd = random(course.route.length * 31 + course.theme);
    this.clouds(palette, space, rnd);
    if (course.theme === 3) this.skyline(space, rnd);
    else this.islands(course.theme, palette, space, rnd);
    if (course.theme === 0) this.addSea(space, palette);
    if (course.theme === 2) this.rainbow(space);
    if (course.theme === 3) this.grid(space);
    if (course.theme === 4) this.aurora(space);
  }
  private clear() {
    this.group.clear();
    this.bag.dispose();
    this.timed = [];
    this.sea = undefined;
  }
  private clouds(palette: Palette, space: Clearance, rnd: () => number) {
    const map = this.bag.add(cloudTexture(7));
    const floor = space.min.y - 26;
    // 下に広がる雲海（水平な板）。
    if (palette.cloud.sea) {
      const spots: T.Matrix4[] = [];
      for (let x = space.min.x - 150; x < space.max.x + 150; x += 46)
        for (let z = space.min.z - 150; z < space.max.z + 150; z += 46)
          spots.push(
            at(
              x + rnd() * 20 - 10,
              floor + rnd() * 6,
              z + rnd() * 20 - 10,
              [55 + rnd() * 35, 32 + rnd() * 20, 1],
              [-Math.PI / 2, 0, rnd() * Math.PI],
            ),
          );
      const material = this.bag.add(
        new T.MeshBasicMaterial({
          map,
          transparent: true,
          depthWrite: false,
          opacity: palette.cloud.opacity,
          color: palette.cloud.color,
          side: T.DoubleSide,
        }),
      );
      const sea = new T.InstancedMesh(
        this.bag.add(new T.PlaneGeometry(1, 1)),
        material,
        spots.length,
      );
      spots.forEach((m, i) => {
        sea.setMatrixAt(i, m);
        sea.setColorAt(i, color(palette.cloud.color).lerp(color(palette.cloud.shade), rnd() * 0.5));
      });
      sea.renderOrder = -5;
      sea.frustumCulled = false;
      this.group.add(sea);
    }
    // 道から離れた空に浮かぶ雲（カメラへ向く板）。道の上や飛ぶ先は覆わない。
    const offsets: number[] = [],
      shapes: number[] = [];
    for (let tries = 0; tries < 900 && offsets.length < 44 * 3; tries++) {
      const x = space.min.x - 170 + rnd() * (space.max.x - space.min.x + 340),
        z = space.min.z - 170 + rnd() * (space.max.z - space.min.z + 340);
      if (!space.clear(x, z, 42)) continue;
      const high = rnd() < 0.6;
      offsets.push(x, high ? space.max.y + 14 + rnd() * 34 : floor + 8 + rnd() * 10, z);
      const w = 26 + rnd() * 30;
      shapes.push(w, w * (0.4 + rnd() * 0.2), 0.75 + rnd() * 0.25);
    }
    const geometry = this.bag.add(new T.InstancedBufferGeometry());
    const plane = new T.PlaneGeometry(1, 1);
    geometry.index = plane.index;
    geometry.setAttribute('position', plane.getAttribute('position'));
    geometry.setAttribute('uv', plane.getAttribute('uv'));
    geometry.setAttribute('offset', new T.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geometry.setAttribute('shape', new T.InstancedBufferAttribute(new Float32Array(shapes), 3));
    geometry.instanceCount = offsets.length / 3;
    const billboards = new T.Mesh(
      geometry,
      this.bag.add(
        new T.ShaderMaterial({
          vertexShader: billboardVertex,
          fragmentShader: billboardFragment,
          transparent: true,
          depthWrite: false,
          uniforms: {
            map: { value: map },
            color: { value: color(palette.cloud.color) },
            shade: { value: color(palette.cloud.shade) },
            fogColor: { value: color(palette.fog.color) },
            fogNear: { value: palette.fog.near },
            fogFar: { value: palette.fog.far + 60 },
          },
        }),
      ),
    );
    billboards.frustumCulled = false;
    billboards.renderOrder = -4;
    this.group.add(billboards);
  }
  /** 遠くの浮島と、その上の飾り。 */
  private islands(theme: number, palette: Palette, space: Clearance, rnd: () => number) {
    const spots: { x: number; y: number; z: number; s: number }[] = [];
    for (let tries = 0; tries < 600 && spots.length < 16; tries++) {
      const x = space.min.x - 160 + rnd() * (space.max.x - space.min.x + 320),
        z = space.min.z - 160 + rnd() * (space.max.z - space.min.z + 320);
      if (!space.clear(x, z, 70)) continue;
      // 道と同じか下の高さに置く。頭上に岩が垂れ下がって見えないように。
      spots.push({
        x,
        y: space.min.y - 14 + rnd() * (space.max.y - space.min.y + 4),
        z,
        s: 8 + rnd() * 9,
      });
    }
    const [top, rock, , deep] = palette.strata;
    const island = new T.InstancedMesh(
      this.bag.add(floatingIsland(top, rock, deep, theme * 11 + 5)),
      this.bag.add(new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
      spots.length,
    );
    spots.forEach((p, i) =>
      island.setMatrixAt(i, at(p.x, p.y, p.z, [p.s, p.s * 0.8, p.s], [0, rnd() * 6, 0])),
    );
    this.group.add(island);
    const crown =
      theme === 1
        ? pillar(4)
        : theme === 2
          ? cupcake('#ffd1e6')
          : theme === 4
            ? crystalCluster(['#b89cff', '#8feaff', '#ffffff'], 9)
            : tree(theme === 5 ? '#7cc36d' : '#4fb35a', theme === 5 ? '#f0a86e' : '#6fcf6a');
    const crowns = new T.InstancedMesh(
      this.bag.add(crown),
      this.bag.add(new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
      spots.length * 2,
    );
    spots.forEach((p, i) => {
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI * 2,
          r = p.s * (k ? 0.45 : 0.1);
        crowns.setMatrixAt(
          i * 2 + k,
          at(
            p.x + Math.cos(a) * r,
            p.y + p.s * 0.12,
            p.z + Math.sin(a) * r,
            p.s * (0.28 + rnd() * 0.12),
            [0, rnd() * 6, 0],
          ),
        );
      }
    });
    this.group.add(crowns);
  }
  /** ネオンの街並み。窓明かりの付いた高い建物が道の遠くに並ぶ。 */
  private skyline(space: Clearance, rnd: () => number) {
    const map = this.bag.add(windowTexture(21));
    map.repeat.set(1, 1);
    const material = this.bag.add(new T.MeshBasicMaterial({ map, fog: true }));
    const spots: T.Matrix4[] = [];
    for (let tries = 0; tries < 1500 && spots.length < 90; tries++) {
      const x = space.min.x - 150 + rnd() * (space.max.x - space.min.x + 300),
        z = space.min.z - 150 + rnd() * (space.max.z - space.min.z + 300);
      if (!space.clear(x, z, 34)) continue;
      const w = 8 + rnd() * 10,
        h = 30 + rnd() * 80;
      spots.push(at(x, space.min.y - 40, z, [w, h, w], [0, rnd() * 1.5, 0]));
    }
    const geometry = this.bag.add(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const buildings = new T.InstancedMesh(geometry, material, spots.length);
    spots.forEach((m, i) => {
      buildings.setMatrixAt(i, m);
      buildings.setColorAt(i, color(['#ffffff', '#b5d8ff', '#ffc4ec'][i % 3]));
    });
    this.group.add(buildings);
    // 屋上の航空障害灯のような光る帯。
    const trims = new T.InstancedMesh(
      this.bag.add(box()),
      this.bag.add(new T.MeshBasicMaterial({ fog: true })),
      spots.length,
    );
    const s = new T.Vector3(),
      p = new T.Vector3(),
      q = new T.Quaternion();
    spots.forEach((m, i) => {
      m.decompose(p, q, s);
      trims.setMatrixAt(
        i,
        new T.Matrix4().compose(
          p.clone().setY(p.y + s.y),
          q,
          new T.Vector3(s.x * 1.02, 0.5, s.z * 1.02),
        ),
      );
      trims.setColorAt(i, color(i % 2 ? '#49e8ff' : '#ff5fc8'));
    });
    this.group.add(trims);
  }
  private addSea(space: Clearance, palette: Palette) {
    const material = this.bag.add(
      new T.ShaderMaterial({
        vertexShader: bandVertex,
        fragmentShader: seaFragment,
        uniforms: {
          time: { value: 0 },
          deep: { value: color('#1778b6') },
          shallow: { value: color('#44c3e0') },
          fogColor: { value: color(palette.fog.color) },
          cameraXZ: { value: new T.Vector3() },
        },
      }),
    );
    const sea = new T.Mesh(this.bag.add(new T.PlaneGeometry(2600, 2600)), material);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(space.center.x, space.min.y - 18, space.center.z);
    sea.renderOrder = -6;
    this.group.add(sea);
    this.timed.push(material);
    this.sea = material;
  }
  private rainbow(space: Clearance) {
    const inner = 150,
      outer = 175;
    const material = this.bag.add(
      new T.ShaderMaterial({
        vertexShader: bandVertex,
        fragmentShader: rainbowFragment,
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        uniforms: {
          map: { value: this.bag.add(rainbowTexture()) },
          inner: { value: inner },
          outer: { value: outer },
        },
      }),
    );
    const arc = new T.Mesh(
      this.bag.add(new T.RingGeometry(inner, outer, 64, 1, 0, Math.PI)),
      material,
    );
    arc.position.set(space.center.x, space.min.y - 30, space.min.z - 120);
    arc.renderOrder = -7;
    this.group.add(arc);
  }
  private aurora(space: Clearance) {
    const material = this.bag.add(
      new T.ShaderMaterial({
        vertexShader: bandVertex,
        fragmentShader: auroraFragment,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        uniforms: { time: { value: 0 } },
      }),
    );
    this.timed.push(material);
    for (let i = 0; i < 3; i++) {
      const geometry = this.bag.add(new T.PlaneGeometry(420, 70, 40, 1));
      const position = geometry.getAttribute('position');
      for (let k = 0; k < position.count; k++)
        position.setZ(k, Math.sin(position.getX(k) * 0.02 + i) * 40);
      const band = new T.Mesh(geometry, material);
      band.position.set(
        space.center.x + (i - 1) * 90,
        space.max.y + 60 + i * 18,
        space.min.z - 90 - i * 60,
      );
      band.rotation.y = (i - 1) * 0.35;
      band.renderOrder = -7;
      this.group.add(band);
    }
  }
  private grid(space: Clearance) {
    const material = this.bag.add(
      new T.ShaderMaterial({
        vertexShader: bandVertex,
        fragmentShader: gridFragment,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        uniforms: { time: { value: 0 } },
      }),
    );
    this.timed.push(material);
    const plane = new T.Mesh(this.bag.add(new T.PlaneGeometry(900, 900)), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(space.center.x, space.min.y - 38, space.center.z);
    plane.renderOrder = -6;
    this.group.add(plane);
  }
  update(camera: T.Camera, time: number) {
    this.dome.position.copy(camera.position);
    this.dome.material.uniforms.time.value = time;
    for (const m of this.timed) m.uniforms.time.value = time;
    this.sea?.uniforms.cameraXZ.value.set(camera.position.x, 0, camera.position.z);
  }
}
