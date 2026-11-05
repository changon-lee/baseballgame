// 일러스트 스프라이트(assets/sprites/*.webp). 다 불러오기 전이나 실패하면 false를 돌려주고,
// 호출한 쪽이 코드로 그린 그림(figures.js)을 대신 쓴다.
// 좌표: 각 프레임 그림 안의 픽셀. ax = 머리(모자) 가로 중심 — 동작 중 머리는 거의 안 움직이므로 프레임끼리 머리를 맞춘다. 아래 끝 = 발.
// 동작은 프레임을 끊어 바꾸지 않고, 잠깐 머문 뒤 다음 프레임으로 겹쳐 넘어간다(디졸브) + 몸 위치를 조금씩 옮긴다.
import { toS } from './view.js';
import { drawBat } from './figures.js';

const BASE = new URL('../../../assets/sprites/', import.meta.url).href;
const STAND = 182;                                       // 서 있는 선수 키(포즈 단위)
const BAT_SHIFT = 0;                                     // 필요하면 타자 그림을 홈플레이트 쪽(+)으로 당긴다

// dy/sc = 그 동작일 때 몸 위치·크기 변화(투수가 홈 쪽으로 내딛는 느낌)
// k = 그림 배율 보정(중간 동작 그림은 더 크게 그려져 있어서 줄인다). 없으면 1
const SETS = {
  pitcher_back: {                                        // 셋 → 다리 들기 시작 → 최고점 → 손 빼기 → 착지·팔 젖힘 → 가속 → 릴리스 → 팔로스루
    h0: 667, txt: 1.3,                                   // txt = 등 이름·번호 글자 배율
    frames: [
      { w: 236, h: 667, ax: 138, num: [115, 175], dy: 0, sc: 1 },
      { w: 219, h: 663, ax: 134, num: [125, 175], dy: 0, sc: 1 },
      { w: 234, h: 665, ax: 152, num: [135, 175], dy: -1, sc: 1 },
      { w: 419, h: 660, ax: 240, num: [235, 170], dy: -3, sc: 0.99 },
      { w: 482, h: 520, ax: 237, num: [245, 145], dy: -6, sc: 0.97, k: 1.15 },
      { w: 341, h: 522, ax: 169, num: [175, 150], dy: -7, sc: 0.96, k: 1.15 },
      { w: 350, h: 559, ax: 120, num: [165, 150], hand: [335, 18], dy: -9, sc: 0.95, k: 1.15 },
      { w: 421, h: 420, ax: 112, dy: -12, sc: 0.93, k: 1.15 },
    ],
  },
  pitcher_front: {                                       // 정면(카메라 쪽으로 던짐), 순서는 뒷모습과 같다
    h0: 746,
    frames: [
      { w: 247, h: 746, ax: 122, dy: 0, sc: 1 },
      { w: 245, h: 745, ax: 121, dy: 0, sc: 1 },
      { w: 246, h: 743, ax: 121, dy: 0, sc: 1 },
      { w: 347, h: 707, ax: 156, dy: 1, sc: 1.01 },
      { w: 396, h: 683, ax: 201, dy: 2, sc: 1.03, k: 0.92 },
      { w: 350, h: 688, ax: 184, dy: 3, sc: 1.04, k: 0.92 },
      { w: 326, h: 681, ax: 200, hand: [22, 72], dy: 4, sc: 1.05, k: 0.92 },
      { w: 394, h: 575, ax: 167, dy: 6, sc: 1.07, k: 0.92 },
    ],
  },
  batter: {                                              // 그림은 왼쪽(투수 쪽)을 본다. dx = 투수 쪽으로 내딛기, grip = 방망이 쥔 손
    h0: 662,                                             // 준비 → 다리 들기 → 내딛기 → 스윙 시작 → 임팩트 → 임팩트 직후 → 팔로스루 → 마무리
    frames: [
      { w: 379, h: 662, ax: 173, grip: [288, 64], dx: 0 },
      { w: 397, h: 657, ax: 215, grip: [322, 78], dx: -2 },
      { w: 427, h: 657, ax: 219, grip: [318, 76], dx: 2 },
      { w: 261, h: 677, ax: 93, grip: [58, 146], dx: 3 },
      { w: 343, h: 644, ax: 184, grip: [28, 154], dx: 4 },
      { w: 347, h: 647, ax: 222, grip: [26, 138], dx: 5 },
      { w: 292, h: 646, ax: 166, grip: [38, 98], dx: 4 },
      { w: 220, h: 651, ax: 142, grip: [28, 34], dx: 3 },
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

// 겹침 정도 → 앞/뒤 프레임 투명도. 가운데선 둘 다 진하게(배경이 비쳐 보이지 않게), 끝에선 앞 프레임이 완전히 사라진다
const fade = mix => mix <= 0 ? [1, 0] : [Math.min(1, 2 * (1 - mix)), Math.min(1, 2 * mix)];

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

// ── 타구 장면(3D)용 수비수·주자 그림: 1피트 = FIELD_PX 픽셀로 줄여 저장. 옆모습은 오른쪽을 본다 ──
// 투수·타자 그림과 따로 불러와서, 못 불러온 그림만 코드로 그린 사람으로 대신한다
export const FIELD_PX = 50;
const FIELD = {
  fielder: [{ w: 186, h: 250, ax: 92 }, { w: 177, h: 194, ax: 88 }, { w: 113, h: 331, ax: 56 }, { w: 117, h: 303, ax: 55 }],   // 준비, 땅볼, 뜬공, 서서 보기(정면)
  frun: [{ w: 237, h: 279, ax: 118 }, { w: 243, h: 281, ax: 120 }, { w: 239, h: 284, ax: 119 }, { w: 236, h: 284, ax: 92 }, { w: 234, h: 284, ax: 83 }],
  fthrow: [{ w: 234, h: 256, ax: 116 }, { w: 243, h: 263, ax: 118 }, { w: 243, h: 263, ax: 105 }, { w: 320, h: 171, ax: 22 }],   // 내딛기, 던질 준비, 릴리스, 다이빙
  runner: [{ w: 241, h: 279, ax: 123 }, { w: 247, h: 277, ax: 124 }, { w: 223, h: 286, ax: 74 }, { w: 236, h: 284, ax: 78 }],
};
for (const [name, frames] of Object.entries(FIELD)) {
  frames.forEach((f, i) => {
    const img = new Image();
    img.onload = () => { f.ok = true; };
    img.src = `${BASE}${name}_${i}.webp`;
    f.img = img;
  });
}
// 그림 한 장(팀 색 입힌 것). 아직 못 불러왔으면 null
export function fieldSprite(name, i, uni) {
  const f = FIELD[name]?.[i];
  if (!f || !f.ok) return null;
  return { img: tinted(f, uni), w: f.w, h: f.h, ax: f.ax };
}

function shadowAt(ctx, w) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ── 투수 ──
// 와인드업 u(0~1): 셋 → … → 릴리스(6). 릴리스 뒤: 팔로스루(7) → (잠시 뒤) 다시 셋.
const WIND_KEYS = [[0, 0], [0.17, 1], [0.37, 2], [0.53, 3], [0.67, 4], [0.83, 5], [1, 6]];
const REL = 6, FOL = 7;
function pitchState(now, releaseAt, windMs) {
  if (releaseAt == null) return { a: 0, b: 0, mix: 0, idle: true };
  if (now < releaseAt) {
    const u = (now - (releaseAt - windMs)) / windMs;
    if (u < 0) return { a: 0, b: 0, mix: 0, idle: true };
    return frameMix(WIND_KEYS, u, 0.4);
  }
  const dt = now - releaseAt;
  return frameMix([[0, REL], [140, FOL], [900, FOL], [1250, 0]], dt, dt < 140 ? 0.25 : 0.5);
}

// 공이 손을 떠나는 위치(포즈 단위, 투수 발 기준). 스프라이트를 못 쓰면 null
export function spriteReleaseOffset(back, throws) {
  if (!spritesReady()) return null;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const f = set.frames.find(q => q.hand), su = (STAND / set.h0) * f.sc * (f.k || 1), flip = throws === 'L' ? -1 : 1;
  return [(f.hand[0] - f.ax) * su * flip, (f.hand[1] - f.h) * su + f.dy];
}

function drawPitcherFrame(ctx, f, img, su, flip, alpha, back, player, uni, txt = 1) {
  if (alpha <= 0.01) return;
  const k = f.k || 1;
  ctx.save(); ctx.globalAlpha = alpha; ctx.scale(flip * su * k, su * k);
  ctx.drawImage(img, -f.ax, -f.h);
  if (back && player && f.num) {                       // 등 이름·번호(그림 배율과 상관없이 같은 크기)
    ctx.translate(f.num[0] - f.ax, f.num[1] - f.h); ctx.scale(flip * txt / k, txt / k);
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
  const [aA, aB] = fade(st.mix);
  drawPitcherFrame(ctx, A, tinted(A, uni), su, flip, aA, back, player, uni, set.txt);
  drawPitcherFrame(ctx, B, tinted(B, uni), su, flip, aB, back, player, uni, set.txt);
  ctx.restore();
  return true;
}

// ── 타자 ── (facing: +1 = 투수가 화면 오른쪽)
// 스윙 시각표(ms): 내딛은 자세 → 시작 → 임팩트 → 팔로스루 → 마무리(머묾) → 준비 자세로 돌아옴
export const SWING_CONTACT_MS = 70;                     // 스윙 시작 → 방망이가 공에 닿는 순간
const SWING_FRAMES = [[0, 2], [35, 3], [SWING_CONTACT_MS, 4], [170, 5], [330, 6], [560, 7], [850, 7], [1200, 0]];
// 방망이 각도(투수 쪽 = 0, 위 = -π/2, 뒤 = ±π). 마무리에선 등 뒤로 감겨 아래를 향한다(-3.6)
const SWING_BAT = [[0, -2.3], [35, -3.0], [SWING_CONTACT_MS, 0.1], [170, -0.6], [330, -2.3], [560, -3.6], [850, -3.6], [1200, -2.05]];
// 공이 오는 동안(투구 진행 비율): 준비 → 다리 들기 → 내딛기
const LOAD_KEYS = [[0, 0], [0.3, 1], [0.65, 2]];

function batterState(now, swingAt, pitchStart, travelMs) {
  if (swingAt != null && now >= swingAt) {
    const t = now - swingAt;
    const fm = frameMix(SWING_FRAMES, t, t < SWING_CONTACT_MS ? 0 : t < 600 ? 0.2 : 0.6);
    return { ...fm, ang: track(SWING_BAT, t), t, swinging: t < SWING_CONTACT_MS + 60 };
  }
  // 공이 오면 다리를 들었다가 내딛는다. 기다릴 때는 방망이를 가볍게 흔든다
  const u = pitchStart != null && now >= pitchStart ? (now - pitchStart) / Math.max(1, travelMs) : 0;
  const load = smooth(u / 0.65);
  const waggle = Math.sin(now / 260) * 0.07 * (1 - load);
  return { ...frameMix(LOAD_KEYS, u, 0.25), ang: -2.05 - 0.25 * load + waggle, t: -1 };
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
  const dx = lerp(A.dx, B.dx, k);
  const bob = st.t < 0 ? Math.sin(now / 520) * 0.6 : 0;
  // 방망이를 쥔 손 위치도 두 프레임 사이를 따라간다
  const gp = f => [-(f.grip[0] - f.ax) * su, (f.grip[1] - f.h) * su];
  const ga = gp(A), gb = gp(B);
  const grip = [lerp(ga[0], gb[0], st.mix), lerp(ga[1], gb[1], st.mix) + bob];
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale); ctx.translate(BAT_SHIFT, 0);
  shadowAt(ctx, 60);
  ctx.translate(dx, 0);
  const batBehind = (st.ang < -1.6 && st.t < 0) || st.t > 300;   // 준비 자세·팔로스루에선 방망이가 몸 뒤
  if (batBehind) drawBat(ctx, grip, st.ang);
  ctx.save(); ctx.translate(0, bob);
  const [aA, aB] = fade(st.mix);
  drawBatterFrame(ctx, A, tinted(A, uni), su, aA);
  drawBatterFrame(ctx, B, tinted(B, uni), su, aB);
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
  const um = SETS.umpire.frames[0], us = (V.zh * 1.35) / um.h;
  ctx.drawImage(um.img, V.cx + V.zw * 0.3 - um.ax * us, base - V.zh * 0.2 - um.h * us, um.w * us, um.h * us);
  const c = SETS.catcher.frames[0], cs = (V.zh * 0.86) / c.h;
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
