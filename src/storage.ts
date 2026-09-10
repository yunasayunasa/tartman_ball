import type { RecordValue } from './round';
export type Settings = { mode: 'tilt' | 'stick'; sensitivity: number; muted: boolean };
export class Save {
  records: Record<string, RecordValue> = {};
  settings: Settings = { mode: 'tilt', sensitivity: 1, muted: false };
  available = true;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const current = storage.getItem('sky-tart-roll.v2');
      const data = JSON.parse(current || storage.getItem('sky-tart-roll.v1') || 'null');
      if (data?.version !== 1 && data?.version !== 2) return;
      for (const [id, value] of Object.entries(data.version === 2 ? (data.records ?? {}) : {})) {
        const v = value as RecordValue;
        if (
          /^course-[1-5]$/.test(id) &&
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
