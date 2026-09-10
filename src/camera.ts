import type { Course, Vec } from './courses';
import type { InputVector } from './input';
export function screenToWorld(input: InputVector, yaw: number): InputVector {
  return {
    x: input.x * Math.cos(yaw) + input.z * Math.sin(yaw),
    z: -input.x * Math.sin(yaw) + input.z * Math.cos(yaw),
  };
}
export class RouteCamera {
  yaw = 0;
  private index = 0;
  private path = 0;
  reset(p: Vec, course: Course) {
    this.select(p, course, true);
    this.yaw = this.direction(course);
  }
  private select(p: Vec, course: Course, global = false) {
    const paths = [course.route, ...course.branches];
    let best = Infinity,
      selected = this.path,
      index = this.index;
    paths.forEach((path, k) =>
      path.forEach((q, i) => {
        if (i === path.length - 1 || (!global && k === this.path && Math.abs(i - this.index) > 18))
          return;
        const distance = (p.x - q.x) ** 2 + (p.z - q.z) ** 2 + 4 * (p.y - q.y - 0.52) ** 2;
        if (distance < best) {
          best = distance;
          selected = k;
          index = i;
        }
      }),
    );
    this.path = selected;
    this.index = index;
  }
  private direction(course: Course) {
    const route = [course.route, ...course.branches][this.path];
    const a = route[this.index],
      b = route[Math.min(route.length - 1, this.index + 3)];
    return Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }
  update(p: Vec, course: Course, dt: number, speed: number) {
    if (speed < 0.3) return;
    this.select(p, course);
    const target = this.direction(course),
      delta = Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw));
    this.yaw += Math.max(-dt * 0.8, Math.min(dt * 0.8, delta * (1 - Math.exp(-dt * 3))));
  }
}
