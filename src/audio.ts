import type { GameEvent } from './physics';
export class Sounds {
  muted = false;
  private context?: AudioContext;
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* 音を使えない端末でもプレイ可能 */
    }
  }
  play(type: GameEvent) {
    const ctx = this.context;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const notes: Record<GameEvent, number[]> = {
      tart: [880, 1175],
      dash: [260, 520],
      jump: [440, 880],
      checkpoint: [523, 659, 784],
      fall: [240, 140],
      recover: [392, 523],
      goal: [523, 659, 784, 1047],
    };
    notes[type].forEach((hz, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        at = ctx.currentTime + i * 0.085;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.11, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.2);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
}
