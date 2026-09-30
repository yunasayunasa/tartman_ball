import * as T from 'three';
import type { Surface } from '../courses';
import type { Palette } from './palette';

// すべて実行時にCanvasで描く。外部画像を読み込まない。
export function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return { canvas: c, g: c.getContext('2d')! };
}
function texture(c: HTMLCanvasElement, repeat = true, color = true) {
  const t = new T.CanvasTexture(c);
  if (color) t.colorSpace = T.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(
  g: CanvasRenderingContext2D,
  rnd: () => number,
  count: number,
  colors: string[],
  size: [number, number],
  alpha = 1,
) {
  g.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    g.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  g.globalAlpha = 1;
}

/** 路面の上面。横＝道の幅方向、縦＝進行方向。1枚で4m四方。 */
export function surfaceTexture(surface: Surface) {
  const { canvas: c, g } = canvas(256, 256),
    rnd = random(surface.length * 977 + surface.charCodeAt(0));
  const fill = (color: string) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
  };
  if (surface === 'grass') {
    fill('#62c65c');
    // 刈り込みの縞（進行方向に沿う）
    for (let x = 0; x < 256; x += 64) {
      g.fillStyle = '#74d465';
      g.fillRect(x, 0, 32, 256);
    }
    speckle(g, rnd, 900, ['#4fae4c', '#86df72', '#3f9a45', '#9fe886'], [1.5, 3.5], 0.55);
    for (let i = 0; i < 40; i++) {
      // 小さな花
      g.fillStyle = ['#ffffff', '#fff27a', '#ffb8d2'][i % 3];
      const x = rnd() * 256,
        y = rnd() * 256;
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  } else if (surface === 'wood') {
    fill('#c38a55');
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = ['#c9905a', '#b87d4b', '#cf9861', '#bd834f'][(y / 32) % 4];
      g.fillRect(0, y, 256, 30);
      g.strokeStyle = '#8a5a35';
      g.globalAlpha = 0.35;
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        const yy = y + 4 + k * 5 + rnd() * 2;
        g.moveTo(0, yy);
        g.bezierCurveTo(80, yy + rnd() * 4 - 2, 170, yy + rnd() * 4 - 2, 256, yy);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#6e4428';
      g.fillRect(0, y + 30, 256, 2);
    }
  } else if (surface === 'sand') {
    fill('#e3b268');
    g.strokeStyle = '#cf9b52';
    g.lineWidth = 2;
    for (let y = 8; y < 256; y += 16) {
      g.globalAlpha = 0.55;
      g.beginPath();
      for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin((x / 256) * Math.PI * 4 + y) * 3);
      g.stroke();
    }
    g.globalAlpha = 1;
    speckle(g, rnd, 700, ['#f1c783', '#c68d4a', '#fff0c8'], [1, 2.2], 0.5);
  } else if (surface === 'cookie') {
    fill('#e9b96c');
    speckle(g, rnd, 260, ['#d59a4c', '#f4cd86'], [4, 10], 0.35);
    g.fillStyle = '#b57838';
    for (let x = 32; x < 256; x += 64)
      for (let y = 32; y < 256; y += 64) {
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? '#7a4a2c' : '#8f5a36';
      g.beginPath();
      g.ellipse(
        rnd() * 256,
        rnd() * 256,
        3 + rnd() * 2.5,
        2.5 + rnd() * 2,
        rnd() * 3,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  } else if (surface === 'candy') {
    fill('#f6a0c8');
    g.fillStyle = '#fff1f7';
    g.globalAlpha = 0.85;
    for (let x = -256; x < 512; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 26, 0);
      g.lineTo(x + 26 + 256, 256);
      g.lineTo(x + 256, 256);
      g.fill();
    }
    g.globalAlpha = 1;
    speckle(g, rnd, 80, ['#ffffff'], [2, 3], 0.6);
  } else if (surface === 'metal' || surface === 'glass') {
    fill(surface === 'metal' ? '#24365a' : '#1b4d63');
    for (let x = 0; x < 256; x += 64)
      for (let y = 0; y < 256; y += 64) {
        const grd = g.createLinearGradient(x, y, x + 64, y + 64);
        grd.addColorStop(0, surface === 'metal' ? '#2f4672' : '#246a82');
        grd.addColorStop(1, surface === 'metal' ? '#1e2d4c' : '#173f52');
        g.fillStyle = grd;
        g.fillRect(x + 2, y + 2, 60, 60);
        g.fillStyle = '#9fb6d6';
        for (const [dx, dy] of [
          [6, 6],
          [56, 6],
          [6, 56],
          [56, 56],
        ])
          g.fillRect(x + dx, y + dy, 2, 2);
      }
  } else if (surface === 'stone') {
    fill('#8f7fbe');
    // 不揃いの石畳
    for (let y = 0; y < 256; y += 42) {
      let x = (y / 42) % 2 ? -30 : 0;
      while (x < 256) {
        const w = 44 + rnd() * 40;
        g.fillStyle = ['#9a8bc9', '#8676b6', '#a395d0', '#7e6fae'][Math.floor(rnd() * 4)];
        g.fillRect(x + 2, y + 2, w - 4, 38);
        g.fillStyle = '#ffffff';
        g.globalAlpha = 0.12;
        g.fillRect(x + 2, y + 2, w - 4, 4);
        g.globalAlpha = 1;
        x += w;
      }
    }
    speckle(g, rnd, 300, ['#6b5d99', '#b8acdf'], [1, 2], 0.4);
  } else if (surface === 'ice') {
    fill('#bfefff');
    const grd = g.createLinearGradient(0, 0, 256, 256);
    grd.addColorStop(0, '#d9f7ff');
    grd.addColorStop(0.5, '#a9e4f8');
    grd.addColorStop(1, '#d4f4ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      g.globalAlpha = 0.7;
      g.beginPath();
      let x = rnd() * 256,
        y = rnd() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += rnd() * 50 - 25;
        y += rnd() * 50 - 25;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 0.25;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) g.fillRect(0, rnd() * 256, 256, 3 + rnd() * 6);
    g.globalAlpha = 1;
  } else {
    // copper
    fill('#cf8457');
    for (let x = 0; x < 256; x += 128)
      for (let y = 0; y < 256; y += 64) {
        g.fillStyle = (x + y) % 128 ? '#d98f60' : '#c47a4f';
        g.fillRect(x + 2, y + 2, 124, 60);
        g.fillStyle = '#8fd3b8';
        g.globalAlpha = 0.18;
        g.fillRect(x + 2 + rnd() * 80, y + 40, 40, 20);
        g.globalAlpha = 1;
        g.fillStyle = '#7d4a2c';
        for (const dx of [8, 118]) g.fillRect(x + dx, y + 30, 3, 3);
      }
  }
  return texture(c);
}

