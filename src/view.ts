import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { characterConfig, tuning } from './config';
import {
  surfaceHeight,
  platformPose,
  platformsNear,
  restRemaining,
  type Platform,
  type Course,
  type Pad,
  type Vec,
} from './courses';
import { RouteCamera, screenToWorld } from './camera';
import type { InputVector } from './input';
import type { Physics, GameEvent } from './physics';
import { DashEffects } from './dash-effects';
import { palettes, type Palette } from './look/palette';
import { Sky } from './look/sky';
import { Ambient } from './look/ambient';
import { Bursts } from './look/bursts';
import { Bag } from './look/bag';
import { buildTerrain } from './look/terrain';
import { buildDecor } from './look/decor';
import { beamMaterial, glassMaterial, glowMaterial } from './look/glass';
import { at, build as model } from './look/models';
import {
  checkerTexture,
  chevronTexture,
  glowTexture,
  labelTexture,
  signTexture,
  stripTexture,
} from './look/textures';

export function inPlace(clip: T.AnimationClip, nodes: string[]) {
  const result = clip.clone();
  for (const track of result.tracks) {
    if (!nodes.some((n) => track.name === `${n}.position`)) continue;
    for (let i = 3; i < track.values.length; i += 3) {
      track.values[i] = track.values[0];
      track.values[i + 2] = track.values[2];
    }
  }
  return result;
}
const material = (color: T.ColorRepresentation, extra: T.MeshStandardMaterialParameters = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const additive = (color: string, opacity: number, map?: T.Texture) =>
  new T.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
  });
