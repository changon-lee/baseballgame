// 일러스트 스프라이트(assets/sprites/*.webp). 다 불러오기 전이나 실패하면 false를 돌려주고,
// 호출한 쪽이 코드로 그린 그림(figures.js)을 대신 쓴다.
// 좌표: 각 프레임 그림 안의 픽셀. ax = 머리(모자) 가로 중심 — 동작 중 머리는 거의 안 움직이므로 프레임끼리 머리를 맞춘다. 아래 끝 = 발.
// 동작은 프레임을 끊어 바꾸지 않고, 잠깐 머문 뒤 다음 프레임으로 겹쳐 넘어간다(디졸브) + 몸 위치를 조금씩 옮긴다.
import { toS } from './view.js';
import { drawBat } from './figures.js';

const BASE = new URL('../../../assets/sprites/', import.meta.url).href;
const STAND = 182;                                       // 서 있는 선수 키(포즈 단위)
const BAT_SHIFT = 26;                                    // 그림 타자는 손이 몸 뒤쪽이라 홈플레이트 쪽으로 당긴다

// dy/sc = 그 동작일 때 몸 위치·크기 변화(투수가 홈 쪽으로 내딛는 느낌)
const SETS = {
  pitcher_back: {
    h0: 505,
    frames: [
      { w: 162, h: 505, ax: 89, num: [80, 145], dy: 0, sc: 1 },
      { w: 173, h: 496, ax: 111, num: [100, 140], dy: -3, sc: 1 },
      { w: 326, h: 458, ax: 172, num: [160, 150], dy: 0, sc: 1 },
      { w: 342, h: 465, ax: 148, num: [169, 150], hand: [329, 12], dy: -7, sc: 0.97 },
      { w: 243, h: 374, ax: 157, num: [107, 85], dy: -11, sc: 0.95 },
    ],
  },
  pitcher_front: {
    h0: 529,
    frames: [
      { w: 169, h: 529, ax: 84, dy: 0, sc: 1 },
      { w: 159, h: 520, ax: 88, dy: 0, sc: 1 },
      { w: 147, h: 507, ax: 76, dy: 0, sc: 1 },
      { w: 215, h: 477, ax: 132, hand: [14, 160], dy: 3, sc: 1.04 },
      { w: 197, h: 387, ax: 139, dy: 5, sc: 1.07 },
    ],
  },
  batter: {                                              // 그림은 왼쪽(투수 쪽)을 본다. dx = 투수 쪽으로 내딛기
    h0: 660,
    frames: [
      { w: 333, h: 660, ax: 161, grip: [298, 95], dx: 0 },
      { w: 411, h: 642, ax: 170, grip: [72, 110], dx: 3 },
      { w: 395, h: 641, ax: 238, grip: [26, 160], dx: 5 },
    ],
  },
  catcher: { h0: 1005, frames: [{ w: 762, h: 1005, ax: 380, mitt: [517, 413] }] },
  umpire: { h0: 1177, frames: [{ w: 633, h: 1177, ax: 316 }] },
};

let loaded = 0, total = 0, failed = false;
for (const [name, set] of Object.entries(SETS)) {
  set.frames.forEach((f, i) => {
    total++;
    const img = new Image();
    img.onload = () => { loaded++; };
    img.onerror = () => { failed = true; };
    img.src = `${BASE}${name}_${i}.webp`;
    f.img = img;
  });
}
export const spritesReady = () => !failed && loaded === total;

// ── 시간 보간 도우미 ──
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// keys: [[시각, 값]...] 를 시각 t에서 부드럽게 보간
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
// 프레임 순서표: [[시각, 프레임]...] → 지금 보여줄 두 프레임과 겹침 정도.
// 각 구간의 앞쪽 hold 비율만큼은 앞 프레임에 머물고, 나머지 동안 다음 프레임으로 겹쳐 넘어간다.
function frameMix(keys, t, hold = 0.4) {
  if (t <= keys[0][0]) return { a: keys[0][1], b: keys[0][1], mix: 0, s: 0, i: 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) {
      const s = (t - t0) / (t1 - t0);
      return { a, b, mix: smooth((s - hold) / (1 - hold)), s, i };
    }
  }
  const last = keys[keys.length - 1][1];
  return { a: last, b: last, mix: 0, s: 1, i: keys.length - 1 };
}

