import type { GameEvent } from './physics';
import type { BgmChoice } from './storage';

export const bgmTracks = [
  { id: 'prepare', label: 'Prepare', file: 'prepare.mp3' },
  { id: 'main-theme', label: 'Main Theme', file: 'main-theme.mp3' },
  { id: 'cafe', label: 'Cafe', file: 'cafe.mp3' },
  { id: 'ronpa', label: 'Ronpa', file: 'ronpa.mp3' },
  { id: 'battle', label: 'Battle', file: 'battle.mp3' },
  { id: 'enzan', label: 'Enzan', file: 'enzan.mp3' },
] as const;
const bgmOutputScale = 0.5;

export class Sounds {
  muted = false;
  bgmVolume = 0.55;
  private context?: AudioContext;
  private wind?: GainNode;
  private windFilter?: BiquadFilterNode;
  private bgm?: HTMLAudioElement;
  private previewTimer?: number;
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
  configure(muted: boolean, bgmVolume: number) {
    this.muted = muted;
    this.bgmVolume = bgmVolume;
    if (this.bgm) this.bgm.volume = muted ? 0 : bgmVolume * bgmOutputScale;
  }
  startBgm(choice: BgmChoice) {
    const track =
      choice === 'random'
        ? bgmTracks[Math.floor(Math.random() * bgmTracks.length)]
        : bgmTracks.find(({ id }) => id === choice)!;
    this.stopBgm();
    this.bgm = new Audio(`${import.meta.env.BASE_URL}bgm/${track.file}`);
    this.bgm.loop = true;
    this.bgm.preload = 'auto';
    this.bgm.volume = this.muted ? 0 : this.bgmVolume * bgmOutputScale;
    void this.bgm.play().catch(() => {});
  }
  pauseBgm() {
    if (this.previewTimer) window.clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.bgm?.pause();
  }
  resumeBgm() {
    if (this.previewTimer) window.clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    if (this.bgm) void this.bgm.play().catch(() => {});
  }
  previewBgm() {
    this.resumeBgm();
    this.previewTimer = window.setTimeout(() => {
      this.bgm?.pause();
      this.previewTimer = undefined;
    }, 900);
  }
  stopBgm() {
    if (!this.bgm) return;
    if (this.previewTimer) window.clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
    this.bgm.pause();
    this.bgm.removeAttribute('src');
    this.bgm.load();
    this.bgm = undefined;
  }
  get bgmOutputVolume() {
    return this.bgm?.volume ?? 0;
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
