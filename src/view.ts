import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { characterConfig, tuning } from './config';
import {
  surfaceHeight,
  platformPose,
  surfaceColors,
  type Platform,
  type Course,
  type Vec,
} from './courses';
import { RouteCamera, screenToWorld } from './camera';
import type { InputVector } from './input';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roadMaterial } from './materials';
import type { Physics, GameEvent } from './physics';

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
export class View {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(54, 1, 0.1, 220);
  private level = new T.Group();
  private routeCamera = new RouteCamera();
  private activeCourse?: Course;
  private movers: { group: T.Group; platform: Platform }[] = [];
  private rotors: T.Group[] = [];
  private actor = new T.Group();
  private shell = new T.Group();
  private character = new T.Group();
  private tarts = new Map<string, T.Group>();
  private tartInstances: T.InstancedMesh[] = [];
  private tartMatrix = new T.Matrix4();
  private checkpoints: T.Mesh[] = [];
  private follow = new T.Vector3();
  private mixer?: T.AnimationMixer;
  private run?: T.AnimationAction;
  private particles: { mesh: T.Mesh; velocity: T.Vector3; life: number }[] = [];
  private particleGeometry = new T.IcosahedronGeometry(0.09, 0);
  private particleMaterial = material('#ffe695', { emissive: '#ffba55', emissiveIntensity: 0.3 });
  private placeholder?: T.Group;
  private clouds = new T.Group();
  private time = 0;
  private shadow: T.Mesh;
  private ballMaterial: T.MeshStandardMaterial;
  private dashTrail: T.Mesh;
  private speedLines = new T.Group();
  private dashVisual = 0;
  private dashShock = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor('#94d6ea');
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene.fog = new T.Fog('#bce7ef', 65, 165);
    this.scene.add(new T.HemisphereLight('#fff9e7', '#7aa3bb', 2.8));
    const sun = new T.DirectionalLight('#fff5dd', 3.1);
    sun.position.set(-20, 40, 15);
    this.scene.add(sun);
    this.scene.add(this.level, this.actor, this.clouds);
    this.shadow = new T.Mesh(
      new T.CircleGeometry(0.48, 24),
      new T.MeshBasicMaterial({
        color: '#527a82',
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
    this.actor.add(this.shell, this.character);
    this.ballMaterial = material('#b9f4ff', {
      transparent: true,
      opacity: 0.18,
      roughness: 0.12,
      metalness: 0.25,
      depthWrite: false,
    });
    const ball = new T.Mesh(new T.SphereGeometry(tuning.radius, 32, 24), this.ballMaterial);
    ball.renderOrder = 3;
    this.shell.add(ball);
    this.dashTrail = new T.Mesh(
      new T.ConeGeometry(0.38, 4.5, 12, 1, true),
      new T.MeshBasicMaterial({
        color: '#8ff8ff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.dashTrail.rotation.x = -Math.PI / 2;
    this.dashTrail.position.z = 2.5;
    this.actor.add(this.dashTrail);
    for (let i = 0; i < 14; i++) {
      const line = new T.Mesh(
        new T.PlaneGeometry(0.025, 0.9 + (i % 4) * 0.3),
        new T.MeshBasicMaterial({
          color: '#d9ffff',
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      line.position.set(((i % 7) - 3) * 0.24, (((i * 5) % 9) - 4) * 0.18, -1.2 - (i % 3) * 0.25);
      this.speedLines.add(line);
    }
    this.speedLines.position.z = -1;
    this.camera.add(this.speedLines);
    this.scene.add(this.camera);
    const ringMat = new T.MeshBasicMaterial({ color: '#efffff', transparent: true, opacity: 0.65 });
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
    const cloudGeo = new T.SphereGeometry(1, 12, 8),
      cloudMat = material('#ffffff');
    const cloudMesh = new T.InstancedMesh(cloudGeo, cloudMat, 45 * 3);
    const cloudPose = new T.Object3D();
    for (let i = 0; i < 45; i++) {
      const x = Math.sin(i * 17.23) * 62,
        z = 15 - i * 26;
      for (let lobe = 0; lobe < 3; lobe++) {
        cloudPose.position.set(
          x + (lobe - 1) * 3,
          -10 - (i % 4) * 2 + (lobe === 1 ? 0.8 : 0),
          z + (lobe % 2),
        );
        cloudPose.scale.set(3.8, lobe === 1 ? 2.2 : 1.5, 2.7);
        cloudPose.updateMatrix();
        cloudMesh.setMatrixAt(i * 3 + lobe, cloudPose.matrix);
      }
    }
    this.clouds.add(cloudMesh);
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
      if (o instanceof T.Mesh || o instanceof T.Sprite) {
        if (o instanceof T.Mesh) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    group.clear();
  }
  build(course: Course) {
    this.activeCourse = course;
    this.movers = [];
    this.rotors = [];
    this.disposeGroup(this.level);
    this.tarts.clear();
    this.tartInstances = [];
    this.checkpoints = [];
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particles = [];
    const sky = ['#80d3e6', '#e6b36b', '#b9a9e5', '#131b3a', '#474266', '#eb9b85'][course.theme];
    this.renderer.setClearColor(sky);
    if (this.scene.background instanceof T.Texture) this.scene.background.dispose();
    const backdrop = document.createElement('canvas');
    backdrop.width = 2;
    backdrop.height = 256;
    const ctx = backdrop.getContext('2d')!,
      gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(
      0,
      ['#459fcc', '#bd7139', '#8e6ebd', '#080e27', '#272943', '#ce6686'][course.theme],
    );
    gradient.addColorStop(0.65, sky);
    gradient.addColorStop(
      1,
      ['#d7f4e4', '#ffe0a1', '#ffe9da', '#30446a', '#afa4cb', '#ffe1a9'][course.theme],
    );
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    this.scene.background = new T.CanvasTexture(backdrop);
    this.scene.background.colorSpace = T.SRGBColorSpace;
    this.scene.fog = new T.Fog(sky, 60, 180);
    const floor = material(surfaceColors[course.platforms[0].surface ?? 'grass']),
      side = material(course.color),
      cliff = material('#84aab3');
    const roadMaterials = new Map<string, T.MeshStandardMaterial>();
    for (const p of course.platforms) {
      const surface = p.surface ?? 'grass';
      const layer = p.shape
        ? 'island'
        : p.id.startsWith('shortcut') || p.id.startsWith('moving-')
          ? 'branch'
          : 'road';
      const materialKey = surface + '/' + layer;
      if (!roadMaterials.has(materialKey)) {
        const m = roadMaterial(surface);
        if (layer !== 'road') {
          m.polygonOffset = true;
          m.polygonOffsetFactor = layer === 'island' ? -2 : -1;
          m.polygonOffsetUnits = -1;
        }
        roadMaterials.set(materialKey, m);
      }
      const topMaterial = roadMaterials.get(materialKey)!;
      if (p.vertices) {
        const geometry = new T.BufferGeometry();
        geometry.setAttribute(
          'position',
          new T.Float32BufferAttribute(
            p.vertices.flatMap((p) => [p.x, p.y, p.z]),
            3,
          ),
        );
        geometry.setAttribute(
          'uv',
          new T.Float32BufferAttribute(
            p.vertices.flatMap((p) => [p.x / 4, p.z / 4]),
            2,
          ),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.computeVertexNormals();
        topMaterial.side = T.DoubleSide;
        this.level.add(new T.Mesh(geometry, topMaterial));
        const walls = new T.BufferGeometry(),
          coords: number[] = [];
        for (const [a, b] of [
          [0, 1],
          [2, 3],
        ]) {
          const u = p.vertices[a],
            v = p.vertices[b];
          coords.push(
            u.x,
            u.y,
            u.z,
            v.x,
            v.y,
            v.z,
            v.x,
            v.y - 0.8,
            v.z,
            u.x,
            u.y,
            u.z,
            v.x,
            v.y - 0.8,
            v.z,
            u.x,
            u.y - 0.8,
            u.z,
          );
        }
        walls.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
        walls.computeVertexNormals();
        walls.setAttribute(
          'uv',
          new T.Float32BufferAttribute(Array((coords.length / 3) * 2).fill(0), 2),
        );
        this.level.add(new T.Mesh(walls, side));
        continue;
      }
      if (p.shape || p.motion) {
        const group = new T.Group();
        const mesh = new T.Mesh(
          p.shape
            ? new T.CylinderGeometry(p.w / 2, p.w / 2, 1, p.shape === 'hex' ? 6 : 32)
            : new T.BoxGeometry(p.w, 1, p.d),
          topMaterial,
        );
        mesh.position.y = -0.5;
        group.add(mesh);
        group.position.set(p.x, p.y, p.z);
        this.level.add(group);
        if (p.motion) this.movers.push({ group, platform: p });
        continue;
      }
      const slab = new T.Mesh(new T.BoxGeometry(p.w, 0.65, p.d), side);
      slab.position.set(p.x, -0.36, p.z);
      slab.rotation.y = p.angle ?? 0;
      this.level.add(slab);
      const top = new T.Mesh(new T.BoxGeometry(p.w - 0.12, 0.1, p.d - 0.12), floor);
      top.position.set(p.x, -0.025, p.z);
      top.rotation.y = p.angle ?? 0;
      this.level.add(top);
      if (p.id.startsWith('island')) {
        const rock = new T.Mesh(new T.ConeGeometry(4.5, 5, 5), cliff);
        rock.rotation.z = Math.PI;
        rock.position.set(p.x, -3, p.z);
        this.level.add(rock);
        const trim = new T.Mesh(new T.TorusGeometry(2.85, 0.055, 6, 48), material(course.color));
        trim.rotation.x = -Math.PI / 2;
        trim.position.set(p.x, 0.045, p.z);
        this.level.add(trim);
      }
    }
    floor.dispose();
    cliff.dispose();
    this.decorate(course);
    for (const pad of course.pads) {
      const mesh = new T.Mesh(
        new T.BoxGeometry(pad.w, 0.055, pad.d),
        material(pad.type === 'dash' ? '#f6be50' : '#ec8ea4', {
          emissive: pad.type === 'dash' ? '#d49013' : '#bc436e',
          emissiveIntensity: 0.18,
        }),
      );
      mesh.position.set(pad.x, (pad.y ?? 0) + 0.075, pad.z);
      mesh.rotation.y = Math.atan2(-pad.dx, -pad.dz);
      this.level.add(mesh);
      const arrow = new T.Shape();
      arrow.moveTo(-0.62, -0.35);
      arrow.lineTo(0, 0.28);
      arrow.lineTo(0.62, -0.35);
      arrow.lineTo(0.62, -0.05);
      arrow.lineTo(0, 0.6);
      arrow.lineTo(-0.62, -0.05);
      arrow.closePath();
      const indicator = new T.Mesh(
        new T.ShapeGeometry(arrow),
        new T.MeshBasicMaterial({ color: '#fffbed', side: T.DoubleSide }),
      );
      indicator.rotation.x = -Math.PI / 2;
      indicator.rotation.z = Math.atan2(-pad.dx, -pad.dz);
      indicator.position.set(pad.x, (pad.y ?? 0) + 0.111, pad.z);
      this.level.add(indicator);
    }
    const crust = material('#d69a55'),
      cream = material('#ffe7a1'),
      berry = material('#e56e77');
    for (const t of course.tarts) {
      const group = new T.Group();
      const base = new T.Mesh(new T.CylinderGeometry(0.27, 0.2, 0.14, 12), crust);
      group.add(base);
      const filling = new T.Mesh(new T.CylinderGeometry(0.21, 0.21, 0.07, 16), cream);
      filling.position.y = 0.08;
      group.add(filling);
      const fruit = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), berry);
      fruit.position.y = 0.17;
      group.add(fruit);
      group.position.set(t.x, t.y + 0.85, t.z);
      group.userData.floor = t.y;
      this.level.add(group);
      this.tarts.set(t.id, group);
    }
    const tartGroups = [...this.tarts.values()];
    if (tartGroups.length) {
      for (let part = 0; part < 3; part++) {
        const original = tartGroups[0].children[part] as T.Mesh;
        const instances = new T.InstancedMesh(
          original.geometry,
          original.material,
          tartGroups.length,
        );
        instances.frustumCulled = false;
        instances.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.tartInstances.push(instances);
        this.level.add(instances);
        for (const group of tartGroups.slice(1))
          (group.children[part] as T.Mesh).geometry.dispose();
      }
      for (const group of tartGroups) this.level.remove(group);
    }
    course.checkpoints.forEach((cp, i) => {
      const ring = new T.Mesh(new T.TorusGeometry(2.1, 0.1, 6, 40), material('#8eb3da'));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cp.x, cp.y + 0.09, cp.z);
      this.level.add(ring);
      this.checkpoints.push(ring);
      this.flag(cp.x - 2.8, cp.z, `${i + 1}`, '#8eb3da', cp.y);
    });
    const goal = new T.Group(),
      gold = material('#efbc5a');
    for (const x of [-2.1, 2.1]) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.17, 4, 10), gold);
      pole.position.set(x, 2, 0);
      goal.add(pole);
    }
    const arch = new T.Mesh(new T.TorusGeometry(2.1, 0.16, 8, 32, Math.PI), gold);
    arch.position.y = 4;
    goal.add(arch);
    const banner = this.label('GOAL', '#fff5d4', '#9b722b');
    banner.position.set(0, 3.8, 0);
    banner.scale.set(3.8, 1, 1);
    goal.add(banner);
    goal.position.set(course.goal.x, course.goal.y, course.goal.z);
    this.level.add(goal);
    this.flag(course.start.x - 2.8, course.start.z, 'START', course.color);
    this.snap(course.start);
    this.batchStatic();
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
  private batchStatic() {
    const batches = new Map<
      string,
      { material: T.Material; geometries: T.BufferGeometry[]; meshes: T.Mesh[] }
    >();
    for (const child of [...this.level.children]) {
      if (
        !(child instanceof T.Mesh) ||
        child instanceof T.InstancedMesh ||
        !(child.material instanceof T.MeshStandardMaterial) ||
        this.checkpoints.includes(child)
      )
        continue;
      const m = child.material;
      const key = [
        m.color.getHex(),
        m.roughness,
        m.metalness,
        m.emissive.getHex(),
        m.emissiveIntensity,
        m.side,
        m.map?.uuid ?? '',
      ].join('/');
      child.updateMatrix();
      const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      g.applyMatrix4(child.matrix);
      if (!g.hasAttribute('uv'))
        g.setAttribute(
          'uv',
          new T.Float32BufferAttribute(Array(g.getAttribute('position').count * 2).fill(0), 2),
        );
      let batch = batches.get(key);
      if (!batch) {
        batch = { material: m, geometries: [], meshes: [] };
        batches.set(key, batch);
      }
      batch.geometries.push(g);
      batch.meshes.push(child);
    }
    for (const batch of batches.values()) {
      const combined = mergeGeometries(batch.geometries);
      if (!combined) continue;
      for (const m of batch.meshes) {
        this.level.remove(m);
        m.geometry.dispose();
        if (m.material !== batch.material) (m.material as T.Material).dispose();
      }
      batch.geometries.forEach((g) => g.dispose());
      this.level.add(new T.Mesh(combined, batch.material));
    }
  }
  private decorate(course: Course) {
    const theme = course.theme;
    const add = (
      geo: T.BufferGeometry,
      color: string,
      p: Vec,
      scale: Vec = { x: 1, y: 1, z: 1 },
    ) => {
      const mesh = new T.Mesh(
        geo,
        material(color, { metalness: theme === 3 || theme === 4 ? 0.3 : 0 }),
      );
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.set(scale.x, scale.y, scale.z);
      this.level.add(mesh);
      return mesh;
    };
    for (let i = 0; i < course.route.length; i += 16) {
      const p = course.route[i],
        side = i % 32 === 0 ? 1 : -1,
        x = p.x + side * (12 + (i % 9));
      if (theme === 0) {
        add(
          new T.DodecahedronGeometry(1, 0),
          '#e6e2c7',
          { x, y: p.y - 5, z: p.z },
          { x: 7, y: 9, z: 7 },
        );
        add(new T.CylinderGeometry(0.3, 0.5, 7, 7), '#9f7352', { x, y: p.y + 2, z: p.z });
        for (let n = 0; n < 4; n++) {
          const leaf = add(
            new T.SphereGeometry(1, 8, 5),
            '#43a869',
            {
              x: x + Math.sin((n * Math.PI) / 2) * 1.5,
              y: p.y + 5,
              z: p.z + Math.cos((n * Math.PI) / 2) * 1.5,
            },
            { x: 3, y: 0.35, z: 1 },
          );
          leaf.rotation.y = (n * Math.PI) / 2;
        }
      } else if (theme === 1) {
        const rock = add(new T.ConeGeometry(4 + (i % 3), 14, 5), i % 32 ? '#c88042' : '#e1a456', {
          x,
          y: p.y - 3,
          z: p.z,
        });
        rock.rotation.y = i * 0.17;
        if (i % 32 === 0)
          add(new T.TorusGeometry(7, 1.2, 6, 18, Math.PI), '#9b5d38', {
            x: p.x,
            y: p.y + 1,
            z: p.z,
          }).rotation.y = i * 0.04;
      } else if (theme === 2) {
        add(new T.CylinderGeometry(4, 4, 2, 24), '#dca258', { x, y: p.y - 1, z: p.z });
        add(new T.CylinderGeometry(3.8, 3.8, 0.6, 24), '#fff0cd', { x, y: p.y + 0.3, z: p.z });
        add(new T.SphereGeometry(1.2, 12, 8), '#f57497', { x, y: p.y + 1.5, z: p.z });
        const candy = add(new T.TorusGeometry(3, 0.65, 8, 24), i % 32 ? '#c6f496' : '#ff97c7', {
          x,
          y: p.y + 7,
          z: p.z,
        });
        candy.rotation.y = 0.4;
      } else if (theme === 3) {
        const height = 12 + (i % 35);
        add(new T.BoxGeometry(7, height, 7), '#253551', { x, y: p.y + height / 2 - 10, z: p.z });
        for (let j = 0; j < 4; j++)
          add(new T.BoxGeometry(7.1, 0.2, 7.1), j % 2 ? '#fb73c7' : '#49dfe7', {
            x,
            y: p.y - 7 + (j * height) / 4,
            z: p.z,
          });
      } else if (theme === 4) {
        for (let n = 0; n < 3; n++) {
          const crystal = add(new T.ConeGeometry(2, 10 + n * 3, 5), n % 2 ? '#aceefa' : '#bb87e8', {
            x: x + n * 2,
            y: p.y + 2,
            z: p.z + n * 3,
          });
          crystal.rotation.z = side * (0.1 + n * 0.12);
        }
        if (i < course.route.length * 0.55) {
          const arch = add(new T.TorusGeometry(12, 2, 6, 16, Math.PI), '#6a6081', {
            x: p.x,
            y: p.y,
            z: p.z,
          });
          arch.rotation.y = i * 0.07;
        }
      } else {
        add(new T.ConeGeometry(7, 12, 7), '#a97470', { x, y: p.y - 6, z: p.z }).rotation.z =
          Math.PI;
        add(new T.CylinderGeometry(0.7, 1.2, 8, 10), '#fff0d0', { x, y: p.y + 4, z: p.z });
        const rotor = new T.Group();
        rotor.position.set(x, p.y + 8, p.z + 0.9);
        this.level.add(rotor);
        this.rotors.push(rotor);
        for (let n = 0; n < 4; n++) {
          const blade = new T.Mesh(new T.BoxGeometry(0.7, 6, 0.2), material('#eed9b7'));
          blade.position.set(Math.sin((n * Math.PI) / 2) * 2, Math.cos((n * Math.PI) / 2) * 2, 0);
          rotor.add(blade);
          blade.rotation.z = (-n * Math.PI) / 2;
        }
      }
    }
    if (theme === 0) {
      const sea = add(new T.PlaneGeometry(2200, 2200), '#329bc2', { x: 0, y: -18, z: -500 });
      sea.rotation.x = -Math.PI / 2;
      const pad = course.pads.find((p) => p.type === 'jump')!;
      const arch = add(new T.TorusGeometry(7, 1.3, 7, 18, Math.PI), '#ded7b9', {
        x: pad.x,
        y: pad.y ?? 0,
        z: pad.z,
      });
      arch.rotation.y = Math.atan2(-pad.dx, -pad.dz);
    }
    if (theme === 2) {
      add(new T.CylinderGeometry(16, 18, 8, 32), '#daa056', { x: 25, y: 4, z: -290 });
      add(new T.CylinderGeometry(15, 15, 2, 32), '#fff0cb', { x: 25, y: 9, z: -290 });
      add(new T.SphereGeometry(4, 16, 12), '#ed698e', { x: 25, y: 12, z: -290 });
    }
    if (theme === 5) add(new T.SphereGeometry(22, 20, 12), '#ffe1a5', { x: 0, y: 30, z: -1160 });
    const moving = course.platforms.find((p) => p.motion)!;
    const branch = course.branches[0];
    const sign = this.label('動く橋 →', '#fff3d4', '#775d4c');
    sign.position.set(branch[0].x, branch[0].y + 2.6, branch[0].z);
    sign.scale.set(3, 0.75, 1);
    this.level.add(sign);
    const dock = this.label(
      moving.motion?.kind === 'lift'
        ? '高さを見て渡ろう'
        : moving.motion?.kind === 'slide'
          ? '橋の位置を見て渡ろう'
          : 'ゆっくり橋を渡ろう',
      '#fff3d4',
      '#775d4c',
    );
    dock.position.set(moving.x, moving.y + 3, moving.z);
    dock.scale.set(4.5, 1.1, 1);
    this.level.add(dock);
  }
  private label(text: string, background: string, color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = color;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const m = new T.SpriteMaterial({ map: texture });
    m.addEventListener('dispose', () => texture.dispose());
    return new T.Sprite(m);
  }
  private flag(x: number, z: number, text: string, color: string, y = 0) {
    const pole = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 2.1, 8), material('#f7f7e8'));
    pole.position.set(x, y + 1.05, z);
    this.level.add(pole);
    const label = this.label(text, color, '#ffffff');
    label.position.set(x + 0.45, y + 1.85, z);
    label.scale.set(1.5, 0.45, 1);
    this.level.add(label);
  }
  snap(p: Vec) {
    this.follow.set(p.x, p.y, p.z);
    if (this.activeCourse) this.routeCamera.reset(p, this.activeCourse);
    this.actor.position.set(p.x, p.y, p.z);
  }
  effect(type: GameEvent) {
    if (type === 'dash') this.dashShock = 1;
    if (type === 'fall' || type === 'recover') return;
    const count = type === 'goal' ? 50 : 12;
    for (let i = 0; i < count; i++) {
      const mesh = new T.Mesh(this.particleGeometry, this.particleMaterial);
      mesh.position.copy(this.actor.position);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new T.Vector3(Math.sin(i * 2.4) * 2.8, 2 + (i % 5), Math.cos(i * 2.4) * 2.8),
        life: 1.2,
      });
    }
  }
  draw(game: Physics, dt: number, menu: boolean) {
    this.time += dt;
    const p = game.position,
      v = game.ball.linvel();
    const target = new T.Vector3(p.x, Math.max(-0.5, p.y), p.z);
    if (game.round.phase !== 'falling') this.follow.lerp(target, 1 - Math.exp(-dt * 12));
    for (const { platform, group } of this.movers) {
      const pose = platformPose(platform, game.simulationTime);
      group.position.set(pose.position.x, pose.position.y, pose.position.z);
      group.rotation.y = pose.angle;
    }
    for (const rotor of this.rotors) rotor.rotation.z = -game.simulationTime * 0.45;
    this.actor.position.set(p.x, p.y, p.z);
    const ground = game.course.platforms
      .map((s) => surfaceHeight(p, s, game.simulationTime))
      .filter((y): y is number => y !== undefined && y <= p.y)
      .sort((a, b) => b - a)[0];
    this.shadow.position.set(p.x, (ground ?? 0) + 0.065, p.z);
    this.shadow.visible = ground !== undefined && p.y - ground < 5;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - Math.max(0, p.y - 0.52) * 0.12));
    const rotation = game.ball.rotation();
    this.shell.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const speed = Math.hypot(v.x, v.z);
    const dashTarget = game.dashActive && game.round.phase === 'playing' ? 1 : 0;
    this.dashVisual += (dashTarget - this.dashVisual) * (1 - Math.exp(-dt * (dashTarget ? 14 : 8)));
    this.dashShock = Math.max(0, this.dashShock - dt / 0.15);
    this.ballMaterial.emissive.set('#48eaff');
    this.ballMaterial.emissiveIntensity = this.dashVisual * 1.8;
    (this.dashTrail.material as T.MeshBasicMaterial).opacity = this.dashVisual * 0.42;
    this.dashTrail.visible = this.dashVisual > 0.01;
    this.dashTrail.rotation.y = Math.atan2(v.x, v.z);
    for (const child of this.speedLines.children)
      (child as T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>).material.opacity =
        this.dashVisual * 0.6;
    if (speed > 0.25) {
      const desired = new T.Quaternion().setFromEuler(
        new T.Euler(-this.dashVisual * 0.32, Math.atan2(v.x, v.z), 0, 'YXZ'),
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
      this.run.timeScale = speed / 3;
      this.mixer?.update(dt);
    }
    if (this.placeholder)
      this.placeholder.position.y = moving
        ? Math.sin(this.time * Math.max(4, speed * 5)) * Math.min(0.035, speed * 0.01)
        : 0;
    let tartIndex = 0;
    for (const [id, tart] of this.tarts) {
      tart.visible = !game.round.collected.has(id);
      tart.rotation.y = this.time * 0.8;
      tart.position.y =
        tart.userData.floor + 0.85 + Math.sin(this.time * 2 + tart.position.z) * 0.09;
      tart.scale.setScalar(tart.visible ? 1 : 0);
      tart.updateMatrix();
      for (let part = 0; part < 3; part++) {
        tart.children[part].updateMatrix();
        this.tartMatrix.copy(tart.matrix).multiply(tart.children[part].matrix);
        this.tartInstances[part].setMatrixAt(tartIndex, this.tartMatrix);
      }
      tartIndex++;
    }
    for (const instances of this.tartInstances) instances.instanceMatrix.needsUpdate = true;
    this.checkpoints.forEach((m, i) =>
      (m.material as T.MeshStandardMaterial).color.set(
        i <= game.round.checkpoint ? '#71c69d' : '#8eb3da',
      ),
    );
    if (game.round.phase === 'playing') this.routeCamera.update(p, game.course, dt, speed);
    const yaw = this.routeCamera.yaw,
      distance = menu ? 10 : 6 + Math.max(0, Math.min(1.5, (speed - 9) / 4));
    this.camera.position
      .copy(this.follow)
      .add(new T.Vector3(Math.sin(yaw) * distance, menu ? 6 : 3, Math.cos(yaw) * distance));
    if (this.dashShock > 0)
      this.camera.position.add(
        new T.Vector3(Math.sin(this.time * 91), Math.cos(this.time * 77), 0).multiplyScalar(
          this.dashShock * 0.12,
        ),
      );
    this.camera.lookAt(
      this.follow.x - Math.sin(yaw) * 3,
      this.follow.y,
      this.follow.z - Math.cos(yaw) * 3,
    );
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.velocity.y -= dt * 8;
      particle.mesh.scale.setScalar(Math.max(0, particle.life));
      if (particle.life <= 0) this.scene.remove(particle.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    const targetFov = 55 + this.dashVisual * 10;
    this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 12));
    this.camera.updateProjectionMatrix();
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