// ── 팀 색 입히기: 파란 부분 → 구단색, 원정은 흰 유니폼 → 회색 ──
const SAMSUNG = '#074CA1';
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
const rgb = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};
const tintCache = new Map();
function tinted(f, uni) {
  const away = uni.jersey !== '#f4f6f9';
  if (uni.trim === SAMSUNG && !away) return f.img;
  const key = f.img.src + '|' + uni.trim + '|' + away;
  if (tintCache.has(key)) return tintCache.get(key);
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(f.img, 0, 0);
  const n = parseInt(uni.trim.slice(1), 16);
  const [th, ts, tv] = hsv(n >> 16, (n >> 8) & 255, n & 255);
  const d = x.getImageData(0, 0, f.w, f.h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const [h, s, v] = hsv(p[i], p[i + 1], p[i + 2]);
    let o = null;
    if (h > 195 && h < 255 && s > 0.3 && v > 0.08) o = rgb(th, ts * Math.min(1, s / 0.8), Math.min(1, v * Math.max(tv, 0.12) / 0.63));
    else if (away && s < 0.16 && v > 0.35) o = [p[i] * 0.6, p[i + 1] * 0.61, p[i + 2] * 0.64];
    if (o) { p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
  }
  x.putImageData(d, 0, 0);
  tintCache.set(key, c);
  return c;
}

function shadowAt(ctx, w) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ── 투수 ──
// 와인드업 u(0~1): 셋 → 다리 들기 → 팔 젖히기 → 릴리스. 릴리스 뒤: 팔로스루 → (잠시 뒤) 다시 셋.
const WIND_KEYS = [[0, 0], [0.42, 1], [0.78, 2], [1, 3]];
function pitchState(now, releaseAt, windMs) {
  if (releaseAt == null) return { a: 0, b: 0, mix: 0, idle: true };
  if (now < releaseAt) {
    const u = (now - (releaseAt - windMs)) / windMs;
    if (u < 0) return { a: 0, b: 0, mix: 0, idle: true };
    return frameMix(WIND_KEYS, u, 0.55);
  }
  const dt = now - releaseAt;
  return frameMix([[0, 3], [140, 4], [900, 4], [1250, 0]], dt, dt < 140 ? 0.25 : 0.5);
}

// 공이 손을 떠나는 위치(포즈 단위, 투수 발 기준). 스프라이트를 못 쓰면 null
export function spriteReleaseOffset(back, throws) {
  if (!spritesReady()) return null;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const f = set.frames.find(q => q.hand), su = (STAND / set.h0) * f.sc, flip = throws === 'L' ? -1 : 1;
  return [(f.hand[0] - f.ax) * su * flip, (f.hand[1] - f.h) * su + f.dy];
}

function drawPitcherFrame(ctx, f, img, su, flip, alpha, back, player, uni) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.scale(flip * su, su);
  ctx.drawImage(img, -f.ax, -f.h);
  if (back && player && f.num) {                       // 등 이름·번호
    ctx.translate(f.num[0] - f.ax, f.num[1] - f.h); ctx.scale(flip, 1);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '800 17px "Pretendard Variable",system-ui,sans-serif';
    ctx.fillStyle = uni.num; ctx.fillText(player.name, 0, -30);
    if (player.num != null) {
      ctx.font = '900 54px system-ui,sans-serif';
      ctx.lineWidth = 6; ctx.strokeStyle = uni.numEdge; ctx.strokeText(String(player.num), 0, 22);
      ctx.fillStyle = uni.num; ctx.fillText(String(player.num), 0, 22);
    }
  }
  ctx.restore();
}

export function drawPitcherSprite(ctx, { x, y, scale, back, uni, player, throws, now, releaseAt, windMs }) {
  if (!spritesReady()) return false;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const st = pitchState(now, releaseAt, windMs);
  const A = set.frames[st.a], B = set.frames[st.b];
  const k = st.a === st.b ? 0 : smooth(st.s ?? 0);   // 몸 이동은 구간 전체에 걸쳐 부드럽게
  const dy = lerp(A.dy, B.dy, k), sc = lerp(A.sc, B.sc, k);
  const breathe = st.idle ? 1 + Math.sin(now / 420) * 0.006 : 1;
  const su = (STAND / set.h0) * sc, flip = throws === 'L' ? -1 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  shadowAt(ctx, 50);
  ctx.translate(0, dy); ctx.scale(1, breathe);
  drawPitcherFrame(ctx, A, tinted(A, uni), su, flip, 1, back, player, uni);
  if (st.mix > 0) drawPitcherFrame(ctx, B, tinted(B, uni), su, flip, st.mix, back, player, uni);
  ctx.restore();
  return true;
}

// ── 타자 ── (facing: +1 = 투수가 화면 오른쪽)
// 스윙 시각표(ms): 준비 → 시작 → 임팩트 → (머묾) → 준비 자세로 돌아옴
export const SWING_CONTACT_MS = 70;                     // 스윙 시작 → 방망이가 공에 닿는 순간
const SWING_FRAMES = [[0, 0], [35, 1], [SWING_CONTACT_MS, 2], [650, 2], [950, 0]];
const SWING_BAT = [[0, -2.3], [35, -2.95], [SWING_CONTACT_MS, 0.1], [300, -2.45], [650, -2.45], [950, -2.05]];

