import type { GameEvent } from './physics';
export class Sounds {
  muted = false;
  private context?: AudioContext;
  private wind?: GainNode;
  private windFilter?: BiquadFilterNode;
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      if (!this.wind) {
        const ctx = this.context;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        this.windFilter = ctx.createBiquadFilter();
        this.windFilter.type = 'bandpass';
        this.windFilter.Q.value = 0.7;
        this.wind = ctx.createGain();
        this.wind.gain.value = 0;
        source.connect(this.windFilter).connect(this.wind).connect(ctx.destination);
        source.start();
      }
    } catch {
      /* 音を使えない端末でもプレイ可能 */
    }
  }
  play(type: GameEvent) {
    const ctx = this.context;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    if (type === 'dash') {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        at = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(95, at);
      osc.frequency.exponentialRampToValueAtTime(850, at + 0.13);
      osc.frequency.exponentialRampToValueAtTime(210, at + 0.38);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.2, at + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.41);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      return;
    }
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
  updateDash(active: boolean, speed: number) {
    const ctx = this.context;
    if (!ctx || !this.wind || !this.windFilter) return;
    const level = active && !this.muted ? Math.min(1, speed / 24) : 0;
    this.wind.gain.setTargetAtTime(level * 0.085, ctx.currentTime, 0.06);
    this.windFilter.frequency.setTargetAtTime(450 + level * 1600, ctx.currentTime, 0.06);
  }
}
