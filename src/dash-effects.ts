import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Pad, Vec } from './courses';
import { chevronTexture, glowTexture, spindleTexture, stripTexture } from './look/textures';
import { glowMaterial } from './look/glass';

const additive = (color: string, opacity = 0, map?: T.Texture) =>
  new T.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
  });

const TRAIL = 40,
  LINES = 34,
  SPARKS = 48;

/**
 * ダッシュの演出一式。後処理なし・毎フレームの画像生成なしで、
 * パネルの光、発動の輪、軌跡、彗星のような尾、球の周りを流れる風の筋、火花、画面の速度線を出す。
 */
export class DashEffects {
  intensity = 0;
  shock = 0;
  private time = 0;
  private textures = {
    strip: stripTexture(),
    spindle: spindleTexture(),
    glow: glowTexture(),
    chevron: chevronTexture(),
    white: Object.assign(new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), {
      needsUpdate: true,
    }),
  };
  private screen = new T.Group();
  private streaks: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>[] = [];
  private history: T.Vector3[] = [];
  private trailGeometry = new T.BufferGeometry();
  private trailPositions = new Float32Array(TRAIL * 6 * 3);
  private trailColors = new Float32Array(TRAIL * 6 * 3);
  private trailUvs = new Float32Array(TRAIL * 6 * 2);
  private trail: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private rings: { mesh: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>; age: number }[] = [];
  private tail: T.Mesh<T.ConeGeometry, T.ShaderMaterial>;
  private aura: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
  private lines: T.InstancedMesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  private lineState: {
    angle: number;
    radius: number;
    phase: number;
    speed: number;
    length: number;
  }[] = [];
  private sparks: T.Points<T.BufferGeometry, T.PointsMaterial>;
  private sparkState: { velocity: T.Vector3; life: number }[] = [];
  private sparkCursor = 0;
  private sparkClock = 0;
  private panelFace?: T.MeshStandardMaterial;
  private panelArrows?: T.ShaderMaterial;
  private panelFlash = 0;
  private panelCount = 0;
  private direction = new T.Vector3(0, 0, -1);
  constructor(
    private scene: T.Scene,
    private camera: T.PerspectiveCamera,
  ) {
    const { strip, spindle, glow } = this.textures;
    // 軌跡: 幅方向に端が消える帯
    this.trailGeometry.setAttribute(
      'position',
      new T.BufferAttribute(this.trailPositions, 3).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setAttribute(
      'color',
      new T.BufferAttribute(this.trailColors, 3).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setAttribute(
      'uv',
      new T.BufferAttribute(this.trailUvs, 2).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setDrawRange(0, 0);
    const material = additive('#ffffff', 0, strip);
    material.vertexColors = true;
    this.trail = new T.Mesh(this.trailGeometry, material);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 2;
    scene.add(this.trail);
    // 画面の縁を流れる速度線
    camera.add(this.screen);
    for (let i = 0; i < 20; i++) {
      const m = additive(i % 3 ? '#d3ffff' : '#6fd0ff', 0, spindle);
      m.depthTest = false;
      const streak = new T.Mesh(new T.PlaneGeometry(1, 1), m);
      streak.renderOrder = 8;
      this.screen.add(streak);
      this.streaks.push(streak);
    }
    // 発動の輪
    for (let i = 0; i < 3; i++) {
      const mesh = new T.Mesh(
        new T.TorusGeometry(0.62, 0.022, 6, 48),
        additive(i % 2 ? '#ffffff' : '#55edff'),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, age: 1 });
    }
    // 彗星の尾: 球の後ろへ伸び、流れる縞で速さを見せる
    this.tail = new T.Mesh(
      new T.ConeGeometry(0.5, 2.4, 20, 1, true).translate(0, -1.2, 0),
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        uniforms: { time: { value: 0 }, strength: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float time;
          uniform float strength;
          varying vec2 vUv;
          void main() {
            float along = vUv.y;
            float streak = 0.55 + 0.45 * sin(vUv.x * 50.0 + along * 4.0) * sin(along * 14.0 + time * 26.0);
            float fade = pow(along, 1.6);
            vec3 c = mix(vec3(0.25, 0.75, 1.0), vec3(0.9, 1.0, 1.0), fade);
            gl_FragColor = vec4(c, fade * streak * strength * 0.3);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.tail.frustumCulled = false;
    this.tail.renderOrder = 4;
    this.tail.visible = false;
    scene.add(this.tail);
    // 球を包む光
    this.aura = new T.Mesh(new T.SphereGeometry(0.78, 20, 14), additive('#55e6ff', 0, glow));
    this.aura.renderOrder = 4;
    this.aura.visible = false;
    scene.add(this.aura);
    // 球の周りを後ろへ流れる風の筋（ワールド座標）
    this.lines = new T.InstancedMesh(
      new T.PlaneGeometry(1, 1),
      additive('#e8ffff', 0, spindle),
      LINES,
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.lines.visible = false;
    for (let i = 0; i < LINES; i++)
      this.lineState.push({
        angle: (i / LINES) * Math.PI * 2 + Math.sin(i * 7.1) * 0.4,
        radius: 0.9 + ((i * 37) % 11) * 0.28,
        phase: (i * 0.618) % 1,
        speed: 1.4 + ((i * 13) % 7) * 0.12,
        length: 1.2 + ((i * 29) % 9) * 0.22,
      });
    scene.add(this.lines);
    // 接地面から飛ぶ火花
    const sparkGeometry = new T.BufferGeometry();
    sparkGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeometry.setAttribute('color', new T.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new T.Points(
      sparkGeometry,
      new T.PointsMaterial({
        size: 0.2,
        map: glow,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    for (let i = 0; i < SPARKS; i++) this.sparkState.push({ velocity: new T.Vector3(), life: 0 });
    scene.add(this.sparks);
  }
  reset() {
    this.panelFace = this.panelArrows = undefined;
    this.panelCount = 0;
    this.panelFlash = 0;
    this.history = [];
    this.intensity = this.shock = 0;
    this.trailGeometry.setDrawRange(0, 0);
    for (const ring of this.rings) {
      ring.age = 1;
      ring.mesh.visible = false;
    }
    for (const s of this.sparkState) s.life = 0;
    this.screen.visible = this.tail.visible = this.aura.visible = this.lines.visible = false;
  }
  /** すべてのダッシュパネルを材質ごとに1つの形状へまとめる（描画回数を増やさない）。 */
  addPanels(pads: Pad[], level: T.Group) {
    if (!pads.length) return;
    const parts = { base: [], face: [], frame: [], arrows: [] } as Record<
      'base' | 'face' | 'frame' | 'arrows',
      T.BufferGeometry[]
    >;
    for (const pad of pads) {
      const place = new T.Matrix4().compose(
        new T.Vector3(pad.x, (pad.y ?? 0) + 0.07, pad.z),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.atan2(-pad.dx, -pad.dz)),
        new T.Vector3(1, 1, 1),
      );
      const add = (key: keyof typeof parts, g: T.BufferGeometry) => {
        const piece = g.index ? g.toNonIndexed() : g;
        if (piece !== g) g.dispose();
        piece.applyMatrix4(place);
        parts[key].push(piece);
      };
      add('base', new T.BoxGeometry(pad.w + 0.3, 0.16, pad.d + 0.35));
      add('face', new T.BoxGeometry(pad.w - 0.22, 0.035, pad.d - 0.1).translate(0, 0.1, 0));
      for (const [w, d, x, z] of [
        [0.12, pad.d + 0.3, -(pad.w / 2 + 0.05), 0],
        [0.12, pad.d + 0.3, pad.w / 2 + 0.05, 0],
        [pad.w + 0.2, 0.12, 0, -(pad.d / 2 + 0.07)],
        [pad.w + 0.2, 0.12, 0, pad.d / 2 + 0.07],
      ])
        add('frame', new T.BoxGeometry(w, 0.05, d).translate(x, 0.14, z));
      // 矢印: 進む向きに縦のUVを伸ばし、模様を流して向きを示す
      const arrow = new T.PlaneGeometry(Math.min(2.6, pad.w - 0.5), pad.d - 0.2).rotateX(
        -Math.PI / 2,
      );
      const uv = arrow.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * ((pad.d - 0.2) / 1.1));
      add('arrows', arrow.translate(0, 0.13, 0));
    }
    const merged = (key: keyof typeof parts) => {
      const g = mergeGeometries(parts[key])!;
      parts[key].forEach((p) => p.dispose());
      return g;
    };
    this.panelFace = new T.MeshStandardMaterial({
      color: '#f0a52e',
      emissive: '#d0780c',
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.35,
    });
    this.panelArrows = glowMaterial('#fff6d8', this.textures.chevron, 0.95);
    level.add(
      new T.Mesh(
        merged('base'),
        new T.MeshStandardMaterial({ color: '#142d40', metalness: 0.7, roughness: 0.24 }),
      ),
      new T.Mesh(merged('face'), this.panelFace),
      new T.Mesh(merged('frame'), glowMaterial('#ffe27a', this.textures.white, 0.95)),
      new T.Mesh(merged('arrows'), this.panelArrows),
    );
    this.panelCount = pads.length;
  }
  fire(position: Vec, velocity: Vec, padId: string) {
    this.shock = 1;
    if (padId) this.panelFlash = 1;
    const direction = new T.Vector3(velocity.x, 0, velocity.z).normalize();
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      ring.age = -i * 0.045;
      ring.mesh.position.set(position.x, position.y, position.z);
      ring.mesh.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        direction.lengthSq() ? direction : new T.Vector3(0, 0, -1),
      );
    }
    // 発動の瞬間の火花
    for (let i = 0; i < 18; i++)
      this.spark(position, direction, 5 + Math.random() * 5, Math.random() * Math.PI * 2);
  }
  private spark(position: Vec, direction: T.Vector3, speed: number, angle: number) {
    const s = this.sparkState[this.sparkCursor],
      at = this.sparkCursor;
    this.sparkCursor = (this.sparkCursor + 1) % SPARKS;
    const side = new T.Vector3(-direction.z, 0, direction.x);
    s.velocity
      .copy(direction)
      .multiplyScalar(-speed * 0.6)
      .addScaledVector(side, Math.cos(angle) * speed * 0.35)
      .setY(1.5 + Math.abs(Math.sin(angle)) * speed * 0.4);
    s.life = 0.35 + Math.random() * 0.25;
    const positions = this.sparks.geometry.getAttribute('position') as T.BufferAttribute;
    positions.setXYZ(at, position.x, position.y - 0.4, position.z);
  }
  update(
    position: Vec,
    velocity: Vec,
    active: boolean,
    dt: number,
    running: boolean,
    grounded = true,
  ) {
    this.time += running ? dt : 0;
    const speed = Math.hypot(velocity.x, velocity.z);
    const target = active ? Math.min(1, speed / 22) : 0;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt * (active ? 22 : 7)));
    this.shock = Math.max(0, this.shock - dt / 0.18);
    if (speed > 0.5) this.direction.set(velocity.x / speed, 0, velocity.z / speed);
    const glow = this.intensity;
    // パネル: 流れる矢印、光の柱、発動時の閃光
    this.panelFlash = Math.max(0, this.panelFlash - dt * 3);
    if (this.panelFace)
      this.panelFace.emissiveIntensity =
        0.18 + this.panelFlash * 0.6 + Math.sin(this.time * 6) * 0.08;
    // 共有の矢印模様を流す（全パネル同時）。
    this.textures.chevron.offset.y = -((this.time * 1.8) % 1);
    if (this.panelArrows)
      this.panelArrows.uniforms.opacity.value = 0.75 + Math.sin(this.time * 8) * 0.2;
    // 画面の速度線
    this.screen.visible = glow > 0.015;
    const height = Math.tan((this.camera.fov * Math.PI) / 360);
    this.screen.scale.set(height * this.camera.aspect, height, 1);
    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i],
        angle = i * 2.399963;
      const phase = (this.time * (1.7 + speed / 20) + i * 0.137) % 1;
      const radius = 0.7 + phase * 0.8;
      streak.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -1);
      streak.rotation.z = angle - Math.PI / 2;
      streak.scale.set(0.012 + (i % 3) * 0.006, 0.16 + phase * 0.5, 1);
      streak.material.opacity = glow * Math.sin(phase * Math.PI) * 0.8;
    }
    // 軌跡
    const head = new T.Vector3(position.x, position.y - 0.3, position.z);
    if (active && running) {
      if (this.history.length && head.distanceTo(this.history[0]) > 4) this.history = [];
      if (!this.history.length || head.distanceTo(this.history[0]) > 0.08)
        this.history.unshift(head);
      this.history.length = Math.min(this.history.length, TRAIL + 1);
    } else if (!active) this.history.pop();
    let vertex = 0;
    const up = new T.Vector3(0, 1, 0);
    for (let i = 0; i < this.history.length - 1; i++) {
      const a = this.history[i],
        b = this.history[i + 1];
      const side = new T.Vector3().subVectors(a, b).cross(up).normalize();
      const length = Math.max(1, this.history.length - 1);
      const wa = 0.46 * (1 - i / length),
        wb = 0.46 * (1 - (i + 1) / length);
      const corners = [
        a.clone().addScaledVector(side, wa),
        a.clone().addScaledVector(side, -wa),
        b.clone().addScaledVector(side, wb),
        b.clone().addScaledVector(side, -wb),
      ];
      const us = [0, 1, 0, 1];
      for (const index of [0, 1, 2, 2, 1, 3]) {
        corners[index].toArray(this.trailPositions, vertex * 3);
        const fade = Math.pow(1 - (i + (index > 1 ? 1 : 0)) / length, 1.4);
        this.trailColors.set([fade * 0.35, fade * 0.9, fade], vertex * 3);
        this.trailUvs.set([us[index], 0.5], vertex * 2);
        vertex++;
      }
    }
    this.trailGeometry.setDrawRange(0, vertex);
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
    this.trailGeometry.attributes.uv.needsUpdate = true;
    this.trail.material.opacity = glow * 0.6;
    // 彗星の尾と光のまとい
    const ball = new T.Vector3(position.x, position.y, position.z);
    this.tail.visible = this.aura.visible = glow > 0.02;
    if (this.tail.visible) {
      this.tail.position.copy(ball);
      this.tail.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), this.direction);
      this.tail.scale.set(1, 0.6 + glow * 0.8, 1);
      this.tail.material.uniforms.time.value = this.time;
      this.tail.material.uniforms.strength.value = glow;
      this.aura.position.copy(ball);
      this.aura.material.opacity = glow * (0.28 + Math.sin(this.time * 18) * 0.05);
      this.aura.scale.setScalar(1 + this.shock * 0.5);
    }
    // 風の筋: 球の少し前から後ろへ流れる
    this.lines.visible = glow > 0.02;
    if (this.lines.visible) {
      const toCamera = new T.Vector3(),
        widthAxis = new T.Vector3(),
        normal = new T.Vector3(),
        side = new T.Vector3(-this.direction.z, 0, this.direction.x),
        m = new T.Matrix4(),
        p = new T.Vector3();
      this.lineState.forEach((line, i) => {
        const phase = (line.phase + this.time * line.speed * (0.6 + speed / 25)) % 1;
        p.copy(ball)
          .addScaledVector(this.direction, 6 - phase * 14)
          .addScaledVector(side, Math.cos(line.angle) * line.radius)
          .setY(ball.y + 0.2 + Math.abs(Math.sin(line.angle)) * line.radius * 0.7);
        toCamera.subVectors(this.camera.position, p).normalize();
        widthAxis.crossVectors(this.direction, toCamera).normalize().multiplyScalar(0.05);
        normal.crossVectors(widthAxis, this.direction).normalize();
        m.makeBasis(
          widthAxis,
          this.direction.clone().multiplyScalar(line.length * (0.6 + glow)),
          normal,
        );
        m.setPosition(p);
        this.lines.setMatrixAt(i, m);
      });
      this.lines.instanceMatrix.needsUpdate = true;
      this.lines.material.opacity = glow * 0.75;
    }
    // 火花: 接地しているダッシュ中に足元から
    this.sparkClock += active && grounded && running ? dt * 45 : 0;
    while (this.sparkClock > 1) {
      this.sparkClock--;
      this.spark(position, this.direction, speed * 0.4, Math.random() * Math.PI * 2);
    }
    const positions = this.sparks.geometry.getAttribute('position') as T.BufferAttribute,
      colors = this.sparks.geometry.getAttribute('color') as T.BufferAttribute;
    this.sparkState.forEach((s, i) => {
      if (s.life <= 0) {
        colors.setXYZ(i, 0, 0, 0);
        return;
      }
      s.life -= dt;
      s.velocity.y -= dt * 14;
      positions.setXYZ(
        i,
        positions.getX(i) + s.velocity.x * dt,
        positions.getY(i) + s.velocity.y * dt,
        positions.getZ(i) + s.velocity.z * dt,
      );
      const k = Math.max(0, s.life / 0.6);
      colors.setXYZ(i, k, 0.75 * k + 0.1 * k * k, 0.35 * k * k);
    });
    positions.needsUpdate = colors.needsUpdate = true;
    // 発動の輪
    for (const ring of this.rings) {
      ring.age += dt;
      ring.mesh.visible = ring.age >= 0 && ring.age < 0.28;
      ring.mesh.scale.setScalar(1 + Math.max(0, ring.age) * 5);
      ring.mesh.material.opacity = Math.max(0, 1 - ring.age / 0.28) * 0.32;
    }
  }
  get diagnostics() {
    return {
      intensity: this.intensity,
      trailVertices: this.trailGeometry.drawRange.count,
      streakPhase: this.time,
      panelCount: this.panelCount,
    };
  }
}