function batterState(now, swingAt, pitchStart, travelMs) {
  if (swingAt != null && now >= swingAt) {
    const t = now - swingAt;
    const fm = frameMix(SWING_FRAMES, t, t < SWING_CONTACT_MS ? 0 : 0.6);
    return { ...fm, ang: track(SWING_BAT, t), t, swinging: t < SWING_CONTACT_MS + 60 };
  }
  // 공이 오는 동안 살짝 뒤로 당기는 로드, 기다릴 때는 방망이를 가볍게 흔든다
  const load = pitchStart != null && now >= pitchStart ? smooth((now - pitchStart) / Math.max(1, travelMs) / 0.6) : 0;
  const waggle = Math.sin(now / 260) * 0.07 * (1 - load);
  return { a: 0, b: 0, mix: 0, s: 0, ang: -2.05 - 0.25 * load + waggle, load, t: -1 };
}

function drawBatterFrame(ctx, f, img, su, alpha) {
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.scale(-su, su);   // 그림은 왼쪽을 보므로 뒤집어서 +x(투수 쪽)를 보게
  ctx.drawImage(img, -f.ax, -f.h);
  ctx.restore();
}

export function drawBatterSprite(ctx, { x, y, scale, facing, uni, now, swingAt, pitchStart, travelMs }) {
  if (!spritesReady()) return false;
  const set = SETS.batter, su = STAND / set.h0;
  const st = batterState(now, swingAt, pitchStart, travelMs);
  const A = set.frames[st.a], B = set.frames[st.b];
  const k = st.a === st.b ? 0 : smooth(st.s);
  const dx = lerp(A.dx, B.dx, k) - (st.load || 0) * 4;
  const bob = st.t < 0 ? Math.sin(now / 520) * 0.6 : 0;
  // 방망이를 쥔 손 위치도 두 프레임 사이를 따라간다
  const gp = f => [-(f.grip[0] - f.ax) * su, (f.grip[1] - f.h) * su];
  const ga = gp(A), gb = gp(B);
  const grip = [lerp(ga[0], gb[0], st.mix), lerp(ga[1], gb[1], st.mix) + bob];
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale); ctx.translate(BAT_SHIFT, 0);
  shadowAt(ctx, 60);
  ctx.translate(dx, 0);
  const batBehind = st.ang < -1.6 && st.t < 0;          // 준비 자세에선 방망이가 머리 뒤
  if (batBehind) drawBat(ctx, grip, st.ang);
  ctx.save(); ctx.translate(0, bob);
  drawBatterFrame(ctx, A, tinted(A, uni), su, 1);
  if (st.mix > 0) drawBatterFrame(ctx, B, tinted(B, uni), su, st.mix);
  ctx.restore();
  if (st.swinging) {                                     // 스윙 잔상
    const a0 = track(SWING_BAT, Math.max(0, st.t - 45)), a1 = st.ang;
    ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = '#f3e2c4';
    ctx.beginPath(); ctx.arc(grip[0], grip[1], 94, Math.min(a0, a1), Math.max(a0, a1));
    ctx.arc(grip[0], grip[1], 50, Math.max(a0, a1), Math.min(a0, a1), true); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  if (!batBehind) drawBat(ctx, grip, st.ang);
  ctx.restore();
  return true;
}

// ── 포수 + 심판 (투구 시점). 포수는 제자리, 겨냥 위치는 노란 원으로만 표시 ──
export function drawCatcherSprite(ctx, V, mitt, now = 0) {
  if (!spritesReady()) return false;
  const base = V.feetY - V.zh * 0.05;
  const um = SETS.umpire.frames[0], us = (V.zh * 1.75) / um.h;
  ctx.drawImage(um.img, V.cx + V.zw * 0.32 - um.ax * us, base - V.zh * 0.22 - um.h * us, um.w * us, um.h * us);
  const c = SETS.catcher.frames[0], cs = (V.zh * 1.12) / c.h;
  const breathe = Math.sin(now / 480) * V.zh * 0.004;
  ctx.save(); ctx.translate(V.cx, base); shadowAt(ctx, V.zw * 0.6); ctx.restore();
  ctx.drawImage(c.img, V.cx - c.ax * cs, base - c.h * cs + breathe, c.w * cs, c.h * cs);
  if (mitt) {
    const [tx, ty] = toS(V, mitt.x, mitt.y), r = V.zw * 0.16;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(241,196,15,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx - r * 0.45, ty); ctx.lineTo(tx + r * 0.45, ty); ctx.moveTo(tx, ty - r * 0.45); ctx.lineTo(tx, ty + r * 0.45); ctx.stroke();
    ctx.restore();
  }
  return true;
}
