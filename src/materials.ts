import * as T from 'three';
import { surfaceColors, type Surface } from './courses';
// Small, generated repeat textures: no downloads and no per-frame canvas work.
export function roadMaterial(surface: Surface): T.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = surfaceColors[surface];
  c.fillRect(0, 0, 128, 128);
  c.lineWidth = 2;
  if (surface === 'wood' || surface === 'cookie') {
    c.strokeStyle = surface === 'wood' ? '#936139' : '#cb8d47';
    for (let y = 0; y < 128; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(128, y);
      c.stroke();
    }
    if (surface === 'wood') {
      for (let i = 0; i < 12; i++) {
        c.globalAlpha = 0.18;
        c.beginPath();
        c.moveTo(0, i * 11);
        c.bezierCurveTo(40, i * 11 + 6, 85, i * 11 - 6, 128, i * 11);
        c.stroke();
      }
    } else {
      c.fillStyle = '#bf8446';
      for (let x = 16; x < 128; x += 32)
        for (let y = 16; y < 128; y += 32) {
          c.beginPath();
          c.arc(x, y, 3, 0, Math.PI * 2);
          c.fill();
        }
    }
  } else if (surface === 'metal' || surface === 'glass' || surface === 'copper') {
    c.strokeStyle = surface === 'glass' ? '#b5faff' : '#7f9aab';
    c.strokeRect(2, 2, 124, 124);
    c.fillStyle = '#cfebed';
    for (const x of [8, 120]) for (const y of [8, 120]) c.fillRect(x - 1, y - 1, 2, 2);
    if (surface === 'glass') {
      c.globalAlpha = 0.15;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(42, 0);
      c.lineTo(128, 86);
      c.lineTo(128, 128);
      c.fill();
    }
  } else if (surface === 'candy') {
    c.strokeStyle = '#ffe1ed';
    c.lineWidth = 14;
    c.globalAlpha = 0.35;
    for (let x = -128; x < 256; x += 48) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + 128, 128);
      c.stroke();
    }
  } else {
    c.globalAlpha = surface === 'grass' ? 0.12 : 0.2;
    for (let i = 0; i < 100; i++) {
      c.fillStyle = i % 2 ? '#ffffff' : '#234e69';
      const x = (i * 47) % 128,
        y = (i * 79) % 128;
      c.fillRect(x, y, surface === 'grass' ? 2 : 5, surface === 'grass' ? 4 : 2);
    }
    if (surface === 'ice') {
      c.strokeStyle = '#ffffff';
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(48, 50);
      c.lineTo(38, 83);
      c.lineTo(96, 128);
      c.stroke();
    }
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 4;
  const m = new T.MeshStandardMaterial({
    map,
    roughness: surface === 'ice' || surface === 'glass' ? 0.16 : 0.8,
    metalness: surface === 'metal' || surface === 'copper' ? 0.5 : 0,
    emissive: surface === 'glass' ? '#164249' : '#000000',
    emissiveIntensity: 0.3,
    side: T.DoubleSide,
  });
  m.addEventListener('dispose', () => map.dispose());
  return m;
}
