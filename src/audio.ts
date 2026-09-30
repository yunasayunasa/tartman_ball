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
// 効果音はBGMに埋もれない大きさにする。音量スライダーは全体（master）に掛かる。
const sfxLevel = 0.9;

// 音量はすべて master → (BGM / 効果音) の順に通す。ミュートと音量0では master が0になる。
export class Sounds {
  muted = false;
  bgmVolume = 0.55;
  private context?: AudioContext;
  private master?: GainNode;
  private sfx?: GainNode;
  private noise?: AudioBuffer;
  private wind?: GainNode;
  private windFilter?: BiquadFilterNode;
  private rolling?: GainNode;
  private rollingFilter?: BiquadFilterNode;
  private bgm?: HTMLAudioElement;
  private bgmGain?: GainNode;
  private bgmSource?: MediaElementAudioSourceNode;
  private previewTimer?: number;
  private chain = 0;
  private chainAt = -Infinity;
  unlock() {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
      const ctx = this.context;
      if (!this.master) {
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        this.bgmGain = ctx.createGain();
        this.bgmGain.gain.value = bgmOutputScale;
        this.bgmGain.connect(this.master);
        this.sfx = ctx.createGain();
        this.sfx.gain.value = sfxLevel;
        this.sfx.connect(this.master);
        this.applyBgmVolume();
      }
      if (!this.noise) {
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        // ダッシュの風切り音と、接地中の転がり音。どちらも速度に合わせて音量と明るさを変える。
        const loop = (type: BiquadFilterType, q: number) => {
          const source = ctx.createBufferSource(),
            filter = ctx.createBiquadFilter(),
            gain = ctx.createGain();
          source.buffer = this.noise!;
          source.loop = true;
          filter.type = type;
          filter.Q.value = q;
          gain.gain.value = 0;
          source.connect(filter).connect(gain).connect(this.sfx!);
          source.start();
          return { filter, gain };
        };
        const wind = loop('bandpass', 0.7);
        this.wind = wind.gain;
        this.windFilter = wind.filter;
        const rolling = loop('lowpass', 0.9);
        this.rolling = rolling.gain;
        this.rollingFilter = rolling.filter;
      }
    } catch {
      /* 音を使えない端末でもプレイ可能 */
    }
  }
  configure(muted: boolean, bgmVolume: number) {
    this.muted = muted;
    this.bgmVolume = bgmVolume;
    this.applyBgmVolume();
  }
  private get level() {
    return this.muted ? 0 : this.bgmVolume;
  }
  private applyBgmVolume() {
    if (this.master) this.master.gain.value = this.level;
    if (this.bgm) this.bgm.volume = this.bgmSource ? 1 : this.level * bgmOutputScale;
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
    if (this.context && this.bgmGain) {
      try {
        this.bgmSource = this.context.createMediaElementSource(this.bgm);
        this.bgmSource.connect(this.bgmGain);
      } catch {
        this.bgmSource = undefined;
      }
    }
    this.applyBgmVolume();
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
    this.bgmSource?.disconnect();
    this.bgmSource = undefined;
    this.bgm.removeAttribute('src');
    this.bgm.load();
    this.bgm = undefined;
    if (this.bgmGain && this.context) {
      this.bgmGain.gain.cancelScheduledValues(this.context.currentTime);
      this.bgmGain.gain.value = bgmOutputScale;
    }
  }
  /** ファンファーレの間だけBGMを下げる。 */
  duck(seconds: number) {
    const ctx = this.context,
      gain = this.bgmGain?.gain;
    if (!ctx || !gain) return;
    const at = ctx.currentTime;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(bgmOutputScale * 0.3, at + 0.08);
    gain.setValueAtTime(bgmOutputScale * 0.3, at + seconds);
    gain.linearRampToValueAtTime(bgmOutputScale, at + seconds + 0.8);
  }
  get bgmOutputVolume() {
    if (this.master && this.bgmGain) return this.master.gain.value * this.bgmGain.gain.value;
    return this.bgm?.volume ?? 0;
  }
  private get ready() {
    const ctx = this.context;
    return ctx && this.sfx && this.level > 0 && ctx.state === 'running' ? ctx : undefined;
  }
  private tone(
    ctx: AudioContext,
    at: number,
    frequency: number,
    duration: number,
    peak: number,
    type: OscillatorType = 'sine',
    glide?: number,
  ) {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, at + duration);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain).connect(this.sfx!);
    osc.start(at);
    osc.stop(at + duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  private burst(ctx: AudioContext, at: number, duration: number, frequency: number, peak: number) {
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise!;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.3), at + duration);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    source.connect(filter).connect(gain).connect(this.sfx!);
    source.start(at, Math.random());
    source.stop(at + duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  /** strength: 着地の強さなど、0〜1で音量を変える出来事に使う。 */
  play(type: GameEvent, strength = 1) {
    const ctx = this.ready;
    if (!ctx) return;
    const at = ctx.currentTime;
    const notes = (frequencies: number[], gap: number, duration: number, peak: number) =>
      frequencies.forEach((hz, i) => {
        this.tone(ctx, at + i * gap, hz, duration, peak, 'triangle');
        this.tone(ctx, at + i * gap, hz * 2, duration * 0.7, peak * 0.25);
      });
    switch (type) {
      case 'tart': {
        // 続けて取るほど音が上がる。1秒空くと元に戻る。
        this.chain = at - this.chainAt < 1.1 ? Math.min(this.chain + 1, 14) : 0;
        this.chainAt = at;
        const base =
          880 * 2 ** ([0, 2, 4, 5, 7, 9, 11][this.chain % 7] / 12 + Math.floor(this.chain / 7));
        notes([base, base * 1.5], 0.06, 0.16, 0.2);
        return;
      }
      case 'dash':
        this.tone(ctx, at, 95, 0.4, 0.3, 'triangle');
        this.tone(ctx, at, 190, 0.38, 0.12, 'sawtooth', 1400);
        this.burst(ctx, at, 0.45, 4200, 0.18);
        return;
      case 'jump':
        this.tone(ctx, at, 280, 0.22, 0.26, 'triangle', 920);
        this.tone(ctx, at + 0.03, 560, 0.16, 0.08, 'sine', 1500);
        return;
      case 'land':
        this.tone(ctx, at, 130, 0.18, 0.35 * strength, 'sine', 48);
        this.burst(ctx, at, 0.12, 900, 0.22 * strength);
        return;
      case 'checkpoint':
        notes([784, 988, 1175, 1568], 0.075, 0.32, 0.17);
        return;
      case 'fall':
        this.tone(ctx, at, 720, 0.6, 0.16, 'triangle', 170);
        return;
      case 'recover':
        this.tone(ctx, at, 520, 0.14, 0.14, 'sine', 790);
        this.tone(ctx, at + 0.07, 1040, 0.12, 0.06);
        return;
      case 'goal':
        notes([523, 659, 784, 1047], 0.1, 0.3, 0.2);
        for (const hz of [1047, 1319, 1568]) this.tone(ctx, at + 0.42, hz, 1.2, 0.11, 'triangle');
        this.burst(ctx, at + 0.42, 0.7, 7000, 0.06);
        return;
    }
  }
  /** 全タルト収集の瞬間。 */
  celebrate() {
    const ctx = this.ready;
    if (!ctx) return;
    const at = ctx.currentTime + 0.12;
    [1047, 1319, 1568, 1976, 2093].forEach((hz, i) => {
      this.tone(ctx, at + i * 0.06, hz, 0.4, 0.13, 'triangle');
      this.tone(ctx, at + i * 0.06, hz * 2, 0.25, 0.04);
    });
  }
  updateDash(active: boolean, speed: number) {
    const ctx = this.context;
    if (!ctx || !this.wind || !this.windFilter) return;
    const level = active ? Math.min(1, speed / 24) : 0;
    this.wind.gain.setTargetAtTime(level * 0.1, ctx.currentTime, 0.06);
    this.windFilter.frequency.setTargetAtTime(450 + level * 1600, ctx.currentTime, 0.06);
  }
  /** 接地して転がっている間の小さな摩擦音。速いほど大きく明るい。 */
  updateRolling(grounded: boolean, speed: number, slippery = false) {
    const ctx = this.context;
    if (!ctx || !this.rolling || !this.rollingFilter) return;
    const level = grounded ? Math.min(1, speed / 10) : 0;
    this.rolling.gain.setTargetAtTime(
      level ** 1.3 * (slippery ? 0.05 : 0.1),
      ctx.currentTime,
      grounded ? 0.05 : 0.03,
    );
    this.rollingFilter.frequency.setTargetAtTime(
      (slippery ? 1400 : 160) + level * (slippery ? 2600 : 520),
      ctx.currentTime,
      0.08,
    );
  }
}
