// 구장 배경: 시점별로 오프스크린 캔버스에 한 번 그려 캐시한다.
import { createRng } from '../../core/rng.js';

function crowd(ctx, W, y0, y1, rng, palette, density = 1) {
  // 층 구분 띠와 난간
  for (let y = y0 + 5, row = 0; y < y1; y += 7.5, row++) {
    const t = (y - y0) / (y1 - y0);
    ctx.fillStyle = `rgba(0,0,0,${0.32 - t * 0.18})`; ctx.fillRect(0, y - 4.5, W, 1.4);
    for (let x = (row % 2) * 3 - 3; x < W + 4; x += 5.6) {
      if (rng() > 0.9 * density) continue;
      const shirt = palette[Math.floor(rng() * palette.length)];
      ctx.fillStyle = shirt; ctx.fillRect(x, y - 0.5, 4.2, 3.6);
      ctx.fillStyle = rng() < 0.55 ? '#d8a882' : '#3a2a20'; ctx.beginPath(); ctx.arc(x + 2.1, y - 2.2, 1.6, 0, Math.PI * 2); ctx.fill();
      if (rng() < 0.07) { ctx.fillStyle = palette[0]; ctx.fillRect(x + 3, y - 7, 1.4, 5); }   // 응원 막대
    }
  }
}
function lightTower(ctx, x, y, s) {
  ctx.fillStyle = '#0c1422'; ctx.fillRect(x - 1.5 * s, y, 3 * s, 46 * s);
  ctx.fillStyle = '#0f1a2c'; ctx.fillRect(x - 13 * s, y - 9 * s, 26 * s, 12 * s);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    const lx = x - 11 * s + i * 6.2 * s, ly = y - 7.5 * s + j * 5 * s;
    const g = ctx.createRadialGradient(lx + 2, ly + 2, 0, lx + 2, ly + 2, 9 * s);
    g.addColorStop(0, 'rgba(255,250,225,.95)'); g.addColorStop(0.25, 'rgba(255,245,200,.35)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.fillRect(lx - 8 * s, ly - 8 * s, 20 * s, 20 * s);
  }
}
function speckle(ctx, x0, y0, w, h, rng, n, colors, size = 1.3) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(x0 + rng() * w, y0 + rng() * h, size, size); }
}
function grass(ctx, W, H, top, vx, spread, rng) {
  const g = ctx.createLinearGradient(0, top, 0, H); g.addColorStop(0, '#2c7a3b'); g.addColorStop(1, '#2f8c43');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, H - top);
  for (let i = -14; i < 14; i += 2) {            // 잔디 깎은 줄무늬
    ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.beginPath();
    ctx.moveTo(vx + i * spread * 0.1, top); ctx.lineTo(vx + (i + 1) * spread * 0.1, top);
    ctx.lineTo(vx + (i + 1) * spread, H); ctx.lineTo(vx + i * spread, H); ctx.closePath(); ctx.fill();
  }
  for (let y = top + 10; y < H; y += 22) { ctx.fillStyle = 'rgba(0,0,0,.035)'; ctx.fillRect(0, y, W, 9); }  // 가로 무늬
  speckle(ctx, 0, top, W, H - top, rng, Math.floor(W * (H - top) / 60), ['rgba(0,40,0,.18)', 'rgba(140,220,120,.10)']);
}
function dirtEllipse(ctx, x, y, rx, ry, rng, a0 = 0, a1 = Math.PI * 2) {
  const g = ctx.createRadialGradient(x, y - ry * 0.3, ry * 0.2, x, y, Math.max(rx, ry));
  g.addColorStop(0, '#c4936a'); g.addColorStop(1, '#a8774f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, a0, a1); ctx.fill();
  ctx.save(); ctx.clip();
  speckle(ctx, x - rx, y - ry, rx * 2, ry * 2, rng, Math.floor(rx * ry / 8), ['rgba(80,45,20,.22)', 'rgba(255,230,190,.16)'], 1.2);
  ctx.restore();
}
function adBoards(ctx, W, y, h, team) {
  const ads = [[team.colors.main, 'LIONS PARK'], ['#f1c40f', 'HOME RUN'], ['#c0392b', 'DAEGU'], ['#16a085', 'BALLPARK'], [team.colors.main, 'BLUE WAVE'], ['#8e44ad', 'PLAY BALL']];
  const w = W / 3.2;
  for (let i = -1; i < 5; i++) {
    const [c, t] = ads[(i + 6) % ads.length], x = i * w + w * 0.3;
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = c; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillStyle = g; ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = `900 ${Math.floor(h * 0.62)}px system-ui,sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(t, x + w / 2, y + h * 0.76);
  }
  ctx.textAlign = 'left';
}
function chalk(ctx, pts, w = 2, a = 0.85) {
  ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts.slice(1)) ctx.lineTo(...p); ctx.stroke();
}
function plate(ctx, x, y, w, flip) {
  const s = flip ? -1 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.moveTo(x - w / 2, y + 2); ctx.lineTo(x + w / 2, y + 2); ctx.lineTo(x + w / 2, y + 2 + 6 * s); ctx.lineTo(x, y + 2 + 12 * s); ctx.lineTo(x - w / 2, y + 2 + 6 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f7f7f4';
  ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + 6 * s); ctx.lineTo(x, y + 12 * s); ctx.lineTo(x - w / 2, y + 6 * s); ctx.closePath(); ctx.fill();
}

// 관중석 일러스트(assets/stadium). 불러오기 전/실패하면 코드로 그린 관중석을 쓴다.
const STANDS = {};
if (typeof Image !== 'undefined') {
  for (const k of ['catcher', 'pitcher']) {
    const img = new Image();
    img.onload = () => { STANDS[k] = img; };
    img.src = new URL(`../../../assets/stadium/${k}.webp`, import.meta.url).href;
  }
}
export const standsReady = kind => !!STANDS[kind];
export const standsImage = kind => STANDS[kind] || null;
// 그림 아래 끝(펜스 바로 아래 = 잔디 시작)을 bottom에 맞추고 가로를 꽉 채운다
function drawStands(ctx, img, W, bottom) {
  const s = W / img.width, h = img.height * s;
  ctx.drawImage(img, 0, bottom - h, W, h);
  const g = ctx.createLinearGradient(0, bottom - 6, 0, bottom + 4);            // 잔디와 이음새 부드럽게
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = g; ctx.fillRect(0, bottom - 6, W, 10);
}

export function buildBackdrop(kind, V, W, H, dpr, homeTeam) {
  const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rng = createRng(kind === 'catcher' ? 7 : 11);
  const home = [homeTeam.colors.main, '#f4f6fa', homeTeam.colors.main, '#a8c2ea', '#e9e9e9', '#2b5fae', '#ffffff'];

  const art = STANDS[kind];
  c.ready = !!art;
  if (kind === 'catcher') {
    const wallY = art ? H * 0.25 : H * 0.2;
    if (art) { drawStands(ctx, art, W, wallY + 9); grass(ctx, W, H, wallY + 9, W / 2, W * 0.36, rng); }
    else {
    const sky = ctx.createLinearGradient(0, 0, 0, wallY); sky.addColorStop(0, '#050b16'); sky.addColorStop(1, '#16233a');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, wallY);
    ctx.fillStyle = '#0e1a2d'; ctx.fillRect(0, wallY * 0.32, W, wallY * 0.68);                     // 관중석 바탕
    crowd(ctx, W, wallY * 0.34, wallY - 13, rng, home);
    lightTower(ctx, W * 0.1, 6, 0.55); lightTower(ctx, W * 0.9, 6, 0.55);
    // 중앙 전광판
    ctx.fillStyle = '#0a0f18'; ctx.fillRect(W / 2 - 34, 4, 68, wallY * 0.3);
    ctx.fillStyle = '#16304f'; ctx.fillRect(W / 2 - 31, 6, 62, wallY * 0.3 - 4);
    adBoards(ctx, W, wallY - 13, 11, homeTeam);
    ctx.fillStyle = '#1d4a2a'; ctx.fillRect(0, wallY - 2, W, 7); ctx.fillStyle = '#f1c40f'; ctx.fillRect(0, wallY - 2, W, 1.5);   // 펜스 + 노란 선
    ctx.fillStyle = '#7a5a3c'; ctx.fillRect(0, wallY + 5, W, 4);                                     // 워닝 트랙
    grass(ctx, W, H, wallY + 9, W / 2, W * 0.36, rng);
    }
    // 내야
    dirtEllipse(ctx, W / 2, V.moundY + H * 0.085, W * 1.0, H * 0.075, rng, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#2d833f'; ctx.beginPath(); ctx.ellipse(W / 2, V.moundY + H * 0.125, W * 0.62, H * 0.065, 0, Math.PI, Math.PI * 2); ctx.fill();
    dirtEllipse(ctx, W / 2, V.moundY, W * 0.17, H * 0.024, rng);                                   // 마운드
    ctx.fillStyle = 'rgba(255,240,215,.25)'; ctx.beginPath(); ctx.ellipse(W / 2, V.moundY - 3, W * 0.09, H * 0.01, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fafafa'; ctx.fillRect(W / 2 - 9, V.moundY - 2, 18, 2.5);                     // 투수판
    // 파울 라인
    chalk(ctx, [[W / 2 - V.zw * 0.6, V.feetY], [-W * 0.6, wallY + 9]]);
    chalk(ctx, [[W / 2 + V.zw * 0.6, V.feetY], [W * 1.6, wallY + 9]]);
    // 홈 주변
    dirtEllipse(ctx, W / 2, V.feetY + H * 0.045, W * 0.64, H * 0.125, rng);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - V.zw * 1.6, V.feetY - 22, V.zw * 0.88, 36); ctx.strokeRect(W / 2 + V.zw * 0.72, V.feetY - 22, V.zw * 0.88, 36);
    plate(ctx, W / 2, V.feetY - 6, V.zw, false);
  } else {
    const wallY = H * 0.13;
    if (art) {
      const bottom = wallY + H * 0.065 + 2;
      drawStands(ctx, art, W, bottom);
      grass(ctx, W, H, bottom, W / 2, W * 0.42, rng);
    } else {
    const sky = ctx.createLinearGradient(0, 0, 0, wallY); sky.addColorStop(0, '#060c18'); sky.addColorStop(1, '#17243b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, wallY);
    crowd(ctx, W, 2, wallY, rng, home);
    // 백스톱 (그물 + 패딩)
    const bs = ctx.createLinearGradient(0, wallY, 0, wallY + H * 0.065); bs.addColorStop(0, '#10305a'); bs.addColorStop(1, '#0a2142');
    ctx.fillStyle = bs; ctx.fillRect(0, wallY, W, H * 0.065);
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
    for (let x = -H; x < W + H; x += 9) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + wallY + H * 0.065, wallY + H * 0.065); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, wallY + H * 0.065); ctx.lineTo(x + wallY + H * 0.065, 0); ctx.stroke(); }
    for (let x = 0; x < W; x += W / 6) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, wallY + H * 0.03, 1.5, H * 0.035); }
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(0, wallY + H * 0.065, W, 2);
    grass(ctx, W, H, wallY + H * 0.065 + 2, W / 2, W * 0.42, rng);
    }
    // 홈 주변 흙
    dirtEllipse(ctx, V.cx, V.feetY - V.zh * 0.12, V.zw * 2.7, V.zh * 0.78, rng);
    chalk(ctx, [[V.cx - V.zw * 0.5, V.feetY], [-W * 0.3, H * 0.92]]);
    chalk(ctx, [[V.cx + V.zw * 0.5, V.feetY], [W * 1.3, H * 0.92]]);
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6;
    ctx.strokeRect(V.cx - V.zw * 1.55, V.feetY - 13, V.zw * 0.88, 21); ctx.strokeRect(V.cx + V.zw * 0.67, V.feetY - 13, V.zw * 0.88, 21);
    plate(ctx, V.cx, V.feetY + 2, V.zw, true);
    // 마운드 (화면 아래)
    dirtEllipse(ctx, W / 2, H * 1.04, W * 0.64, H * 0.16, rng);
    ctx.fillStyle = 'rgba(255,240,215,.18)'; ctx.beginPath(); ctx.ellipse(W / 2, H * 1.05, W * 0.42, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fafafa'; ctx.fillRect(W / 2 - 32, H * 0.985, 64, 5);
  }
  // 비네트
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  return c;
}
