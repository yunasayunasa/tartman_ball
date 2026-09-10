import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { characterConfig, tuning } from './config';
import { onPlatform, type Course, type Vec } from './courses';
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
  private actor = new T.Group();
  private shell = new T.Group();
  private character = new T.Group();
  private tarts = new Map<string, T.Group>();
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
    const ball = new T.Mesh(
      new T.SphereGeometry(tuning.radius, 32, 24),
      material('#b9f4ff', {
        transparent: true,
        opacity: 0.18,
        roughness: 0.12,
        metalness: 0.25,
        depthWrite: false,
      }),
    );
    ball.renderOrder = 3;
    this.shell.add(ball);
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
        z = 15 - i * 4.5;
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
    this.disposeGroup(this.level);
    this.tarts.clear();
    this.checkpoints = [];
    this.particles.forEach((p) => this.scene.remove(p.mesh));
    this.particles = [];
    const floor = material('#fff3d4'),
      side = material(course.color),
      cliff = material('#84aab3');
    for (const p of course.platforms) {
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
    for (const pad of course.pads) {
      const mesh = new T.Mesh(
        new T.BoxGeometry(pad.w, 0.055, pad.d),
        material(pad.type === 'dash' ? '#f6be50' : '#ec8ea4', {
          emissive: pad.type === 'dash' ? '#d49013' : '#bc436e',
          emissiveIntensity: 0.18,
        }),
      );
      mesh.position.set(pad.x, 0.075, pad.z);
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
      indicator.position.set(pad.x, 0.111, pad.z);
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
      group.position.set(t.x, 0.85, t.z);
      this.level.add(group);
      this.tarts.set(t.id, group);
    }
    course.checkpoints.forEach((cp, i) => {
      const ring = new T.Mesh(new T.TorusGeometry(2.1, 0.1, 6, 40), material('#8eb3da'));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cp.x, 0.09, cp.z);
      this.level.add(ring);
      this.checkpoints.push(ring);
      this.flag(cp.x - 2.8, cp.z, `${i + 1}`, '#8eb3da');
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
    goal.position.set(course.goal.x, 0, course.goal.z);
    this.level.add(goal);
    this.flag(course.start.x - 2.8, course.start.z, 'START', course.color);
    this.snap(course.start);
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
  private flag(x: number, z: number, text: string, color: string) {
    const pole = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 2.1, 8), material('#f7f7e8'));
    pole.position.set(x, 1.05, z);
    this.level.add(pole);
    const label = this.label(text, color, '#ffffff');
    label.position.set(x + 0.45, 1.85, z);
    label.scale.set(1.5, 0.45, 1);
    this.level.add(label);
  }
  snap(p: Vec) {
    this.follow.set(p.x, 0.52, p.z);
    this.actor.position.set(p.x, p.y, p.z);
  }
  effect(type: GameEvent) {
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
    this.follow.lerp(target, 1 - Math.exp(-dt * 6));
    this.actor.position.set(p.x, p.y, p.z);
    this.shadow.position.set(p.x, 0.065, p.z);
    this.shadow.visible = p.y > 0 && p.y < 5 && game.course.platforms.some((s) => onPlatform(p, s));
    this.shadow.scale.setScalar(Math.max(0.4, 1 - Math.max(0, p.y - 0.52) * 0.12));
    const rotation = game.ball.rotation();
    this.shell.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    const speed = Math.hypot(v.x, v.z);
    if (speed > 0.25) {
      const desired = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 1, 0),
        Math.atan2(v.x, v.z),
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
    for (const [id, tart] of this.tarts) {
      tart.visible = !game.round.collected.has(id);
      tart.rotation.y = this.time * 0.8;
      tart.position.y = 0.85 + Math.sin(this.time * 2 + tart.position.z) * 0.09;
    }
    this.checkpoints.forEach((m, i) =>
      (m.material as T.MeshStandardMaterial).color.set(
        i <= game.round.checkpoint ? '#71c69d' : '#8eb3da',
      ),
    );
    this.camera.position
      .copy(this.follow)
      .add(new T.Vector3(menu ? 11 : 0, menu ? 20 : 15, menu ? 19 : 17));
    this.camera.lookAt(this.follow.x, 0, this.follow.z - (menu ? 7 : 8));
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.velocity.y -= dt * 8;
      particle.mesh.scale.setScalar(Math.max(0, particle.life));
      if (particle.life <= 0) this.scene.remove(particle.mesh);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.renderer.render(this.scene, this.camera);
  }
  resize() {
    const w = innerWidth,
      h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.65 ? 59 : 54;
    this.camera.updateProjectionMatrix();
  }
}
