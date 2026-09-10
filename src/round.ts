import { tuning } from './config';
import type { Course, Vec } from './courses';
export type Phase = 'ready' | 'playing' | 'paused' | 'falling' | 'finished';
export class Round {
  phase: Phase = 'ready';
  collected = new Set<string>();
  checkpoint = -1;
  history: { position: Vec; time: number; id: number }[] = [];
  startedAt = 0;
  finishedTime = 0;
  falls = 0;
  private nextId = 0;
  private lastRecovery?: { id: number; time: number };
  constructor(public course: Course) {}
  start(now: number) {
    this.startedAt = now;
    this.phase = 'playing';
  }
  elapsed(now: number) {
    return this.phase === 'ready'
      ? 0
      : this.phase === 'finished'
        ? this.finishedTime
        : Math.max(0, now - this.startedAt);
  }
  collect(id: string) {
    if (
      this.phase !== 'playing' ||
      this.collected.has(id) ||
      !this.course.tarts.some((t) => t.id === id)
    )
      return false;
    this.collected.add(id);
    return true;
  }
  reachCheckpoint(index: number) {
    if (index <= this.checkpoint || !this.course.checkpoints[index]) return false;
    this.checkpoint = index;
    this.history = [];
    this.lastRecovery = undefined;
    return true;
  }
  remember(position: Vec, now: number) {
    if (this.history.length && now - this.history.at(-1)!.time < tuning.historyInterval) return;
    this.history.push({ position: { ...position }, time: now, id: this.nextId++ });
    if (this.history.length > tuning.historyLimit) this.history.shift();
  }
  recover(now: number, valid: (v: Vec) => boolean): Vec {
    this.falls++;
    const prior = this.lastRecovery,
      repeated = prior && now - prior.time < tuning.repeatWindow;
    const candidates = [...this.history]
      .reverse()
      .filter((h) => now - h.time >= tuning.historyAge && valid(h.position));
    const candidate = repeated
      ? (candidates.find((h) => h.id < prior.id) ?? candidates[0])
      : candidates[0];
    if (candidate) {
      this.lastRecovery = { id: candidate.id, time: now };
      return { ...candidate.position, y: candidate.position.y + 0.08 };
    }
    this.history = [];
    this.lastRecovery = undefined;
    const cp = this.course.checkpoints[this.checkpoint];
    return cp ? { ...cp, y: cp.y + 0.6 } : { ...this.course.start };
  }
  finish(now: number) {
    if (this.phase !== 'playing') return false;
    this.finishedTime = this.elapsed(now);
    this.phase = 'finished';
    return true;
  }
}
export type RecordValue = { time: number; tarts: number };
export function improve(previous: RecordValue | undefined, time: number, tarts: number) {
  return {
    time: Math.min(previous?.time ?? Infinity, time),
    tarts: Math.max(previous?.tarts ?? 0, tarts),
  };
}
export function formatTime(seconds: number) {
  const n = Math.max(0, Math.floor(seconds * 100));
  return `${Math.floor(n / 6000)
    .toString()
    .padStart(
      2,
      '0',
    )}:${Math.floor(n / 100) % 60 < 10 ? '0' : ''}${Math.floor(n / 100) % 60}.${(n % 100).toString().padStart(2, '0')}`;
}
