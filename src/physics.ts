import RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from './config';
import {
  type Course,
  type Vec,
  type Platform,
  platformPose,
  surfaceHeight,
  safeAt,
} from './courses';
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
  simulationTime = 0;
  private moving: { platform: Platform; body: RAPIER.RigidBody }[] = [];
  private floorY = 0;
  constructor(
    public course: Course,
    private event: (type: GameEvent) => void,
  ) {
    this.world = new RAPIER.World({ x: 0, y: tuning.gravity, z: 0 });
    this.world.timestep = tuning.step;
    for (const p of course.platforms) {
      if (p.vertices) {
        const coords = new Float32Array(p.vertices.flatMap((v) => [v.x, v.y, v.z]));
        this.world.createCollider(
          RAPIER.ColliderDesc.trimesh(coords, new Uint32Array([0, 1, 2, 0, 2, 3])).setFriction(
            p.surface === 'ice' ? 0.06 : 0.35,
          ),
        );
        continue;
      }
      const pose = platformPose(p, 0);
      const body = p.motion
        ? this.world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased()
              .setTranslation(pose.position.x, pose.position.y, pose.position.z)
              .setRotation({
                x: 0,
                y: Math.sin(pose.angle / 2),
                z: 0,
                w: Math.cos(pose.angle / 2),
              }),
          )
        : undefined;
      if (body) this.moving.push({ platform: p, body });
      this.world.createCollider(
        (p.shape === 'disc'
          ? RAPIER.ColliderDesc.cylinder(0.5, p.w / 2)
          : p.shape === 'hex'
            ? RAPIER.ColliderDesc.convexHull(
                new Float32Array(
                  Array.from({ length: 12 }, (_, i) => {
                    const a = ((i % 6) * Math.PI) / 3;
                    return [(Math.cos(a) * p.w) / 2, i < 6 ? -0.5 : 0.5, (Math.sin(a) * p.d) / 2];
                  }).flat(),
                ),
              )!
            : RAPIER.ColliderDesc.cuboid(p.w / 2, 0.5, p.d / 2)
        )
          .setTranslation(body ? 0 : p.x, body ? -0.5 : p.y - 0.5, body ? 0 : p.z)
          .setRotation({
            x: 0,
            y: body ? 0 : Math.sin((p.angle ?? 0) / 2),
            z: 0,
            w: body ? 1 : Math.cos((p.angle ?? 0) / 2),
          })
          .setFriction(p.surface === 'ice' ? 0.06 : 0.35)
          .setRestitution(0),
        body,
      );
    }
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
    this.simulationTime += tuning.step;
    for (const { platform, body } of this.moving) {
      const pose = platformPose(platform, this.simulationTime);
      body.setNextKinematicTranslation(pose.position);
      body.setNextKinematicRotation({
        x: 0,
        y: Math.sin(pose.angle / 2),
        z: 0,
        w: Math.cos(pose.angle / 2),
      });
    }
    const before = this.position,
      velocity = this.ball.linvel();
    const support = this.course.platforms.find((p) => {
      const y = surfaceHeight(before, p, this.simulationTime);
      return y !== undefined && Math.abs(before.y - tuning.radius - y) < 0.18;
    });
    this.grounded = !!support;
    if (support) this.floorY = surfaceHeight(before, support, this.simulationTime)!;
    this.ball.setLinearDamping(
      this.grounded ? (support?.surface === 'ice' ? 0.2 : tuning.damping) : tuning.airDamping,
    );
    this.ball.resetForces(true);
    const scale =
      now < this.guardUntil
        ? 0
        : this.ball.mass() * tuning.acceleration * (this.grounded ? 1 : tuning.airControl);
    this.ball.addForce({ x: input.x * scale, y: 0, z: input.z * scale }, true);
    const speed = Math.hypot(velocity.x, velocity.z),
      maxSpeed = now < this.boostUntil ? tuning.dashSpeed : tuning.speed;
    const limitedSpeed =
      now < this.boostUntil ? maxSpeed : Math.max(maxSpeed, speed - 3 * tuning.step);
    if (speed > limitedSpeed)
      this.ball.setLinvel(
        {
          x: (velocity.x / speed) * limitedSpeed,
          y: velocity.y,
          z: (velocity.z / speed) * limitedSpeed,
        },
        true,
      );
    this.world.step();
    const pos = this.position,
      v = this.ball.linvel();
    const contact = new Set<string>();
    for (const pad of this.course.pads) {
      const px = pos.x - pad.x,
        pz = pos.z - pad.z;
      const over =
        Math.abs(px * -pad.dz + pz * pad.dx) <= pad.w / 2 &&
        Math.abs(px * pad.dx + pz * pad.dz) <= pad.d / 2;
      if (over && pos.y >= (pad.y ?? 0) + 0.3 && pos.y < (pad.y ?? 0) + 0.95 && this.grounded) {
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
        Math.abs(pos.y - t.y - 0.8) < 1.1 &&
        r.collect(t.id)
      )
        this.event('tart');
    this.course.checkpoints.forEach((cp, i) => {
      if (
        Math.hypot(pos.x - cp.x, pos.z - cp.z) < 2.6 &&
        Math.abs(pos.y - cp.y - 0.52) < 0.5 &&
        this.grounded &&
        r.reachCheckpoint(i)
      )
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
      pos.y > this.course.goal.y + 0.2 &&
      pos.y < this.course.goal.y + 2 &&
      r.finish(now)
    )
      this.event('goal');
    const lowerFloor = this.course.platforms.some((p) => {
      const h = surfaceHeight(pos, p, this.simulationTime);
      return h !== undefined && h < pos.y && h >= pos.y - 18;
    });
    if (pos.y < this.floorY + tuning.fallY && !lowerFloor && r.phase === 'playing') {
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
    this.floorY = this.course.route.reduce((a, b) =>
      Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b,
    ).y;
  }
  dispose() {
    this.world.free();
  }
}
export async function initPhysics() {
  await RAPIER.init();
}
