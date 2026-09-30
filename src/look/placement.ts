import type { Course, Vec } from '../courses';

// 装飾を置くときに、道（本道と分岐）からの水平距離を素早く調べる。
export class Clearance {
  private cells = new Map<string, Vec[]>();
  readonly min: Vec;
  readonly max: Vec;
  constructor(
    course: Course,
    private size = 16,
  ) {
    const points = [...course.route, ...course.branches.flat(), ...course.platforms];
    this.min = { x: Infinity, y: Infinity, z: Infinity };
    this.max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) {
      for (const k of ['x', 'y', 'z'] as const) {
        this.min[k] = Math.min(this.min[k], p[k]);
        this.max[k] = Math.max(this.max[k], p[k]);
      }
      const key = this.key(p.x, p.z);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key)!.push(p);
    }
  }
  private key(x: number, z: number) {
    return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
  }
  /** 半径 reach 以内で最も近い道の点（水平距離）。なければ undefined。 */
  nearest(x: number, z: number, reach = 48) {
    let best: { distance: number; point: Vec } | undefined;
    const r = Math.ceil(reach / this.size);
    const cx = Math.floor(x / this.size),
      cz = Math.floor(z / this.size);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        for (const p of this.cells.get(`${cx + i},${cz + j}`) ?? []) {
          const distance = Math.hypot(p.x - x, p.z - z);
          if (distance <= reach && (!best || distance < best.distance))
            best = { distance, point: p };
        }
    return best;
  }
  /** 道から水平に clear 以上離れているか。 */
  clear(x: number, z: number, clear: number) {
    return !this.nearest(x, z, clear);
  }
  get center(): Vec {
    return {
      x: (this.min.x + this.max.x) / 2,
      y: (this.min.y + this.max.y) / 2,
      z: (this.min.z + this.max.z) / 2,
    };
  }
}
