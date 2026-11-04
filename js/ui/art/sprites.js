// 일러스트 스프라이트(assets/sprites/*.webp). 다 불러오기 전이나 실패하면 false를 돌려주고,
// 호출한 쪽이 코드로 그린 그림(figures.js)을 대신 쓴다.
// 좌표: 각 프레임 그림 안의 픽셀. ax = 몸 중심(가로 기준점), 아래 끝 = 발.
import { toS } from './view.js';
import { drawBat } from './figures.js';

const BASE = new URL('../../../assets/sprites/', import.meta.url).href;
const STAND = 182;                                       // 서 있는 선수 키(포즈 단위)
const BAT_SHIFT = 26;                                    // 그림 타자는 손이 몸 뒤쪽이라 홈플레이트 쪽으로 당긴다

const SETS = {
  pitcher_back: {
    h0: 505,
    frames: [
      { w: 162, h: 505, ax: 80, num: [80, 145] },
      { w: 173, h: 496, ax: 105, num: [100, 140] },
      { w: 326, h: 458, ax: 160, num: [160, 150] },
      { w: 342, h: 465, ax: 169, num: [169, 150], hand: [329, 12] },
      { w: 243, h: 374, ax: 107, num: [107, 85] },
    ],
  },
  pitcher_front: {
    h0: 730,
    frames: [
      { w: 251, h: 730, ax: 125 },
      { w: 225, h: 707, ax: 148 },
      { w: 242, h: 665, ax: 118, hand: [221, 85] },
    ],
  },
  batter: {                                              // 그림은 왼쪽(투수 쪽)을 본다
    h0: 660,
    frames: [
      { w: 333, h: 660, ax: 168, grip: [298, 95] },
      { w: 411, h: 642, ax: 212, grip: [72, 110] },
      { w: 395, h: 641, ax: 228, grip: [26, 160] },
    ],
  },
  catcher: { h0: 1005, frames: [{ w: 762, h: 1005, ax: 380, mitt: [517, 413] }] },
  umpire: { h0: 1177, frames: [{ w: 633, h: 1177, ax: 316 }] },
};

// 동작 → 프레임 번호
const PIT_FRAMES = { back: [0, 1, 2, 3, 4], front: [0, 1, 1, 2, 2] };     // SET LIFT COCK RELEASE FOLLOW

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
function pitchPhase(now, releaseAt, windMs) {
  if (releaseAt == null) return 0;
  if (now < releaseAt) {
    const u = (now - (releaseAt - windMs)) / windMs;
    return u < 0.22 ? 0 : u < 0.62 ? 1 : u < 0.9 ? 2 : 3;
  }
  return now - releaseAt < 70 ? 3 : 4;
}

// 공이 손을 떠나는 위치(포즈 단위, 투수 발 기준). 스프라이트를 못 쓰면 null
export function spriteReleaseOffset(back, throws) {
  if (!spritesReady()) return null;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const f = set.frames.find(q => q.hand), su = STAND / set.h0, flip = throws === 'L' ? -1 : 1;
  return [(f.hand[0] - f.ax) * su * flip, (f.hand[1] - f.h) * su];
}

export function drawPitcherSprite(ctx, { x, y, scale, back, uni, player, throws, now, releaseAt, windMs }) {
  if (!spritesReady()) return false;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const f = set.frames[PIT_FRAMES[back ? 'back' : 'front'][pitchPhase(now, releaseAt, windMs)]];
  const su = STAND / set.h0, flip = throws === 'L' ? -1 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  shadowAt(ctx, 50);
  ctx.save(); ctx.scale(flip * su, su);
  ctx.drawImage(tinted(f, uni), -f.ax, -f.h);
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
  ctx.restore(); ctx.restore();
  return true;
}

// ── 타자 ── (facing: +1 = 투수가 화면 오른쪽)
export function drawBatterSprite(ctx, { x, y, scale, facing, uni, now, swingAt }) {
  if (!spritesReady()) return false;
  const set = SETS.batter, su = STAND / set.h0;
  const t = swingAt == null ? -1 : now - swingAt;
  const fi = t < 0 ? 0 : t < 45 ? 1 : 2;
  const f = set.frames[fi];
  // 방망이 각도(포즈 단위, +x = 투수 쪽, 위 = -y)
  const ang = fi === 0 ? -2.05 : fi === 1 ? -2.95 : t < 110 ? 0.1 : 0.1 - Math.min(1, (t - 110) / 150) * 2.6;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale); ctx.translate(BAT_SHIFT, 0);
  shadowAt(ctx, 60);
  const grip = [-(f.grip[0] - f.ax) * su, (f.grip[1] - f.h) * su];
  const batBehind = fi === 0;                          // 준비 자세에선 방망이가 머리 뒤
  if (batBehind) drawBat(ctx, grip, ang);
  ctx.save(); ctx.scale(-su, su);                      // 그림은 왼쪽을 보므로 뒤집어서 +x(투수 쪽)를 보게
  ctx.drawImage(tinted(f, uni), -f.ax, -f.h);
  ctx.restore();
  if (!batBehind) drawBat(ctx, grip, ang);
  ctx.restore();
  return true;
}

// ── 포수 + 심판 (투구 시점) ──
export function drawCatcherSprite(ctx, V, mitt) {
  if (!spritesReady()) return false;
  const base = V.feetY - V.zh * 0.05;
  const um = SETS.umpire.frames[0], us = (V.zh * 1.75) / um.h;
  ctx.drawImage(um.img, V.cx + V.zw * 0.32 - um.ax * us, base - V.zh * 0.22 - um.h * us, um.w * us, um.h * us);
  const c = SETS.catcher.frames[0], cs = (V.zh * 1.12) / c.h;
  let ox = V.cx - c.ax * cs, oy = base - c.h * cs;
  const natural = [ox + c.mitt[0] * cs, oy + c.mitt[1] * cs];
  let target = null;
  if (mitt) {
    target = toS(V, mitt.x, mitt.y);
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    ox += clamp((target[0] - natural[0]) * 0.6, V.zw * 0.5);
    oy += clamp((target[1] - natural[1]) * 0.6, V.zh * 0.3);
  }
  ctx.save(); ctx.translate(V.cx, base); shadowAt(ctx, V.zw * 0.6); ctx.restore();
  ctx.drawImage(c.img, ox, oy, c.w * cs, c.h * cs);
  if (target) {
    const r = V.zw * 0.16;
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(target[0], target[1], r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(241,196,15,.9)'; ctx.beginPath(); ctx.arc(target[0], target[1], 2.5, 0, Math.PI * 2); ctx.fill();
  }
  return true;
}