/** 行列で配置した形状を1つにまとめる（頂点色なしの材質向け）。 */
function mergePlaced(parts: { geometry: T.BufferGeometry; matrix: T.Matrix4 }[]) {
  const pieces = parts.map(({ geometry, matrix }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    return g.applyMatrix4(matrix);
  });
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((g) => g.dispose());
  return merged;
}
function sprite(texture: T.Texture) {
  const m = new T.SpriteMaterial({ map: texture });
  m.addEventListener('dispose', () => texture.dispose());
  return new T.Sprite(m);
}
/** ルート上で p に近い点の進行方向（水平の角度）。 */
function headingAt(course: Course, p: Vec) {
  let best = 0;
  course.route.forEach((q, i) => {
    const b = course.route[best];
    if (Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y) < Math.hypot(b.x - p.x, b.z - p.z, b.y - p.y))
      best = i;
  });
  const a = course.route[Math.max(0, best - 2)],
    b = course.route[Math.min(course.route.length - 1, best + 2)];
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export class View {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(54, 1, 0.1, 420);
  private level = new T.Group();
  private routeCamera = new RouteCamera();
  private activeCourse?: Course;
  private bag = new Bag();
  private sky: Sky;
  private ambient: Ambient;
  private hemisphere: T.HemisphereLight;
  private sun: T.DirectionalLight;
  private decorUpdate?: (time: number) => void;
  private movers: { group: T.Group; platform: Platform; trim: T.MeshStandardMaterial }[] = [];
  private winds?: {
    mesh: T.InstancedMesh;
    items: { origin: T.Vector3; direction: T.Vector3; phase: number }[];
  };
  private scrolling: { texture: T.Texture; speed: number }[] = [];
  private jumpTop?: T.MeshStandardMaterial;
  private jumpBeams?: T.ShaderMaterial;
  private actor = new T.Group();
  private shell = new T.Group();
  private character = new T.Group();
  private tarts: (Vec & { id: string })[] = [];
  private tartParts: { mesh: T.InstancedMesh; offset: T.Matrix4 }[] = [];
  private tartHalo?: T.Points<T.BufferGeometry, T.PointsMaterial>;
  private tartMatrix = new T.Matrix4();
  private checkpoints: T.Mesh[] = [];
  private banners: T.Sprite[] = [];
  private signs: T.Sprite[] = [];
  private goalStar?: T.Object3D;
  private follow = new T.Vector3();
  private mixer?: T.AnimationMixer;
  private run?: T.AnimationAction;
  private bursts: Bursts;
  // ゴール後の周回、着地の沈み込み、チェックポイントの輪の広がり。
  private orbit = 0;
  private celebration = 0;
  private impact = 0;
  private checkpointPulse: number[] = [];
  private placeholder?: T.Group;
  private time = 0;
  // 描画が重い端末では解像度を下げ、軽ければ戻す（操作の応答を優先）。
  private pixelRatio: number;
  private maxPixelRatio: number;
  private frameTimes: number[] = [];
  private adjustedAt = 0;
  private shadow: T.Mesh;
  private glass: T.ShaderMaterial;
  readonly dash: DashEffects;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.pixelRatio = this.maxPixelRatio = Math.min(devicePixelRatio, 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor('#94d6ea');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene.fog = new T.Fog('#bce7ef', 65, 165);
    this.hemisphere = new T.HemisphereLight('#fff9e7', '#7aa3bb', 2.8);
    this.sun = new T.DirectionalLight('#fff5dd', 3.1);
    this.sun.position.set(-20, 40, 15);
    this.scene.add(this.hemisphere, this.sun, this.level, this.actor);
    this.sky = new Sky(this.scene);
    this.ambient = new Ambient(this.scene);
    this.bursts = new Bursts(this.scene);
    this.shadow = new T.Mesh(
      new T.CircleGeometry(0.5, 24),
      new T.MeshBasicMaterial({
        color: '#2d4a52',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        map: glowTexture(),
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.actor.add(this.shell, this.character);
    this.glass = glassMaterial();
    const ball = new T.Mesh(new T.SphereGeometry(tuning.radius, 40, 28), this.glass);
    ball.renderOrder = 3;
    this.shell.add(ball);
    this.dash = new DashEffects(this.scene, this.camera);
    this.scene.add(this.camera);
    const ringMat = new T.MeshBasicMaterial({ color: '#efffff', transparent: true, opacity: 0.55 });
    for (let i = 0; i < 2; i++) {
      const ring = new T.Mesh(new T.TorusGeometry(0.522, 0.009, 5, 48), ringMat);
      ring.rotation.x = (i * Math.PI) / 2;
      this.shell.add(ring);
    }
    const shine = new T.Mesh(
      new T.SphereGeometry(0.1, 12, 8),
      new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }),
    );
    shine.scale.set(0.45, 1.1, 0.3);
    shine.position.set(-0.23, 0.32, 0.34);
    this.actor.add(shine);
    this.createPlaceholder();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  private createPlaceholder() {
    const group = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.24, 16, 12), material('#fff1c5'));
    body.scale.set(1, 1.2, 0.9);
    group.add(body);
    const cap = new T.Mesh(
      new T.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      material('#ef997c'),
    );
    cap.position.y = 0.15;
    group.add(cap);
    const stem = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), material('#8ecda4'));
    stem.position.y = 0.41;
    group.add(stem);
    for (const x of [-0.08, 0.08]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.025, 8, 6), material('#354c61'));
      eye.position.set(x, 0.07, 0.205);
      group.add(eye);
      const foot = new T.Mesh(new T.SphereGeometry(0.075, 10, 8), material('#ce9673'));
      foot.position.set(x * 1.6, -0.26, 0.06);
      group.add(foot);
    }
    this.placeholder = group;
    this.character.add(group);
  }
  async loadCharacter() {
    if (!characterConfig.url) return;
    const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + characterConfig.url);
    const clip = characterConfig.runClip
      ? gltf.animations.find((c) => c.name === characterConfig.runClip)
      : gltf.animations.find((c) => /run|走/i.test(c.name));
    if (!clip)
      throw new Error('GLBに指定した走行モーションがありません。runClipの設定を確認してください。');
    const box = new T.Box3().setFromObject(gltf.scene),
      size = box.getSize(new T.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('GLBの大きさを取得できません。');
    const scale = Math.min(characterConfig.height / size.y, 0.78 / Math.max(size.x, size.z));
    const center = box.getCenter(new T.Vector3());
    gltf.scene.scale.setScalar(scale);
    gltf.scene.position.set(-center.x * scale, -0.42 - box.min.y * scale, -center.z * scale);
    const orient = new T.Group();
    orient.rotation.y = characterConfig.yaw;
    orient.add(gltf.scene);
    this.mixer = new T.AnimationMixer(gltf.scene);
    this.run = this.mixer.clipAction(inPlace(clip, characterConfig.rootMotionNodes));
    this.run.play();
    this.renderer.domElement.dataset.character = clip.name;
    if (this.placeholder) {
      this.character.remove(this.placeholder);
      this.disposeGroup(this.placeholder);
      this.placeholder = undefined;
    }
    this.character.add(orient);
  }
  private disposeGroup(group: T.Group) {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    group.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Sprite || o instanceof T.Points) {
        if (!(o instanceof T.Sprite)) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
  }
  private applyPalette(palette: Palette) {
    this.renderer.setClearColor(palette.fog.color);
    this.renderer.toneMappingExposure = palette.exposure;
    this.scene.fog = new T.Fog(palette.fog.color, palette.fog.near, palette.fog.far);
    this.hemisphere.color.set(palette.light.sky);
    this.hemisphere.groundColor.set(palette.light.ground);
    this.hemisphere.intensity = palette.light.hemisphere;
    this.sun.color.set(palette.light.sun);
    this.sun.intensity = palette.light.intensity;
    this.sun.position.set(...palette.sun.direction).multiplyScalar(60);
    this.ambient.setPalette(palette);
  }
  build(course: Course) {
    this.dash.reset();
    this.activeCourse = course;
    this.disposeGroup(this.level);
    this.bag.dispose();
    this.movers = [];
    this.winds = undefined;
    this.scrolling = [];
    this.jumpTop = this.jumpBeams = undefined;
    this.tarts = [];
    this.tartParts = [];
    this.tartHalo = undefined;
    this.checkpoints = [];
    this.banners = [];
    this.signs = [];
    this.goalStar = undefined;
    this.checkpointPulse = [];
    this.bursts.clear();
    this.orbit = this.celebration = this.impact = 0;
    const palette = palettes[course.theme] ?? palettes[0];
    this.applyPalette(palette);
    this.sky.build(course, palette);
    const terrain = buildTerrain(course, palette, this.bag);
    this.level.add(...terrain.objects);
    this.movers = terrain.movers;
    const decor = buildDecor(course, palette, this.bag);
    this.level.add(decor.group);
    this.decorUpdate = decor.update;
    this.mechanics(course);
    this.dash.addPanels(
      course.pads.filter((p) => p.type === 'dash'),
      this.level,
    );
    this.jumpPads(course.pads.filter((p) => p.type === 'jump'));
    this.buildTarts(course);
    this.buildCheckpoints(course);
    this.buildGoal(course);
    this.flag(course.start.x - 2.8, course.start.z, 'START', course.color, course.start.y - 0.6);
    this.snap(course.start);
  }
  /** 区間の看板、風・ベルトコンベア・ネオンのゲート。 */
  private mechanics(course: Course) {
    const signs = [
      ...(course.sections ?? []),
      ...(() => {
        // 入門コースの動く橋の分岐
        const moving = course.platforms.find((p) => p.motion),
          branch = course.branches[0];
        if (!moving || !branch || course.sections?.length) return [];
        return [{ ...branch[0], title: 'DETOUR', hint: '動く橋 → 高さを見て渡ろう' }];
      })(),
    ];
    for (const section of signs) {
      const heading = headingAt(course, section);
      const sign = sprite(signTexture(section.title, section.hint));
      // 道の上に重ならないよう、道幅の外側に立てる。
      const side = Math.max(
        5.5,
        ...platformsNear(course, section)
          .filter((p) => p.lane)
          .map((p) => p.lane!.width / 2 + 3.2),
      );
      sign.position.set(
        section.x - Math.cos(heading) * side,
        section.y + 3,
        section.z + Math.sin(heading) * side,
      );
      sign.scale.set(6, 1.97, 1);
      sign.material.transparent = true;
      this.level.add(sign);
      this.signs.push(sign);
    }
    const winds = course.platforms.filter((p, i) => p.effect?.kind === 'wind' && i % 5 === 0);
    if (winds.length) {
      const items = winds.flatMap((p) =>
        Array.from({ length: 4 }, (_, n) => ({
          origin: new T.Vector3(p.x, p.y + 0.6 + n * 0.35, p.z + n * 1.1),
          direction: new T.Vector3(p.effect!.x, 0, p.effect!.z),
          phase: n * 0.23 + p.x * 0.01,
        })),
      );
      const mesh = new T.InstancedMesh(
        new T.PlaneGeometry(2.4, 0.09).rotateX(-Math.PI / 2),
        additive('#fff6ce', 1, this.bag.add(stripTexture())),
        items.length,
      );
      mesh.frustumCulled = false;
      this.winds = { mesh, items };
      this.level.add(mesh);
    }
    const conveyors = course.platforms.filter(
      (p, i) => p.effect?.kind === 'conveyor' && i % 4 === 0,
    );
    if (conveyors.length) {
      const texture = this.bag.add(chevronTexture());
      this.scrolling.push({ texture, speed: 1.6 });
      const parts = conveyors.map((p) => {
        const g = new T.PlaneGeometry(p.w * 0.3, 2).rotateX(-Math.PI / 2);
        const uv = g.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 2);
        return {
          geometry: g,
          matrix: at(p.x, p.y + 0.03, p.z, 1, [0, Math.atan2(-p.effect!.x, -p.effect!.z), 0]),
        };
      });
      this.level.add(new T.Mesh(mergePlaced(parts), glowMaterial('#6ff3ff', texture, 0.55)));
    }
    if (course.theme === 3) {
      // ネオンのゲート: 道の脇に並ぶ光の門
      const parts: Parameters<typeof model>[0] = [];
      for (let i = 8; i < course.route.length; i += 10) {
        const p = course.route[i],
          next = course.route[Math.min(course.route.length - 1, i + 1)],
          angle = Math.atan2(next.x - p.x, next.z - p.z);
        const side = i % 20 ? 1 : -1,
          color = i % 20 ? '#57ecff' : '#ff85cd';
        const gx = p.x - Math.cos(angle) * side * 10.5,
          gz = p.z + Math.sin(angle) * side * 10.5;
        for (const s of [-1, 1])
          parts.push({
            geometry: new T.BoxGeometry(0.22, 5, 0.28),
            color,
            matrix: at(
              gx + Math.cos(angle) * s * 2.8,
              p.y + 2.5,
              gz - Math.sin(angle) * s * 2.8,
              1,
              [0, angle, 0],
            ),
          });
        parts.push({
          geometry: new T.BoxGeometry(5.8, 0.18, 0.28),
          color,
          matrix: at(gx, p.y + 5, gz, 1, [0, angle, 0]),
        });
      }
      if (parts.length)
        this.level.add(new T.Mesh(model(parts), new T.MeshBasicMaterial({ vertexColors: true })));
    }
  }
  /** ジャンプ台: 桃色の台、上へ流れる山形、立ちのぼる光。すべてまとめて描く。 */
  private jumpPads(pads: Pad[]) {
    if (!pads.length) return;
    const base: { geometry: T.BufferGeometry; matrix: T.Matrix4 }[] = [],
      top: typeof base = [],
      arrows: typeof base = [],
      beams: typeof base = [];
    for (const pad of pads) {
      const place = at(pad.x, (pad.y ?? 0) + 0.06, pad.z, 1, [0, Math.atan2(-pad.dx, -pad.dz), 0]);
      base.push({ geometry: new T.BoxGeometry(pad.w + 0.3, 0.14, pad.d + 0.3), matrix: place });
      top.push({
        geometry: new T.BoxGeometry(pad.w - 0.2, 0.05, pad.d - 0.2).translate(0, 0.08, 0),
        matrix: place,
      });
      const arrow = new T.PlaneGeometry(Math.min(2.2, pad.w - 0.6), pad.d - 0.4).rotateX(
        -Math.PI / 2,
      );
      const uv = arrow.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * ((pad.d - 0.4) / 1.2));
      arrows.push({ geometry: arrow.translate(0, 0.12, 0), matrix: place });
      for (const yaw of [0, Math.PI / 2])
        beams.push({
          geometry: new T.PlaneGeometry(pad.w * 0.8, 4.5).rotateY(yaw).translate(0, 2.3, 0),
          matrix: place,
        });
    }
    const chevrons = this.bag.add(chevronTexture());
    this.scrolling.push({ texture: chevrons, speed: 2.4 });
    this.jumpTop = new T.MeshStandardMaterial({
      color: '#ff7fb2',
      emissive: '#ff4f98',
      emissiveIntensity: 0.4,
      roughness: 0.45,
    });
    this.jumpBeams = beamMaterial('#ff8fc8', this.bag.add(stripTexture()));
    this.level.add(
      new T.Mesh(mergePlaced(base), new T.MeshLambertMaterial({ color: '#5b2a63' })),
      new T.Mesh(mergePlaced(top), this.jumpTop),
      new T.Mesh(mergePlaced(arrows), glowMaterial('#ffffff', chevrons, 0.9)),
      new T.Mesh(mergePlaced(beams), this.jumpBeams),
    );
  }
  /** タルト: 波形のタルト生地・クリーム・いちごの3部品と、足元の光。 */
  private buildTarts(course: Course) {
    this.tarts = course.tarts;
    if (!this.tarts.length) return;
    const crust = new T.CylinderGeometry(0.29, 0.21, 0.15, 16, 1);
    const position = crust.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i),
        z = position.getZ(i),
        r = Math.hypot(x, z),
        a = Math.atan2(z, x);
      if (r < 0.05) continue;
      const k = 1 + 0.06 * Math.cos(a * 8);
      position.setXYZ(i, x * k, position.getY(i), z * k);
    }
    crust.computeVertexNormals();
    const parts: [T.BufferGeometry, T.Material, T.Matrix4][] = [
      [crust, new T.MeshLambertMaterial({ color: '#d99a52' }), at(0, 0, 0)],
      [
        new T.CylinderGeometry(0.22, 0.22, 0.08, 12),
        new T.MeshLambertMaterial({ color: '#fff0c2' }),
        at(0, 0.09, 0),
      ],
      [
        new T.SphereGeometry(0.1, 8, 6),
        new T.MeshStandardMaterial({ color: '#e8394e', roughness: 0.3, emissive: '#5a0010' }),
        at(0, 0.19, 0, [1, 1.15, 1]),
      ],
    ];
    this.tartParts = parts.map(([geometry, m, offset]) => {
      const mesh = new T.InstancedMesh(geometry, m, this.tarts.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.level.add(mesh);
      return { mesh, offset };
    });
    const halo = new T.BufferGeometry();
    halo.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(this.tarts.length * 3), 3),
    );
    halo.setAttribute('color', new T.BufferAttribute(new Float32Array(this.tarts.length * 3), 3));
    this.tartHalo = new T.Points(
      halo,
      new T.PointsMaterial({
        size: 1.15,
        map: this.bag.add(glowTexture()),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.tartHalo.frustumCulled = false;
    this.level.add(this.tartHalo);
  }
  /** チェックポイント: 床の輪、道の外側に立つ柱、高い位置の札。 */
  private buildCheckpoints(course: Course) {
    const posts: Parameters<typeof model>[0] = [];
    course.checkpoints.forEach((cp, i) => {
      const ring = new T.Mesh(
        new T.TorusGeometry(2.1, 0.11, 6, 48),
        new T.MeshStandardMaterial({
          color: '#8eb3da',
          emissive: '#4c7fae',
          emissiveIntensity: 0.4,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cp.x, cp.y + 0.09, cp.z);
      this.level.add(ring);
      this.checkpoints.push(ring);
      const heading = headingAt(course, { ...cp, y: cp.y });
      const half = Math.max(
        6.4,
        ...platformsNear(course, cp)
          .filter((p) => p.lane)
          .map((p) => p.lane!.width / 2 + 0.7),
      );
      for (const s of [-1, 1]) {
        const x = cp.x - Math.cos(heading) * s * half,
          z = cp.z + Math.sin(heading) * s * half;
        posts.push({
          geometry: new T.CylinderGeometry(0.16, 0.22, 5.4, 8),
          color: '#f4f1e6',
          matrix: at(x, cp.y + 2.7, z),
        });
        posts.push({
          geometry: new T.SphereGeometry(0.34, 12, 8),
          color: '#8fd3ff',
          matrix: at(x, cp.y + 5.55, z),
        });
      }
      const banner = sprite(labelTexture(`CHECKPOINT ${i + 1}`, '#3f7fb0', '#ffffff'));
      banner.position.set(cp.x, cp.y + 5.3, cp.z);
      banner.scale.set(4.2, 0.79, 1);
      banner.material.transparent = true;
      this.level.add(banner);
      this.banners.push(banner);
    });
    if (posts.length)
      this.level.add(new T.Mesh(model(posts), new T.MeshLambertMaterial({ vertexColors: true })));
  }
  /** ゴール: 金の門、市松の帯、回る星、床の光。 */
  private buildGoal(course: Course) {
    const g = course.goal,
      heading = headingAt(course, g);
    const parts: Parameters<typeof model>[0] = [];
    for (const s of [-1, 1]) {
      const x = s * 2.4;
      parts.push({
        geometry: new T.CylinderGeometry(0.18, 0.24, 5.2, 12),
        color: '#efbc5a',
        matrix: at(x, 2.6, 0),
      });
      for (let k = 0; k < 4; k++)
        parts.push({
          geometry: new T.TorusGeometry(0.24, 0.05, 6, 16),
          color: '#fff3c8',
          matrix: at(x, 0.9 + k * 1.2, 0, 1, [Math.PI / 2, 0, 0]),
        });
      parts.push({
        geometry: new T.SphereGeometry(0.3, 12, 8),
        color: '#fff3c8',
        matrix: at(x, 5.35, 0),
      });
    }
    parts.push({
      geometry: new T.TorusGeometry(2.4, 0.16, 8, 40, Math.PI),
      color: '#efbc5a',
      matrix: at(0, 5.2, 0),
    });
    const arch = new T.Mesh(model(parts), new T.MeshLambertMaterial({ vertexColors: true }));
    const checker = this.bag.add(checkerTexture());
    checker.repeat.set(3, 1);
    const band = new T.Mesh(
      new T.PlaneGeometry(4.6, 0.7),
      new T.MeshBasicMaterial({ map: checker, side: T.DoubleSide }),
    );
    band.position.y = 4.4;
    const label = sprite(labelTexture('GOAL', '#b8812c', '#fff7dc', 256));
    label.position.y = 6.5;
    label.scale.set(2.8, 1.05, 1);
    const star = new T.Mesh(
      new T.OctahedronGeometry(0.5, 0).scale(1, 1.3, 0.35),
      new T.MeshStandardMaterial({ color: '#ffe066', emissive: '#ffb800', emissiveIntensity: 0.7 }),
    );
    star.position.y = 7.6;
    this.goalStar = star;
    const glow = new T.Mesh(
      new T.RingGeometry(1.2, 3, 48).rotateX(-Math.PI / 2),
      additive('#ffe08a', 0.45, this.bag.add(glowTexture())),
    );
    glow.position.y = 0.05;
    const goal = new T.Group();
    goal.add(arch, band, label, star, glow);
    goal.position.set(g.x, g.y, g.z);
    // 門の向き: 柱は道の両脇、帯は進行方向に正対する。
    goal.rotation.y = heading;
    this.level.add(goal);
  }
  private flag(x: number, z: number, text: string, color: string, y = 0) {
    const pole = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 2.1, 8), material('#f7f7e8'));
    pole.position.set(x, y + 1.05, z);
    this.level.add(pole);
    const label = sprite(labelTexture(text, color, '#ffffff', 256));
    label.position.set(x + 0.45, y + 1.95, z);
    label.scale.set(1.6, 0.6, 1);
    this.level.add(label);
  }
  worldInput(input: InputVector) {
    return screenToWorld(input, this.routeCamera.yaw);
  }
  framing() {
    const upper = this.actor.position
      .clone()
      .add(new T.Vector3(0, tuning.radius, 0))
      .project(this.camera);
    const lower = this.actor.position
      .clone()
      .add(new T.Vector3(0, -tuning.radius, 0))
      .project(this.camera);
    const center = this.actor.position.clone().project(this.camera);
    return {
      height: Math.abs(upper.y - lower.y) / 2,
      x: (center.x + 1) / 2,
      y: (1 - center.y) / 2,
    };
  }
  snap(p: Vec) {
    this.follow.set(p.x, p.y, p.z);
    if (this.activeCourse) this.routeCamera.reset(p, this.activeCourse);
    this.actor.position.set(p.x, p.y, p.z);
    this.impact = 0;
  }
  /** strength: 着地の強さなど0〜1。'complete' は全タルト収集の祝福。 */
  effect(type: GameEvent | 'complete', strength = 1) {
    if (type === 'dash' || type === 'fall' || type === 'recover') return;
    const at = this.actor.position.clone(),
      feet = at.clone().setY(at.y - 0.42);
    const ring = (count: number, speed: number, up: number) => (i: number) => {
      const a = (i / count) * Math.PI * 2;
      return new T.Vector3(Math.cos(a) * speed, up, Math.sin(a) * speed);
    };
    const fountain = (spread: number, up: number) => (i: number) =>
      new T.Vector3(Math.sin(i * 2.4) * spread, up + (i % 5) * 0.8, Math.cos(i * 2.4) * spread);
    if (type === 'land') {
      // 足元に広がる土ぼこりと、カメラの小さな沈み込み。
      this.impact = Math.max(this.impact, strength);
      const count = 10 + Math.round(strength * 10);
      this.bursts.emit(
        'dust',
        feet,
        count,
        ring(count, 1.4 + strength * 2.6, 0.5 + strength * 0.8),
        {
          life: 0.6,
          gravity: 2.5,
          drag: 3.2,
          colors: ['#fffaf0', '#f2e6cf'],
        },
      );
      return;
    }
    if (type === 'jump') {
      this.bursts.emit('glow', feet, 18, ring(18, 3.4, 0.7), {
        life: 0.55,
        gravity: 2,
        drag: 3,
        colors: ['#ff7fbf', '#ffc2e0'],
      });
      return;
    }
    if (type === 'goal') {
      this.bursts.emit(
        'confetti',
        at,
        120,
        () => {
          const a = Math.random() * Math.PI * 2,
            out = 1.5 + Math.random() * 3.5;
          return new T.Vector3(Math.cos(a) * out, 5 + Math.random() * 5, Math.sin(a) * out);
        },
        {
          life: 2.8,
          gravity: 5,
          drag: 1.1,
          colors: ['#ff7eb6', '#ffd65c', '#6fe0ff', '#8cf29a', '#b79bff', '#ffffff'],
        },
      );
    }
    if (type === 'complete')
      this.bursts.emit('glow', at, 50, fountain(4, 3), {
        life: 1.6,
        gravity: 6,
        colors: ['#ffe27a', '#ffffff', '#ffb347'],
      });
    if (type === 'checkpoint' && this.activeCourse) {
      // 通過した輪を一度大きく広げる。
      const nearest = this.activeCourse.checkpoints.reduce(
        (best, cp, i, all) =>
          at.distanceToSquared(new T.Vector3(cp.x, cp.y, cp.z)) <
          at.distanceToSquared(new T.Vector3(all[best].x, all[best].y, all[best].z))
            ? i
            : best,
        0,
      );
      this.checkpointPulse[nearest] = 1;
    }
    const count = type === 'checkpoint' ? 26 : type === 'goal' ? 40 : 14;
    this.bursts.emit('glow', at, count, fountain(2.8, 2), {
      life: 1.1,
      gravity: 8,
      colors: type === 'checkpoint' ? ['#8fffc0', '#ffffff'] : ['#ffe27a', '#fff6d0', '#ff9f5a'],
    });
  }
  private adapt(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 90) this.frameTimes.shift();
    if (this.time - this.adjustedAt < 2 || this.frameTimes.length < 60) return;
    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    const next =
      average > 1 / 48
        ? Math.max(1, this.pixelRatio - 0.25)
        : average < 1 / 58 && this.time - this.adjustedAt > 8
          ? Math.min(this.maxPixelRatio, this.pixelRatio + 0.25)
          : this.pixelRatio;
    if (next === this.pixelRatio) return;
    this.pixelRatio = next;
    this.adjustedAt = this.time;
    this.frameTimes = [];
    this.renderer.setPixelRatio(next);
    this.resize();
  }
  draw(game: Physics, dt: number, menu: boolean) {
    this.time += dt;
    this.adapt(dt);
    const p = game.position,
      v = game.ball.linvel();
    const target = new T.Vector3(p.x, p.y, p.z);
    if (game.round.phase !== 'falling') this.follow.lerp(target, 1 - Math.exp(-dt * 12));
    for (const { platform, group, trim } of this.movers) {
      const pose = platformPose(platform, game.simulationTime);
      group.position.set(pose.position.x, pose.position.y, pose.position.z);
      group.rotation.y = pose.angle;
      if (!platform.motion?.dwell) continue;
      // 緑: つながっている。橙の点滅: まもなく振れる。赤: 振れている最中。
      const rest = restRemaining(platform, game.simulationTime);
      const blink = rest > 0 && rest < 1.2 && Math.sin(this.time * 22) > 0;
      const color =
        rest >= 1.2 ? '#19d665' : rest > 0 ? (blink ? '#ff8c1a' : '#ffe08a') : '#ff4040';
      trim.color.set(color);
      trim.emissive.set(color);
      trim.emissiveIntensity = rest > 0 ? 0.45 : 0.2;
    }
    if (this.winds) {
      const m = new T.Matrix4(),
        q = new T.Quaternion(),
        up = new T.Vector3(0, 1, 0),
        pos = new T.Vector3(),
        one = new T.Vector3(1, 1, 1);
      this.winds.items.forEach((wind, i) => {
        const phase = (game.simulationTime * 0.7 + wind.phase) % 1;
        pos.copy(wind.origin).addScaledVector(wind.direction, (phase - 0.5) * 12);
        q.setFromAxisAngle(up, Math.atan2(wind.direction.x, wind.direction.z) + Math.PI / 2);
        this.winds!.mesh.setMatrixAt(i, m.compose(pos, q, one));
        const k = Math.sin(phase * Math.PI) * 0.7;
        this.winds!.mesh.setColorAt(i, new T.Color(k, k, k));
      });
      this.winds.mesh.instanceMatrix.needsUpdate = true;
      if (this.winds.mesh.instanceColor) this.winds.mesh.instanceColor.needsUpdate = true;
    }
    for (const s of this.scrolling) s.texture.offset.y = -((this.time * s.speed) % 1);
    if (this.jumpTop) this.jumpTop.emissiveIntensity = 0.35 + Math.sin(this.time * 5) * 0.15;
    if (this.jumpBeams)
      this.jumpBeams.uniforms.opacity.value = 0.35 + Math.sin(this.time * 3.5) * 0.1;
    this.decorUpdate?.(this.time);
    this.actor.position.set(p.x, p.y, p.z);
    let ground: number | undefined;
    for (const s of platformsNear(game.course, p)) {
      const y = surfaceHeight(p, s, game.simulationTime);
      if (y !== undefined && y <= p.y && (ground === undefined || y > ground)) ground = y;
    }
    this.shadow.position.set(p.x, (ground ?? 0) + 0.065, p.z);
    this.shadow.visible = ground !== undefined && p.y - ground < 5;
    this.shadow.scale.setScalar(
      Math.max(0.4, 1.15 - Math.max(0, p.y - (ground ?? 0) - 0.52) * 0.14),
    );
    const rotation = game.ball.rotation();
    this.shell.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const speed = Math.hypot(v.x, v.z);
    this.dash.update(
      p,
      v,
      game.dashActive && game.round.phase === 'playing',
      dt,
      game.round.phase === 'playing' || menu,
      game.grounded,
    );
    const dashVisual = this.dash.intensity;
    this.glass.uniforms.boost.value = dashVisual;
    if (speed > 0.25) {
      const desired = new T.Quaternion().setFromEuler(
        new T.Euler(dashVisual * 0.48, Math.atan2(v.x, v.z), 0, 'YXZ'),
      );
      this.character.quaternion.slerp(desired, 1 - Math.exp(-dt * 10));
    }
    const moving = game.round.phase === 'playing' && game.grounded;
    this.renderer.domElement.dataset.characterState = moving
      ? 'running'
      : game.grounded
        ? 'idle'
        : 'airborne';
    if (this.run) {
      this.run.paused = !moving;
      this.run.timeScale = Math.min(2.5, speed / 3);
      this.mixer?.update(dt);
    }
    if (this.placeholder)
      this.placeholder.position.y = moving
        ? Math.sin(this.time * Math.max(4, speed * 5)) * Math.min(0.035, speed * 0.01)
        : 0;
    if (this.tartHalo) {
      const halo = this.tartHalo.geometry,
        positions = halo.getAttribute('position') as T.BufferAttribute,
        colors = halo.getAttribute('color') as T.BufferAttribute;
      const q = new T.Quaternion(),
        pos = new T.Vector3(),
        up = new T.Vector3(0, 1, 0),
        one = new T.Vector3(1, 1, 1),
        zero = new T.Vector3();
      this.tarts.forEach((t, i) => {
        const visible = !game.round.collected.has(t.id);
        pos.set(t.x, t.y + 0.85 + Math.sin(this.time * 2 + t.z) * 0.09, t.z);
        q.setFromAxisAngle(up, this.time * 0.8);
        this.tartMatrix.compose(pos, q, visible ? one : zero);
        for (const part of this.tartParts)
          part.mesh.setMatrixAt(i, new T.Matrix4().multiplyMatrices(this.tartMatrix, part.offset));
        positions.setXYZ(i, pos.x, pos.y + 0.05, pos.z);
        const k = visible ? 0.55 + Math.sin(this.time * 3 + i) * 0.15 : 0;
        colors.setXYZ(i, k, k * 0.78, k * 0.35);
      });
      for (const part of this.tartParts) part.mesh.instanceMatrix.needsUpdate = true;
      positions.needsUpdate = colors.needsUpdate = true;
    }
    this.checkpoints.forEach((m, i) => {
      const passed = i <= game.round.checkpoint;
      const ring = m.material as T.MeshStandardMaterial;
      ring.color.set(passed ? '#71c69d' : '#8eb3da');
      ring.emissive.set(passed ? '#2f9a66' : '#4c7fae');
      const pulse = (this.checkpointPulse[i] = Math.max(0, (this.checkpointPulse[i] ?? 0) - dt));
      m.scale.setScalar(1 + (1 - pulse) * pulse * 2.4);
      this.banners[i]?.material.color.set(passed ? '#b6ffcf' : '#ffffff');
    });
    if (this.goalStar) this.goalStar.rotation.y = this.time * 1.6;
    if (game.round.phase === 'playing') this.routeCamera.update(p, game.course, dt, speed);
    // ゴール後は操作がないので、球の周りをゆっくり回って祝う。操作中は常に進路基準の向き。
    const finished = game.round.phase === 'finished';
    if (finished) this.orbit += dt * 0.5;
    else this.orbit = menu ? Math.sin(this.time * 0.12) * 0.45 : 0;
    this.celebration += ((finished ? 1 : 0) - this.celebration) * (1 - Math.exp(-dt * 3));
    this.impact = Math.max(0, this.impact - dt * 4);
    const yaw = this.routeCamera.yaw + this.orbit,
      distance = menu ? 10 : 6 - dashVisual * 0.6 + this.dash.shock * 0.7 + this.celebration * 1.6;
    this.camera.position
      .copy(this.follow)
      .add(
        new T.Vector3(
          Math.sin(yaw) * distance,
          menu ? 6 : 3 - dashVisual * 0.55 + this.celebration * 0.6 - this.impact * 0.22,
          Math.cos(yaw) * distance,
        ),
      );
    if (this.dash.shock > 0)
      this.camera.position.add(
        new T.Vector3(Math.sin(this.time * 91), Math.cos(this.time * 77), 0).multiplyScalar(
          this.dash.shock * 0.065,
        ),
      );
    this.camera.lookAt(
      this.follow.x - Math.sin(yaw) * 3,
      this.follow.y,
      this.follow.z - Math.cos(yaw) * 3,
    );
    this.bursts.update(dt);
    const targetFov = 55 + dashVisual * 12;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 12));
    this.camera.updateProjectionMatrix();
    // 看板や札がカメラの目の前に来たら薄くして、視界をふさがない。
    for (const s of [...this.signs, ...this.banners])
      s.material.opacity = Math.min(
        1,
        Math.max(0, (s.position.distanceTo(this.camera.position) - 4) / 5),
      );
    this.sky.update(this.camera, this.time);
    this.ambient.update(this.camera, this.time);
    this.renderer.render(this.scene, this.camera);
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }
}