/** ネオンの路面の光る継ぎ目（発光マップ）。 */
export function glowSeams(surface: Surface) {
  const { canvas: c, g } = canvas(256, 256);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = surface === 'glass' ? '#39d8ff' : '#2a6cff';
  g.globalAlpha = surface === 'glass' ? 0.7 : 0.35;
  for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 256);
  for (let y = 0; y < 256; y += 128) g.fillRect(0, y, 256, 2);
  if (surface === 'glass') {
    g.globalAlpha = 0.5;
    g.fillStyle = '#ff5fd0';
    g.fillRect(126, 0, 4, 256);
  }
  return texture(c);
}

/** 道の縁石。横＝縁石の幅、縦＝進行方向（2mで1周期）。 */
export function curbTexture(palette: Palette) {
  const { canvas: c, g } = canvas(64, 128);
  const { base, accent, glow } = palette.curb;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  if (glow) {
    g.fillStyle = accent;
    g.fillRect(10, 0, 44, 128);
    g.fillStyle = '#ffffff';
    g.globalAlpha = 0.8;
    g.fillRect(26, 0, 12, 128);
    g.globalAlpha = 1;
  } else {
    // ブロック状の縁石と、内側の影
    for (let y = 0; y < 128; y += 32) {
      g.fillStyle = y % 64 ? base : accent;
      g.fillRect(0, y + 1, 64, 30);
    }
    const grd = g.createLinearGradient(0, 0, 64, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.18)');
    grd.addColorStop(0.25, 'rgba(0,0,0,0)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 128);
  }
  return texture(c);
}

/** 島の断面の地層。横＝進行方向、縦＝深さ。 */
export function strataTexture(palette: Palette, seed: number) {
  const { canvas: c, g } = canvas(128, 128),
    rnd = random(seed);
  const [a, b, d, e] = palette.strata;
  const stops: [number, string][] = [
    [0, a],
    [0.14, a],
    [0.2, b],
    [0.48, d],
    [0.7, b],
    [1, e],
  ];
  const grd = g.createLinearGradient(0, 0, 0, 128);
  for (const [t, color] of stops) grd.addColorStop(t, color);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // 上端の草や砂糖衣のふち（波形）
  g.fillStyle = a;
  g.beginPath();
  g.moveTo(0, 0);
  for (let x = 0; x <= 128; x += 8) g.lineTo(x, 18 + Math.sin(x * 0.35) * 4 + rnd() * 4);
  g.lineTo(128, 0);
  g.fill();
  speckle(g, rnd, 220, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.18)'], [2, 5], 0.6);
  return texture(c);
}

/** 柔らかい雲のかたまり（中央が濃く縁がぼける）。 */
export function cloudTexture(seed = 3) {
  const { canvas: c, g } = canvas(256, 128),
    rnd = random(seed);
  for (let i = 0; i < 22; i++) {
    const x = 40 + rnd() * 176,
      y = 52 + rnd() * 36 - Math.abs(x - 128) * 0.12,
      r = 20 + rnd() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return texture(c, false);
}

/** 中心が白く外へ消える丸。光・輝き・土ぼこりに使う。 */
export function glowTexture() {
  const { canvas: c, g } = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}

/** 横方向に端が消える帯。軌跡や光の筋に使う。 */
export function stripTexture() {
  const { canvas: c, g } = canvas(64, 64);
  const across = g.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.65, 'rgba(255,255,255,0.7)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}

/** ビルの窓明かり。 */
export function windowTexture(seed: number) {
  const { canvas: c, g } = canvas(64, 256),
    rnd = random(seed);
  g.fillStyle = '#0d1328';
  g.fillRect(0, 0, 64, 256);
  for (let y = 4; y < 256; y += 10)
    for (let x = 4; x < 64; x += 10) {
      if (rnd() < 0.45) continue;
      g.fillStyle = ['#ffd98a', '#8feaff', '#ff9ad8', '#ffffff'][Math.floor(rnd() * 4)];
      g.globalAlpha = 0.5 + rnd() * 0.5;
      g.fillRect(x, y, 6, 6);
    }
  g.globalAlpha = 1;
  return texture(c);
}

/** 上向きの山形矢印。スクロールさせてジャンプ台やダッシュ板を示す。 */
export function chevronTexture() {
  const { canvas: c, g } = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(10, 44);
  g.lineTo(32, 22);
  g.lineTo(54, 44);
  g.stroke();
  return texture(c);
}

/** ゴールの市松模様。 */
export function checkerTexture() {
  const { canvas: c, g } = canvas(128, 32);
  for (let x = 0; x < 128; x += 16)
    for (let y = 0; y < 32; y += 16) {
      g.fillStyle = (x + y) % 32 ? '#2b2b3a' : '#ffffff';
      g.fillRect(x, y, 16, 16);
    }
  return texture(c);
}

/** 虹の帯（内側から外側へ）。 */
export function rainbowTexture() {
  const { canvas: c, g } = canvas(4, 128);
  const colors = ['#b28cff', '#7cc4ff', '#8ff0a8', '#fff27a', '#ffc27a', '#ff8fa8'];
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  colors.forEach((color, i) => grd.addColorStop(0.1 + (i / (colors.length - 1)) * 0.8, color));
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  return texture(c, false);
}

// 古いSafariには roundRect がないため自前で描く。
function rounded(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** 文字札。角丸の背景に文字を描く。 */
export function labelTexture(text: string, background: string, color: string, width = 512) {
  const { canvas: c, g } = canvas(width, 96);
  g.clearRect(0, 0, width, 96);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  rounded(g, 6, 12, width - 12, 80, 26);
  g.fill();
  g.fillStyle = background;
  rounded(g, 4, 4, width - 8, 80, 26);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = color;
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, width / 2, 46, width - 40);
  return texture(c, false);
}

/** 両端と両脇が消える細長い光（風の筋・画面の速度線）。縦が長さ方向。 */
export function spindleTexture() {
  const { canvas: c, g } = canvas(32, 128);
  const across = g.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, 0, 0, 128);
  along.addColorStop(0, 'rgba(0,0,0,0)');
  along.addColorStop(0.25, 'rgba(0,0,0,1)');
  along.addColorStop(0.6, 'rgba(0,0,0,0.8)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 32, 128);
  g.globalCompositeOperation = 'source-over';
  return texture(c, false);
}

/** 区間の看板: 見出しと一言の2行。 */
export function signTexture(title: string, hint: string) {
  const { canvas: c, g } = canvas(512, 168);
  g.clearRect(0, 0, 512, 168);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  rounded(g, 8, 14, 496, 148, 30);
  g.fill();
  g.fillStyle = '#fff8e6';
  rounded(g, 4, 4, 496, 148, 30);
  g.fill();
  g.fillStyle = '#173949';
  rounded(g, 4, 4, 496, 60, 30);
  g.fill();
  g.fillRect(4, 40, 496, 24);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffe9a8';
  g.font = 'bold 34px sans-serif';
  g.fillText(title, 256, 36, 460);
  g.fillStyle = '#314b5c';
  g.font = 'bold 32px sans-serif';
  g.fillText(hint, 256, 108, 470);
  return texture(c, false);
}
