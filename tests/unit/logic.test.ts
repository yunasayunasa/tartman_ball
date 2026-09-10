import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { courses, safeAt } from '../../src/courses';
import { Round, formatTime, improve } from '../../src/round';
import { attitude, normalize, relativeInput, response } from '../../src/input';
import { Save } from '../../src/storage';
import { tuning } from '../../src/config';

describe('入力', () => {
  it('微小揺れを除去し、最大入力と対角線を正規化する', () => {
    expect(response(1)).toBe(0);
    expect(response(23)).toBe(1);
    expect(response(-90)).toBe(-1);
    expect(Math.hypot(...Object.values(normalize(1, 1)))).toBeCloseTo(1);
    expect(response(5)).toBeGreaterThan(0);
    expect(response(5)).toBeLessThan(response(10));
  });
  it('感度は強度を変えるが符号を変えない', () => {
    expect(response(8, 1.8)).toBeGreaterThan(response(8, 0.5));
    expect(response(-8, 1.8)).toBeLessThan(0);
  });
  it.each([0, 40, 85, 100, 165, -165])('自然な持ち方 beta=%i から左右前後に入力できる', (beta) => {
    const base = attitude(20, beta, 0);
    expect(relativeInput(base, base, 0, 1)).toEqual({ x: 0, z: 0 });
    expect(
      relativeInput(
        base,
        base.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.2)),
        0,
        1,
      ).x,
    ).toBeGreaterThan(0);
    expect(relativeInput(base, attitude(20, beta - 10, 0), 0, 1).z).toBeLessThan(0);
  });
  it('画面回転に応じて軸を補正する', () => {
    const result = relativeInput(attitude(0, 0, 0), attitude(0, 0, 15), 90, 1);
    expect(Math.abs(result.x)).toBeLessThan(1e-6);
    expect(result.z).toBeLessThan(0);
  });
  it('角度境界をまたいでも入力が反転しない', () => {
    expect(relativeInput(attitude(0, 179, 0), attitude(0, -179, 0), 0, 1).z).toBeGreaterThan(0);
  });
});
describe('ラウンドと復帰', () => {
  it('一意なタルトだけを一度取得できる', () => {
    const r = new Round(courses[0]);
    r.start(10);
    const id = courses[0].tarts[0].id;
    expect(r.collect(id)).toBe(true);
    expect(r.collect(id)).toBe(false);
    expect(r.collect('unknown')).toBe(false);
    r.recover(14, () => true);
    expect(r.collect(id)).toBe(false);
    expect(r.collected.size).toBe(1);
  });
  it('落下・復帰・中断時間を含み、ゴール後に固定する', () => {
    const r = new Round(courses[0]);
    expect(r.elapsed(90)).toBe(0);
    r.start(100);
    r.phase = 'paused';
    expect(r.elapsed(120)).toBe(20);
    r.phase = 'falling';
    expect(r.elapsed(125)).toBe(25);
    r.phase = 'playing';
    expect(r.finish(130)).toBe(true);
    expect(r.finish(140)).toBe(false);
    expect(r.elapsed(150)).toBe(30);
  });
  it('収集0でもゴールできる', () => {
    const r = new Round(courses[0]);
    r.start(0);
    expect(r.finish(3)).toBe(true);
  });
  it('最新の端ではなく一定時間前の安全地点に戻す', () => {
    const r = new Round(courses[0]);
    r.start(0);
    r.remember({ x: 0, y: 0.52, z: -5 }, 2);
    r.remember({ x: 3.4, y: 0.52, z: -9 }, 4);
    expect(r.recover(4.4, (p) => safeAt(p, courses[0]))).toEqual({ x: 0, y: 0.6, z: -5 });
    expect(r.history).toHaveLength(0);
  });
  it('CP通過後は履歴なしでもスタートに戻らない', () => {
    const r = new Round(courses[0]);
    r.reachCheckpoint(1);
    expect(r.recover(8, () => false)).toEqual({
      ...courses[0].checkpoints[1],
      y: courses[0].checkpoints[1].y + 0.6,
    });
    expect(r.reachCheckpoint(0)).toBe(false);
    expect(r.checkpoint).toBe(1);
  });
  it('CP未通過かつ安全履歴なしの場合のみスタート復帰', () => {
    const r = new Round(courses[0]);
    expect(r.recover(1, () => false)).toEqual(courses[0].start);
  });
  it('短時間の危険復帰が2回続いたらCPへ戻す', () => {
    const r = new Round(courses[0]);
    r.reachCheckpoint(0);
    const remember = (time: number) => r.remember({ x: 12, y: 0.52, z: -65 }, time);
    remember(1);
    r.recover(3, () => true);
    remember(3.1);
    r.recover(5, () => true);
    remember(5.1);
    expect(r.recover(7, () => true)).toEqual({
      ...courses[0].checkpoints[0],
      y: courses[0].checkpoints[0].y + 0.6,
    });
  });
  it('CP更新で古い履歴を消し、履歴容量を制限する', () => {
    const r = new Round(courses[0]);
    for (let i = 0; i < 100; i++) r.remember({ x: 0, y: 0.52, z: -5 }, i);
    expect(r.history).toHaveLength(tuning.historyLimit);
    r.reachCheckpoint(0);
    expect(r.history).toHaveLength(0);
  });
  it('再挑戦はタイム・タルト・CP・履歴を初期化する', () => {
    const first = new Round(courses[0]);
    first.start(1);
    first.collect(courses[0].tarts[0].id);
    first.reachCheckpoint(0);
    const next = new Round(courses[0]);
    expect(next.phase).toBe('ready');
    expect(next.checkpoint).toBe(-1);
    expect(next.collected.size).toBe(0);
    expect(next.history).toHaveLength(0);
    expect(next.elapsed(100)).toBe(0);
  });
  it('足場の端とギミックは安全履歴から除外する', () => {
    expect(safeAt({ x: 0, y: 0.52, z: -5 }, courses[0])).toBe(true);
    expect(safeAt({ x: 3.4, y: 0.52, z: -10 }, courses[0])).toBe(false);
    const pad = courses[2].pads[0];
    expect(safeAt({ ...pad, y: (pad.y ?? 0) + 0.52 }, courses[2])).toBe(false);
  });
});
describe('保存', () => {
  it('タイムとタルトを独立して改善する', () => {
    expect(improve({ time: 40, tarts: 8 }, 35, 4)).toEqual({ time: 35, tarts: 8 });
    expect(improve({ time: 40, tarts: 8 }, 50, 10)).toEqual({ time: 40, tarts: 10 });
  });
  it('保存と復元', () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_: string, v: string) => {
        value = v;
      },
    };
    const save = new Save(storage);
    save.records['course-1'] = { time: 32.5, tarts: 12 };
    save.settings.mode = 'stick';
    expect(save.write()).toBe(true);
    expect(new Save(storage).records['course-1'].time).toBe(32.5);
    expect(new Save(storage).settings.mode).toBe('stick');
  });
  it('破損・保存拒否でも起動できる', () => {
    const broken = new Save({
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(broken.records).toEqual({});
    expect(broken.write()).toBe(false);
  });
  it('不正な値と未知の版を受け入れない', () => {
    const bad = new Save({
      getItem: () =>
        JSON.stringify({
          version: 1,
          records: { 'course-1': { time: -1, tarts: 2 }, 'course-2': { time: 1, tarts: -2 } },
          settings: { sensitivity: 900 },
        }),
      setItem: () => {},
    });
    expect(bad.records).toEqual({});
    expect(bad.settings.sensitivity).toBe(1.8);
  });
  it('タイム表記の桁上がり', () => {
    expect(formatTime(59.999)).toBe('00:59.99');
    expect(formatTime(60)).toBe('01:00.00');
    expect(formatTime(121.05)).toBe('02:01.05');
  });
});
describe('コースデータ', () => {
  it('全6コースにCPと一意IDがあり、全CPは安全', () => {
    expect(courses).toHaveLength(6);
    for (const c of courses) {
      expect(c.checkpoints.length).toBeGreaterThan(0);
      expect(new Set(c.tarts.map((t) => t.id)).size).toBe(c.tarts.length);
      for (const cp of c.checkpoints) expect(safeAt({ ...cp, y: cp.y + 0.52 }, c)).toBe(true);
    }
  });
});
