import * as T from 'three';
import type { Pad, Vec } from './courses';

const additive = (color: string, opacity = 0) =>
  new T.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
  });

/** Reusable world-space trail and screen-space streaks. No postprocessing or per-frame textures. */
export class DashEffects {
  intensity = 0;
  shock = 0;
  private time = 0;
  private screen = new T.Group();
  private streaks: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>[] = [];
  private history: T.Vector3[] = [];
  private trailGeometry = new T.BufferGeometry();
  private trailPositions = new Float32Array(32 * 6 * 3);
  private trailColors = new Float32Array(32 * 6 * 3);
  private trail: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private rings: { mesh: T.Mesh<T.TorusGeometry, T.MeshBasicMaterial>; age: number }[] = [];
  private panels: {
    pad: Pad;
    arrows: T.Mesh<T.ShapeGeometry, T.MeshBasicMaterial>[];
    face: T.MeshStandardMaterial;
    flash: number;
  }[] = [];
  constructor(
    private scene: T.Scene,
    private camera: T.PerspectiveCamera,
  ) {
    this.trailGeometry.setAttribute(
      'position',
      new T.BufferAttribute(this.trailPositions, 3).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setAttribute(
      'color',
      new T.BufferAttribute(this.trailColors, 3).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setDrawRange(0, 0);
    const material = additive('#ffffff');
    material.vertexColors = true;
    this.trail = new T.Mesh(this.trailGeometry, material);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 2;
    scene.add(this.trail);
    camera.add(this.screen);
    for (let i = 0; i < 28; i++) {
      const m = additive(i % 3 ? '#d3ffff' : '#53bfff');
      m.depthTest = false;
      const streak = new T.Mesh(new T.PlaneGeometry(1, 1), m);
      streak.renderOrder = 8;
      this.screen.add(streak);
      this.streaks.push(streak);
    }
    for (let i = 0; i < 3; i++) {
      const mesh = new T.Mesh(
        new T.TorusGeometry(0.62, 0.025, 6, 48),
        additive(i % 2 ? '#ffffff' : '#55edff'),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, age: 1 });
    }
  }
  reset() {
    this.panels = [];
    this.history = [];
    this.intensity = this.shock = 0;
    this.trailGeometry.setDrawRange(0, 0);
    for (const ring of this.rings) {
      ring.age = 1;
      ring.mesh.visible = false;
    }
    this.screen.visible = false;
  }
  addPanel(pad: Pad, level: T.Group) {
    const group = new T.Group();
    group.position.set(pad.x, (pad.y ?? 0) + 0.07, pad.z);
    group.rotation.y = Math.atan2(-pad.dx, -pad.dz);
    level.add(group);
    const base = new T.Mesh(
      new T.BoxGeometry(pad.w + 0.2, 0.16, pad.d + 0.25),
      new T.MeshStandardMaterial({ color: '#142d40', metalness: 0.7, roughness: 0.24 }),
    );
    group.add(base);
    const face = new T.MeshStandardMaterial({
      color: '#f1b13b',
      emissive: '#e99d18',
      emissiveIntensity: 0.3,
      metalness: 0.3,
      roughness: 0.35,
    });
    const panel = new T.Mesh(new T.BoxGeometry(pad.w - 0.22, 0.035, pad.d - 0.1), face);
    panel.position.y = 0.1;
    group.add(panel);
    for (const x of [-1, 1]) {
      const rail = new T.Mesh(new T.BoxGeometry(0.08, 0.045, pad.d), additive('#a0ffff', 0.85));
      rail.position.set(x * (pad.w / 2 - 0.08), 0.12, 0);
      group.add(rail);
    }
    const arrows: T.Mesh<T.ShapeGeometry, T.MeshBasicMaterial>[] = [];
    const shape = new T.Shape();
    shape.moveTo(-0.85, -0.27);
    shape.lineTo(0, 0.27);
    shape.lineTo(0.85, -0.27);
    shape.lineTo(0.85, -0.02);
    shape.lineTo(0, 0.52);
    shape.lineTo(-0.85, -0.02);
    shape.closePath();
    for (let i = 0; i < 3; i++) {
      const arrow = new T.Mesh(new T.ShapeGeometry(shape), additive('#ffffff', 0.9));
      arrow.rotation.x = -Math.PI / 2;
      arrow.scale.set(pad.w / 2.7, 0.65, 1);
      arrow.position.y = 0.14;
      group.add(arrow);
      arrows.push(arrow);
    }
    this.panels.push({ pad, arrows, face, flash: 0 });
  }
  fire(position: Vec, velocity: Vec, padId: string) {
    this.shock = 1;
    const panel = this.panels.find((p) => p.pad.id === padId);
    if (panel) panel.flash = 1;
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
  }
  update(position: Vec, velocity: Vec, active: boolean, dt: number, running: boolean) {
    this.time += running ? dt : 0;
    const speed = Math.hypot(velocity.x, velocity.z);
    const target = active ? Math.min(1, speed / 22) : 0;
    this.intensity += (target - this.intensity) * (1 - Math.exp(-dt * (active ? 22 : 7)));
    this.shock = Math.max(0, this.shock - dt / 0.18);
    for (const panel of this.panels) {
      panel.flash = Math.max(0, panel.flash - dt * 4);
      panel.face.emissiveIntensity = 0.35 + panel.flash * 2 + Math.sin(this.time * 6) * 0.12;
      panel.arrows.forEach((arrow, i) => {
        const phase = (this.time * 1.8 + i / 3) % 1;
        arrow.position.z = (0.5 - phase) * (panel.pad.d - 0.5);
        arrow.material.opacity = 0.35 + Math.sin(phase * Math.PI) * 0.65;
        arrow.position.y = 0.14 + panel.flash * 0.12;
      });
    }
    this.screen.visible = this.intensity > 0.015;
    const height = Math.tan((this.camera.fov * Math.PI) / 360);
    this.screen.scale.set(height * this.camera.aspect, height, 1);
    for (let i = 0; i < this.streaks.length; i++) {
      const streak = this.streaks[i],
        angle = i * 2.399963;
      const phase = (this.time * (1.7 + speed / 20) + i * 0.137) % 1;
      const radius = 0.66 + phase * 0.85;
      streak.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, -1);
      streak.rotation.z = angle - Math.PI / 2;
      streak.scale.set(0.004 + (i % 3) * 0.003, 0.12 + phase * 0.45, 1);
      streak.material.opacity = this.intensity * Math.sin(phase * Math.PI) * 0.65;
    }
    const head = new T.Vector3(position.x, position.y, position.z);
    if (active && running) {
      if (this.history.length && head.distanceTo(this.history[0]) > 4) this.history = [];
      if (!this.history.length || head.distanceTo(this.history[0]) > 0.08)
        this.history.unshift(head);
      this.history.length = Math.min(this.history.length, 33);
    } else if (!active) this.history.pop();
    let vertex = 0;
    for (let i = 0; i < this.history.length - 1; i++) {
      const a = this.history[i],
        b = this.history[i + 1];
      const side = new T.Vector3()
        .subVectors(a, b)
        .cross(new T.Vector3(0, 1, 0))
        .normalize();
      const length = Math.max(1, this.history.length - 1);
      const wa = 0.34 * (1 - i / length),
        wb = 0.34 * (1 - (i + 1) / length);
      const corners = [
        a.clone().addScaledVector(side, wa),
        a.clone().addScaledVector(side, -wa),
        b.clone().addScaledVector(side, wb),
        b.clone().addScaledVector(side, -wb),
      ];
      for (const index of [0, 1, 2, 2, 1, 3]) {
        corners[index].toArray(this.trailPositions, vertex * 3);
        const fade = Math.pow(1 - i / length, 1.5);
        this.trailColors.set([fade * 0.24, fade * 0.85, fade], vertex * 3);
        vertex++;
      }
    }
    this.trailGeometry.setDrawRange(0, vertex);
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.color.needsUpdate = true;
    this.trail.material.opacity = this.intensity * 0.85;
    for (const ring of this.rings) {
      ring.age += dt;
      ring.mesh.visible = ring.age >= 0 && ring.age < 0.28;
      ring.mesh.scale.setScalar(1 + Math.max(0, ring.age) * 5);
      ring.mesh.material.opacity = Math.max(0, 1 - ring.age / 0.28) * 0.55;
    }
  }
  get diagnostics() {
    return {
      intensity: this.intensity,
      trailVertices: this.trailGeometry.drawRange.count,
      streakPhase: this.time,
      panelCount: this.panels.length,
    };
  }
}
