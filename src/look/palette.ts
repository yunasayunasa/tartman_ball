// コースごとの配色。空・霧・光・路面の縁・島の断面・漂う粒子をまとめて決める。
export type Particle = 'pollen' | 'sand' | 'sprinkle' | 'data' | 'snow' | 'petal';
export type Palette = {
  /** 空の上端・中ほど・地平線・地平線より下（雲海の照り返し） */
  sky: [string, string, string, string];
  sun: { color: string; direction: [number, number, number]; size: number; glow: number };
  stars: number;
  fog: { color: string; near: number; far: number };
  light: { sky: string; ground: string; hemisphere: number; sun: string; intensity: number };
  exposure: number;
  cloud: { color: string; shade: string; opacity: number; sea: boolean };
  /** 島の断面の地層（上から下） */
  strata: [string, string, string, string];
  underside: string;
  curb: { base: string; accent: string; glow?: string };
  rail: string;
  particles: { kind: Particle; colors: string[] };
};

export const palettes: Palette[] = [
  {
    // エメラルド海岸: 高い青空、白い雲、海
    sky: ['#1f72cc', '#4aa8e8', '#9fd8f5', '#d2efff'],
    sun: { color: '#fff4d6', direction: [-0.35, 0.72, -0.6], size: 0.9994, glow: 0.35 },
    stars: 0,
    fog: { color: '#b3def5', near: 75, far: 190 },
    light: { sky: '#fffaf0', ground: '#6f9fb2', hemisphere: 2.6, sun: '#fff1d2', intensity: 2.6 },
    exposure: 1,
    cloud: { color: '#ffffff', shade: '#c9e3f2', opacity: 0.95, sea: false },
    strata: ['#5dbb58', '#9a6b43', '#7a5638', '#5d4a44'],
    underside: '#51413c',
    curb: { base: '#f4efe0', accent: '#d9cfb4' },
    rail: '#f4efe0',
    particles: { kind: 'pollen', colors: ['#ffffff', '#fff7c9'] },
  },
  {
    // 琥珀砂漠: 暖かい霞、大きな太陽
    sky: ['#b8522a', '#e0874a', '#f6c283', '#ffe2b8'],
    sun: { color: '#fff0c4', direction: [0.45, 0.35, -0.8], size: 0.999, glow: 0.55 },
    stars: 0,
    fog: { color: '#f0c28a', near: 65, far: 180 },
    light: { sky: '#fff0d8', ground: '#a8744c', hemisphere: 2.4, sun: '#ffd9a3', intensity: 2.8 },
    exposure: 0.95,
    cloud: { color: '#fff3e2', shade: '#f0b98e', opacity: 0.85, sea: true },
    strata: ['#e7b36c', '#c9864a', '#e2a060', '#a8603a'],
    underside: '#7a4830',
    curb: { base: '#b9773f', accent: '#8e5530' },
    rail: '#c98a4e',
    particles: { kind: 'sand', colors: ['#ffe0a8', '#f4c07c'] },
  },
  {
    // お菓子: パステルの空と虹、綿菓子の雲
    sky: ['#9b7fe0', '#e3a9e3', '#ffe3f1', '#fff4fa'],
    sun: { color: '#fffaf0', direction: [0.2, 0.6, -0.78], size: 0.9993, glow: 0.3 },
    stars: 0,
    fog: { color: '#fbdcef', near: 65, far: 180 },
    light: { sky: '#fff8fb', ground: '#c69ac6', hemisphere: 2.7, sun: '#fff4f4', intensity: 2.4 },
    exposure: 1,
    cloud: { color: '#fff5fb', shade: '#f4b9da', opacity: 0.95, sea: true },
    strata: ['#fff5e1', '#f08bb1', '#f7d38b', '#e7a45c'],
    underside: '#b8763f',
    curb: { base: '#ffffff', accent: '#ff8fbd' },
    rail: '#ffffff',
    particles: {
      kind: 'sprinkle',
      colors: ['#ff7eb6', '#7ee0ff', '#ffe16b', '#9dfa9a', '#ffffff'],
    },
  },
  {
    // ネオン急行: 夜空、星、街の灯
    sky: ['#03040f', '#0c1438', '#402a70', '#170f33'],
    sun: { color: '#b8a0ff', direction: [0, 0.18, -1], size: 0.9996, glow: 0.18 },
    stars: 1,
    fog: { color: '#1b1640', near: 55, far: 170 },
    light: { sky: '#8aa2ff', ground: '#2a1b4a', hemisphere: 1.7, sun: '#b8d4ff', intensity: 1.6 },
    exposure: 1.1,
    cloud: { color: '#3a2e6e', shade: '#1a1440', opacity: 0.7, sea: true },
    strata: ['#26345a', '#1a2440', '#141b30', '#0e1322'],
    underside: '#0b0f1c',
    curb: { base: '#10233a', accent: '#49e8ff', glow: '#49e8ff' },
    rail: '#ff5fc8',
    particles: { kind: 'data', colors: ['#49e8ff', '#ff6fd0'] },
  },
  {
    // 水晶の渓谷: 薄明の紫、オーロラ
    sky: ['#1b1740', '#4b3f86', '#b6a4ea', '#d9ccff'],
    sun: { color: '#e9e0ff', direction: [-0.5, 0.25, -0.83], size: 0.9995, glow: 0.3 },
    stars: 0.5,
    fog: { color: '#a998d8', near: 60, far: 175 },
    light: { sky: '#e6ddff', ground: '#4b3d72', hemisphere: 2.2, sun: '#d8e8ff', intensity: 2.2 },
    exposure: 1,
    cloud: { color: '#e5dcff', shade: '#9d8fd0', opacity: 0.85, sea: true },
    strata: ['#9a8ccc', '#5f5392', '#433a6e', '#2e284d'],
    underside: '#241f3d',
    curb: { base: '#dcd3ff', accent: '#8fe8ff', glow: '#a9f0ff' },
    rail: '#bfe9ff',
    particles: { kind: 'snow', colors: ['#ffffff', '#d7f2ff'] },
  },
  {
    // 夕焼けの風車群島: 低い太陽、橙に染まる雲
    sky: ['#4a3894', '#e0668a', '#ffa878', '#ffd6ae'],
    sun: { color: '#fff0c8', direction: [0.1, 0.12, -1], size: 0.9985, glow: 0.7 },
    stars: 0.15,
    fog: { color: '#f4a98a', near: 70, far: 185 },
    light: { sky: '#ffe2c8', ground: '#8a5c6e', hemisphere: 2.2, sun: '#ffc48f', intensity: 2.6 },
    exposure: 1,
    cloud: { color: '#ffe6cf', shade: '#e98a7e', opacity: 0.92, sea: true },
    strata: ['#77c26a', '#a8704c', '#8c5a44', '#6a4540'],
    underside: '#523a3c',
    curb: { base: '#f3d7ae', accent: '#c48a58' },
    rail: '#f3d7ae',
    particles: { kind: 'petal', colors: ['#ffc2d6', '#ffffff', '#ffe08a'] },
  },
];
