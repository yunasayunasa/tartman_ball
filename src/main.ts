import './style.css';
import { courses } from './courses';
import { Input } from './input';
import { initPhysics, Physics, type GameEvent } from './physics';
import { formatTime, improve, type Phase } from './round';
import { Save } from './storage';
import { Sounds } from './audio';
import { View } from './view';
import { tuning, characterConfig } from './config';

const ui = document.querySelector<HTMLElement>('#ui')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const toastElement = document.querySelector<HTMLElement>('#toast')!;
const input = new Input(document.querySelector<HTMLElement>('#joystick')!);
const sound = new Sounds();
const save = new Save({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});
const now = () => Date.now() / 1000;
let view: View, game: Physics;
let selected = 0,
  screenState: 'menu' | 'ready' | 'play' | 'pause' | 'result' = 'menu';
let beforePause: Phase = 'playing',
  accumulator = 0,
  previousFrame = 0;
let toastUntil = 0,
  hudTime: HTMLElement | null = null,
  hudTarts: HTMLElement | null = null;
let resultTimeBest = false,
  resultTartBest = false;
let pageVersion = 0;
function syncSettings() {
  input.mode = save.settings.mode;
  input.sensitivity = save.settings.sensitivity;
  sound.muted = save.settings.muted;
}
syncSettings();
function persist() {
  if (!save.write()) toast('記録を保存できません。この画面では引き続き遊べます。', 5);
}
function toast(message: string, duration = 2.2) {
  toastElement.textContent = message;
  toastUntil = performance.now() + duration * 1000;
  toastElement.classList.add('visible');
}
function bind(id: string, handler: () => void) {
  document.getElementById(id)?.addEventListener('click', handler);
}
function page(content: string, className = '') {
  pageVersion++;
  input.show(false);
  input.clear();
  hudTime = null;
  hudTarts = null;
  ui.innerHTML = `<section class="panel ${className}">${content}</section>`;
}
function replaceGame(index: number) {
  game?.dispose();
  selected = index;
  accumulator = 0;
  game = new Physics(courses[index], event);
  view.build(courses[index]);
}
function menu() {
  screenState = 'menu';
  replaceGame(0);
  page(
    `<header class="brand"><div class="brand-mark" aria-hidden="true">◒</div><div><span class="eyebrow">A LITTLE JOURNEY ABOVE THE CLOUDS</span><h1>Sky Tart Roll</h1></div></header>
    <p class="intro">空を渡って、タルトを集めよう。<br>スマホの傾きで出かける、小さな空の旅。</p>
    <div class="section-label"><span>CHOOSE YOUR SKY</span><span>5つのコース、どこからでも。</span></div>
    <div class="course-list">${courses
      .map((c, i) => {
        const record = save.records[c.id];
        return `<button class="course" id="course-${i}" style="--accent:${c.color}"><span class="course-number">0${i + 1}</span><span class="course-copy"><strong>${c.name}</strong><small>${c.difficulty} · ${c.subtitle}</small><span class="record"><span>TIME ${record ? formatTime(record.time) : '未記録'}</span><span>TART ${record ? record.tarts + '/' + c.tarts.length : '未記録'}${record?.tarts === c.tarts.length ? ' ✦' : ''}</span></span></span><span class="chevron">›</span></button>`;
      })
      .join(
        '',
      )}</div><p class="footer-note">残機なし・制限時間なし。何度でも、風に乗ろう。${!characterConfig.url ? '<br>キャラクター素材待ち · 仮マスコットでプレイできます' : ''}</p>`,
    'menu',
  );
  courses.forEach((_, i) =>
    bind(`course-${i}`, () => {
      replaceGame(i);
      ready();
    }),
  );
  if (!save.available) toast('ブラウザー保存を利用できないため、記録は残らない場合があります。', 5);
}
function modePicker() {
  return `<div class="mode-picker" role="group" aria-label="操作方式"><button id="tilt" class="mode ${input.mode === 'tilt' ? 'selected' : ''}" aria-pressed="${input.mode === 'tilt'}"><b aria-hidden="true">♧</b><small>スマホを傾ける</small></button><button id="stick" class="mode ${input.mode === 'stick' ? 'selected' : ''}" aria-pressed="${input.mode === 'stick'}"><b aria-hidden="true">⊕</b><small>スティック</small></button></div>`;
}
function bindModes(render: () => void) {
  for (const mode of ['tilt', 'stick'] as const)
    bind(mode, () => {
      save.settings.mode = mode;
      syncSettings();
      persist();
      render();
    });
}
function ready() {
  screenState = 'ready';
  const c = courses[selected];
  page(`<span class="eyebrow">AREA 0${selected + 1} / ${c.subtitle}</span><h2>${c.name}</h2><p>${c.description}</p>${modePicker()}
    <div class="tip">${input.mode === 'tilt' ? '楽に持った姿勢で「基準を登録して出発」。\n傾けた方向へ加速。逆に傾けると減速できます。' : '左下のスティックを動かして加速。\n大きく動かすと強く、小さく動かすとゆっくり。'}<br>金色はダッシュ、桃色はジャンプ。どちらも自動です。</div>
    <div id="input-error" role="alert"></div><div class="actions"><button class="button primary" id="start">${input.mode === 'tilt' ? '基準を登録して出発' : '空の旅へ出発'} →</button><button class="text-button" id="back">エリア選択へ戻る</button></div>`);
  bindModes(ready);
  bind('back', menu);
  bind('start', () => {
    void start();
  });
}
async function prepareInput(buttonId: string) {
  const version = pageVersion;
  const button = document.getElementById(buttonId) as HTMLButtonElement;
  button.disabled = true;
  sound.unlock();
  try {
    if (input.mode === 'tilt') await input.calibrate();
    if (version !== pageVersion) return false;
    input.clear();
    return true;
  } catch (error) {
    if (version !== pageVersion) return false;
    const box = document.getElementById('input-error');
    if (box) {
      box.className = 'error';
      box.textContent =
        error instanceof Error
          ? error.message
          : '傾き入力を開始できません。スティックを選んでください。';
    }
    return false;
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}
async function start() {
  const currentGame = game;
  if (!(await prepareInput('start')) || screenState !== 'ready' || currentGame !== game) return;
  game.round.start(now());
  showPlay();
  toast('タルトの道をたどって、ゴールへ。');
}
function showPlay() {
  screenState = 'play';
  accumulator = 0;
  input.clear();
  input.show(true);
  ui.innerHTML = `<div class="hud"><div class="hud-stats"><div><small>TIME</small><strong id="time">00:00.00</strong></div><div><small>TARTS</small><strong id="tarts">0 / ${game.course.tarts.length}</strong></div></div><button id="pause" class="pause" aria-label="中断と設定">Ⅱ</button></div><div class="course-caption"><span>AREA 0${selected + 1}</span>${game.course.name}</div>`;
  hudTime = document.getElementById('time');
  hudTarts = document.getElementById('tarts');
  bind('pause', () => pause());
}
function pause(message = '') {
  if (!['playing', 'falling'].includes(game?.round.phase)) return;
  beforePause = game.round.phase;
  game.round.phase = 'paused';
  accumulator = 0;
  screenState = 'pause';
  pausePage(message);
}
function pausePage(message = '') {
  page(`<span class="eyebrow">TAKE A BREATH</span><h2>ひと休み、雲の上。</h2><p>中断中もタイムは進みます。${message ? '<br>' + message : ''}</p>${modePicker()}
    <label class="setting">傾き感度 <input id="sensitivity" type="range" min="0.5" max="1.8" step="0.1" value="${input.sensitivity}" aria-label="傾き感度"></label>
    <label class="setting">効果音をミュート <input id="muted" type="checkbox" ${sound.muted ? 'checked' : ''}></label>
    <div id="input-error" role="alert"></div><div class="actions"><button class="button primary" id="resume">${input.mode === 'tilt' ? '基準を登録して再開' : '再開する'}</button>${input.mode === 'tilt' ? '<button class="button" id="calibrate">今の持ち方で基準リセット</button>' : ''}<button class="button" id="restart">最初から再挑戦</button><button class="text-button" id="back">エリア選択へ戻る</button></div>`);
  bindModes(() => pausePage());
  document.getElementById('sensitivity')!.addEventListener('input', (e) => {
    save.settings.sensitivity = Number((e.target as HTMLInputElement).value);
    syncSettings();
    persist();
  });
  document.getElementById('muted')!.addEventListener('change', (e) => {
    save.settings.muted = (e.target as HTMLInputElement).checked;
    syncSettings();
    persist();
  });
  bind('calibrate', () => {
    void prepareInput('calibrate').then((ok) => {
      if (ok) toast('今の持ち方を基準にしました。');
    });
  });
  bind('resume', () => {
    const currentGame = game;
    void prepareInput('resume').then((ok) => {
      if (ok && screenState === 'pause' && currentGame === game) {
        game.round.phase = beforePause;
        showPlay();
      }
    });
  });
  bind('restart', () => {
    replaceGame(selected);
    ready();
  });
  bind('back', menu);
}
function result() {
  screenState = 'result';
  const r = game.round,
    total = game.course.tarts.length;
  page(
    `<span class="eyebrow">A BEAUTIFUL LANDING</span><div class="result-seal" aria-hidden="true">✦</div><h2>空の旅、クリア！</h2><p>${game.course.name}</p>
    <div class="result-grid"><div><small>YOUR TIME</small><strong>${formatTime(r.finishedTime)}</strong><em>${resultTimeBest ? '自己ベスト更新！' : '今回のタイム'}</em></div><div><small>YOUR TARTS</small><strong>${r.collected.size} <small style="display:inline">/ ${total}</small></strong><em>${resultTartBest ? '最多タルト更新！' : '今回の収集数'}</em></div></div>
    ${r.collected.size === total ? '<div class="pill">✦ 全タルト収集、おめでとう！</div>' : '<p>また違う道で、タルトを探してみよう。</p>'}
    <div class="actions"><button id="restart" class="button primary">もう一度、この空へ →</button><button id="back" class="button">エリア選択へ戻る</button></div>`,
    'result',
  );
  bind('restart', () => {
    replaceGame(selected);
    ready();
  });
  bind('back', menu);
}
function event(type: GameEvent) {
  sound.play(type);
  view.effect(type);
  const text: Partial<Record<GameEvent, string>> = {
    tart: 'タルト +1',
    dash: '追い風に乗って！',
    jump: '空へジャンプ！',
    checkpoint: 'チェックポイントを通過',
    fall: '大丈夫。少し前から、もう一度。',
    recover: 'ここから、もう一度。',
  };
  if (text[type]) toast(text[type]!);
  if (type === 'recover') {
    view.snap(game.position);
    input.clear();
  }
  if (type === 'goal') {
    const old = save.records[game.course.id],
      r = game.round;
    resultTimeBest = !old || r.finishedTime < old.time;
    resultTartBest = !old || r.collected.size > old.tarts;
    save.records[game.course.id] = improve(old, r.finishedTime, r.collected.size);
    persist();
    result();
  }
}
function frame(timestamp: number) {
  const dt = Math.min((timestamp - previousFrame) / 1000 || 0, 0.05);
  previousFrame = timestamp;
  if (game && view) {
    if (screenState === 'play') {
      if (input.stale && game.round.phase === 'playing')
        pause('センサーの受信が止まりました。基準を登録するかスティックへ切り替えてください。');
      else {
        accumulator += dt;
        while (accumulator >= tuning.step) {
          game.step(input.read(tuning.step), now());
          accumulator -= tuning.step;
        }
      }
    }
    if (hudTime) hudTime.textContent = formatTime(game.round.elapsed(now()));
    if (hudTarts)
      hudTarts.textContent = `${game.round.collected.size} / ${game.course.tarts.length}`;
    view.draw(game, dt, screenState === 'menu' || screenState === 'ready');
  }
  if (timestamp > toastUntil) toastElement.classList.remove('visible');
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause('戻ったら「再開」を押してください。');
  previousFrame = performance.now();
  accumulator = 0;
});
window.addEventListener('pagehide', () => pause());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pause();
});
const sideways = matchMedia('(orientation: landscape) and (pointer: coarse)');
sideways.addEventListener('change', (e) => {
  input.clear();
  if (e.matches) pause();
});
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  pause('描画が停止しました。ページを再読み込みしてください。保存済みの記録は保持されます。');
});
async function boot() {
  try {
    await initPhysics();
    view = new View(canvas);
    await view.loadCharacter();
    menu();
    requestAnimationFrame(frame);
    // 開発サーバーでのみ存在。製品ビルドには試験用操作を含めない。
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
      Object.assign(window, {
        __test: {
          snapshot: () => ({
            phase: game.round.phase,
            position: game.position,
            velocity: game.ball.linvel(),
            tarts: [...game.round.collected],
            checkpoint: game.round.checkpoint,
            elapsed: game.round.elapsed(now()),
            falls: game.round.falls,
            records: save.records,
            memory: view.renderer.info.memory,
            calls: view.renderer.info.render.calls,
          }),
          teleport: (p: { x: number; y: number; z: number }) => game.teleport(p),
          course: () => game.course,
          invalidateHistory: () => {
            game.round.history = [];
          },
          pause: () => pause(),
        },
      });
    }
  } catch (error) {
    page(
      '<span class="eyebrow">LOADING TROUBLE</span><h2>空の準備ができませんでした</h2><p id="load-error"></p><div class="actions"><button id="retry" class="button primary">もう一度読み込む</button></div>',
    );
    document.getElementById('load-error')!.textContent =
      `素材・WebGL・通信を確認してください。${error instanceof Error ? error.message : String(error)}`;
    bind('retry', () => location.reload());
  }
}
void boot();
