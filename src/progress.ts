import type { Course, Vec } from './courses';

// 本道のどこまで進んだかを0〜1で返す。HUDの進行バーに使う。
// 上下に重なる道を取り違えないよう、高さの差を重く見る。
export class RouteProgress {
  private cumulative: number[] = [0];
  private index = 0;
  constructor(private course: Course) {
    const route = course.route;
    for (let i = 1; i < route.length; i++)
      this.cumulative.push(
        this.cumulative[i - 1] +
          Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z),
      );
  }
  private get length() {
    return this.cumulative.at(-1) || 1;
  }
  private nearest(p: Vec, from: number, to: number) {
    const route = this.course.route;
    let best = Infinity,
      index = this.index;
    for (let i = Math.max(0, from); i <= Math.min(route.length - 1, to); i++) {
      const q = route[i],
        d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2 + 4 * (p.y - q.y - 0.52) ** 2;
      if (d < best) {
        best = d;
        index = i;
      }
    }
    return { index, distance: Math.sqrt(best) };
  }
  reset(p: Vec) {
    this.index = this.nearest(p, 0, this.course.route.length - 1).index;
  }
  update(p: Vec) {
    const local = this.nearest(p, this.index - 12, this.index + 24);
    // 分岐や復帰で大きく離れたときだけ全体から探し直す。
    this.index = local.distance < 14 ? local.index : this.nearest(p, 0, Infinity).index;
    return this.ratio;
  }
  get ratio() {
    return this.cumulative[this.index] / this.length;
  }
  /** 各チェックポイントのコース上の位置（0〜1）。 */
  checkpoints() {
    return this.course.checkpoints.map(
      (cp) =>
        this.cumulative[this.nearest({ ...cp, y: cp.y + 0.52 }, 0, Infinity).index] / this.length,
    );
  }
}
