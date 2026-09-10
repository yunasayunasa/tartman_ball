import RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from './config';
import { type Course, type Vec, onPlatform, safeAt } from './courses';
import type { InputVector } from './input';
import { Round } from './round';
export type GameEvent = 'tart' | 'dash' | 'jump' | 'checkpoint' | 'fall' | 'recover' | 'goal';
export class Physics {
  world: RAPIER.World;
  ball: RAPIER.RigidBody;
  round: Round;
  grounded = false;
  private stable = 0;
  private touching = new Set<string>();
  private recoveryAt = 0;
  private guardUntil = 0;
  private boostUntil = 0;
  constructor(
    public course: Course,
    private event: (type: GameEvent) => void,
  ) {
    this.world = new RAPIER.World({ x: 0, y: tuning.gravity, z: 0 });
    this.world.timestep = tuning.step;
    for (const p of course.platforms)
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, 0.5, p.d / 2)
          .setTranslation(p.x, p.y - 0.5, p.z)
          .setRotation({
            x: 0,
            y: Math.sin((p.angle ?? 0) / 2),
            z: 0,
            w: Math.cos((p.angle ?? 0) / 2),
          })
          .setFriction(0.35)
          .setRestitution(0),
      );
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(course.start.x, course.start.y, course.start.z)
        .setLinearDamping(tuning.damping)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(tuning.radius).setDensity(1).setFriction(0.35).setRestitution(0.02),
      this.ball,
    );
    this.round = new Round(course);
  }
  get position(): Vec {
    return this.ball.translation();
  }
  step(input: InputVector, now: number) {
    const r = this.round;
    if (r.phase === 'falling') {
      if (now >= this.recoveryAt) {
        this.teleport(r.recover(now, (p) => safeAt(p, this.course)));
        this.guardUntil = now + tuning.recoveryGuard;
        r.phase = 'playing';
        this.event('recover');
      }
      return;
    }
    if (r.phase !== 'playing') return;
    const before = this.position,
      velocity = this.ball.linvel();
    this.grounded =
      this.course.platforms.some(
        (p) => onPlatform(before, p, -0.12) && Math.abs(before.y - tuning.radius - p.y) < 0.1,
      ) && Math.abs(velocity.y) < 0.8;
    this.ball.setLinearDamping(this.grounded ? tuning.damping : tuning.airDamping);
    this.ball.resetForces(true);
    const scale =
      now < this.guardUntil
        ? 0
        : this.ball.mass() * tuning.acceleration * (this.grounded ? 1 : tuning.airControl);
    this.ball.addForce({ x: input.x * scale, y: 0, z: input.z * scale }, true);
    const speed = Math.hypot(velocity.x, velocity.z),
      maxSpeed = now < this.boostUntil ? tuning.dashSpeed : tuning.speed;
    if (speed > maxSpeed)
      this.ball.setLinvel(
        { x: (velocity.x / speed) * maxSpeed, y: velocity.y, z: (velocity.z / speed) * maxSpeed },
        true,
      );
    this.world.step();
    const pos = this.position,
      v = this.ball.linvel();
    const contact = new Set<string>();
    for (const pad of this.course.pads) {
      const over = Math.abs(pos.x - pad.x) <= pad.w / 2 && Math.abs(pos.z - pad.z) <= pad.d / 2;
      if (over && pos.y >= 0.35 && pos.y < 0.85 && v.y < 0.8) {
        contact.add(pad.id);
        if (!this.touching.has(pad.id) && now >= this.guardUntil) {
          if (pad.type === 'dash') {
            this.ball.setLinvel(
              { x: pad.dx * tuning.dashSpeed, y: v.y, z: pad.dz * tuning.dashSpeed },
              true,
            );
            this.boostUntil = now + 2;
          } else this.ball.setLinvel({ x: v.x, y: tuning.jumpSpeed, z: v.z }, true);
          this.event(pad.type);
        }
      }
      // 発射後も平面上から離れるまでは踏み直しにしない。
      if (over && this.touching.has(pad.id)) contact.add(pad.id);
    }
    this.touching = contact;
    for (const t of this.course.tarts)
      if (
        Math.hypot(pos.x - t.x, pos.z - t.z) < 1 &&
        Math.abs(pos.y - 0.8) < 1.1 &&
        r.collect(t.id)
      )
        this.event('tart');
    this.course.checkpoints.forEach((cp, i) => {
      if (Math.hypot(pos.x - cp.x, pos.z - cp.z) < 2.6 && this.grounded && r.reachCheckpoint(i))
        this.event('checkpoint');
    });
    if (
      this.grounded &&
      safeAt(pos, this.course) &&
      now >= this.guardUntil &&
      Math.hypot(v.x, v.z) < 9.2
    ) {
      this.stable += tuning.step;
      if (this.stable >= tuning.stableTime) r.remember(pos, now);
    } else this.stable = 0;
    if (
      Math.hypot(pos.x - this.course.goal.x, pos.z - this.course.goal.z) < 2.2 &&
      pos.y > 0.2 &&
      pos.y < 2 &&
      r.finish(now)
    )
      this.event('goal');
    if (pos.y < tuning.fallY && r.phase === 'playing') {
      r.phase = 'falling';
      this.recoveryAt = now + tuning.recoveryDelay;
      this.event('fall');
    }
  }
  teleport(p: Vec) {
    this.ball.setTranslation(p, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.resetForces(true);
    this.touching.clear();
    this.stable = 0;
    this.boostUntil = 0;
    this.grounded = false;
  }
  dispose() {
    this.world.free();
  }
}
export async function initPhysics() {
  await RAPIER.init();
}
