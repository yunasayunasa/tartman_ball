import type { RecordValue } from './round';
export type BgmChoice = 'random' | 'prepare' | 'main-theme' | 'cafe' | 'ronpa' | 'battle' | 'enzan';
export type Settings = {
  mode: 'tilt' | 'stick';
  sensitivity: number;
  muted: boolean;
  bgm: BgmChoice;
  bgmVolume: number;
};
export class Save {
  records: Record<string, RecordValue> = {};
  settings: Settings = {
    mode: 'tilt',
    sensitivity: 1,
    muted: false,
    bgm: 'random',
    bgmVolume: 0.55,
  };
  available = true;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const current = storage.getItem('sky-tart-roll.v2');
      const data = JSON.parse(current || storage.getItem('sky-tart-roll.v1') || 'null');
      if (data?.version !== 1 && data?.version !== 2) return;
      for (const [id, value] of Object.entries(data.version === 2 ? (data.records ?? {}) : {})) {
        const v = value as RecordValue;
        if (
          /^course-[1-6]$/.test(id) &&
          v &&
          Number.isFinite(v.time) &&
          v.time >= 0 &&
          Number.isInteger(v.tarts) &&
          v.tarts >= 0
        )
          this.records[id] = v;
      }
      if (['stick', 'tilt'].includes(data.settings?.mode)) this.settings.mode = data.settings.mode;
      if (Number.isFinite(data.settings?.sensitivity))
        this.settings.sensitivity = Math.min(1.8, Math.max(0.5, data.settings.sensitivity));
      if (typeof data.settings?.muted === 'boolean') this.settings.muted = data.settings.muted;
      if (
        ['random', 'prepare', 'main-theme', 'cafe', 'ronpa', 'battle', 'enzan'].includes(
          data.settings?.bgm,
        )
      )
        this.settings.bgm = data.settings.bgm;
      if (Number.isFinite(data.settings?.bgmVolume))
        this.settings.bgmVolume = Math.min(1, Math.max(0, data.settings.bgmVolume));
    } catch {
      this.available = false;
    }
  }
  write() {
    try {
      this.storage.setItem(
        'sky-tart-roll.v2',
        JSON.stringify({ version: 2, records: this.records, settings: this.settings }),
      );
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }
}
