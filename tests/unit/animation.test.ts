import { describe, expect, it } from 'vitest';
import { AnimationClip, VectorKeyframeTrack } from 'three';
import { inPlace } from '../../src/view';
describe('GLB走行の実行時複製', () => {
  it('指定rootだけXZを固定し、Y・手足・元クリップを保護する', () => {
    const root = new VectorKeyframeTrack('Root.position', [0, 1], [1, 2, 3, 4, 5, 6]);
    const foot = new VectorKeyframeTrack('Foot.position', [0, 1], [0, 1, 2, 3, 4, 5]);
    const clip = new AnimationClip('Run', 1, [root, foot]);
    const adjusted = inPlace(clip, ['Root']);
    expect([...adjusted.tracks[0].values]).toEqual([1, 2, 3, 1, 5, 3]);
    expect([...adjusted.tracks[1].values]).toEqual([...foot.values]);
    expect([...root.values]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(adjusted).not.toBe(clip);
  });
});
