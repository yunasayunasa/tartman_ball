import { Euler, Quaternion, Vector3 } from 'three';
import { tuning } from './config';
export type InputVector = { x: number; z: number };
export function normalize(x: number, z: number): InputVector {
  const length = Math.max(1, Math.hypot(x, z));
  return { x: x / length, z: z / length };
}
export function response(angle: number, sensitivity = 1) {
  const n = Math.min(
    1,
    Math.max(
      0,
      (Math.abs(angle) * sensitivity - tuning.deadZone) / (tuning.fullTilt - tuning.deadZone),
    ),
  );
  return n === 0 ? 0 : Math.sign(angle) * n ** tuning.curve;
}
export function attitude(alpha: number, beta: number, gamma: number) {
  const rad = Math.PI / 180;
  return new Quaternion().setFromEuler(new Euler(beta * rad, gamma * rad, alpha * rad, 'ZXY'));
}
export function relativeInput(
  base: Quaternion,
  current: Quaternion,
  screenAngle: number,
  sensitivity: number,
): InputVector {
  const q = base.clone().invert().multiply(current);
  const normal = new Vector3(0, 0, 1).applyQuaternion(q);
  const right = (Math.atan2(normal.x, normal.z) * 180) / Math.PI;
  const forward = (-Math.atan2(normal.y, normal.z) * 180) / Math.PI;
  const rad = (screenAngle * Math.PI) / 180;
  return normalize(
    response(right * Math.cos(rad) + forward * Math.sin(rad), sensitivity),
    response(forward * Math.cos(rad) - right * Math.sin(rad), sensitivity),
  );
}
type OrientationPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<string>;
};
export class Input {
  mode: 'tilt' | 'stick' = 'tilt';
  sensitivity = 1;
  private current?: Quaternion;
  private baseline?: Quaternion;
  private receivedAt = -Infinity;
  private stick: InputVector = { x: 0, z: 0 };
  private smooth: InputVector = { x: 0, z: 0 };
  private keys = new Set<string>();
  private pointer?: number;
  private knob: HTMLElement;
  constructor(private element: HTMLElement) {
    this.knob = element.querySelector('span')!;
    window.addEventListener('deviceorientation', (e) => {
      if (
        e.beta === null ||
        e.gamma === null ||
        !Number.isFinite(e.beta) ||
        !Number.isFinite(e.gamma)
      )
        return;
      this.current = attitude(Number.isFinite(e.alpha) ? e.alpha! : 0, e.beta, e.gamma);
      this.receivedAt = performance.now();
    });
    element.addEventListener('pointerdown', (e) => {
      if (this.pointer !== undefined) return;
      e.preventDefault();
      this.pointer = e.pointerId;
      element.setPointerCapture(e.pointerId);
      this.move(e);
    });
    element.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer) this.move(e);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      element.addEventListener(name, () => this.clear());
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
    window.addEventListener('keydown', (e) => {
      if (
        /^(Arrow(Up|Down|Left|Right)|[wasd])$/i.test(e.key) &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)
      ) {
        if (e.key.startsWith('Arrow')) e.preventDefault();
        this.keys.add(e.key.toLowerCase());
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }
  private move(e: PointerEvent) {
    const b = this.element.getBoundingClientRect();
    this.stick = normalize(
      (e.clientX - b.left - b.width / 2) / 46,
      (e.clientY - b.top - b.height / 2) / 46,
    );
    this.knob.style.transform = `translate(${this.stick.x * 46}px, ${this.stick.z * 46}px)`;
  }
  clear() {
    this.pointer = undefined;
    this.keys.clear();
    this.stick = { x: 0, z: 0 };
    this.smooth = { x: 0, z: 0 };
    this.knob.style.transform = '';
  }
  async calibrate(): Promise<void> {
    if (!window.isSecureContext)
      throw new Error('傾き操作にはHTTPSが必要です。スティックでも遊べます。');
    const api = window.DeviceOrientationEvent as OrientationPermission | undefined;
    if (!api)
      throw new Error('この端末は傾きセンサーに対応していません。スティックを選んでください。');
    if (api.requestPermission && (await api.requestPermission()) !== 'granted')
      throw new Error(
        '傾きの許可がありません。スティックを選ぶか、ブラウザーの許可設定を確認してください。',
      );
    const began = performance.now();
    while (!this.current || this.receivedAt < began - 200) {
      if (performance.now() - began > 2600)
        throw new Error('傾きの値を受信できません。スティックに切り替えて遊べます。');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.baseline = this.current.clone();
    this.clear();
  }
  get stale() {
    return this.mode === 'tilt' && performance.now() - this.receivedAt > 2000;
  }
  read(dt: number): InputVector {
    let value = this.stick;
    if (this.mode === 'tilt')
      value =
        this.current && this.baseline && !this.stale
          ? relativeInput(
              this.baseline,
              this.current,
              screen.orientation?.angle ??
                (window as Window & { orientation?: number }).orientation ??
                0,
              this.sensitivity,
            )
          : { x: 0, z: 0 };
    const k = this.keys;
    if (k.size)
      value = normalize(
        Number(k.has('arrowright') || k.has('d')) - Number(k.has('arrowleft') || k.has('a')),
        Number(k.has('arrowdown') || k.has('s')) - Number(k.has('arrowup') || k.has('w')),
      );
    const blend = 1 - Math.exp(-dt * 20);
    this.smooth.x += (value.x - this.smooth.x) * blend;
    this.smooth.z += (value.z - this.smooth.z) * blend;
    return this.smooth;
  }
  show(active: boolean) {
    this.element.hidden = !active || this.mode !== 'stick';
  }
}
