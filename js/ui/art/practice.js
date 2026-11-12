// 연습장 배경: 경기장 배경(buildBackdrop) 위에 연습장 분위기를 입힌다.
//   타격 연습 = 배팅 케이지(그물 터널 + 간판), 투구 연습 = 불펜(철망 + 간판). 조명은 어둡게.
// assets/practice/manifest.json 에 { "bat": "파일", "pitch": "파일" }을 적어 두면 그 그림을 배경 전체로 대신 쓴다.
//   { "file": "파일", "at": [가로, 세로], "zoom": 배율 }로 적으면 그림 속 한 점(0~1 비율)을 게임의 기준점에 맞춘다:
//   타격 연습(bat) = 투수 발(마운드 투수판), 투구 연습(pitch) = 홈플레이트 가운데. zoom은 화면을 꽉 채우는 크기 대비 배율
const BASE = new URL('../../../assets/practice/', import.meta.url);
let manifest = null, loading = false, pending = 0;
const IMG = {};
function load() {
  if (loading || typeof fetch !== 'function') return;
  loading = true;
  fetch(new URL('manifest.json', BASE)).then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(m => {
    manifest = m && typeof m === 'object' ? m : {};
    for (const k of ['bat', 'pitch']) {
      const e = manifest[k], f = e && typeof e === 'object' ? e.file : e;
      if (typeof f !== 'string' || /[\\/]/.test(f) || typeof Image === 'undefined') continue;
      pending++;
      const img = new Image();
      img.onload = () => { IMG[k] = { img, fit: fitOf(e) }; pending--; };
      img.onerror = () => { pending--; };
      img.src = new URL(f, BASE).href;
    }
  });
}
const num = (v, a, b, d) => (typeof v === 'number' && v >= a && v <= b ? v : d);
function fitOf(e) {
  if (!e || typeof e !== 'object' || !Array.isArray(e.at)) return null;
  return { fx: num(e.at[0], 0, 1, 0.5), fy: num(e.at[1], 0, 1, 0.5), zoom: num(e.zoom, 1, 4, 1) };
}
// 연습장에 들어가자마자 불러 두기(첫 화면부터 연습장 그림이 나오게)
export const preloadPractice = () => load();
// 파일 목록과 그림 불러오기가 끝났나(끝나기 전에 그린 배경은 끝난 뒤 한 번 다시 그린다)
export const practiceArtSettled = () => manifest !== null && pending === 0;

function sign(ctx, cx, y, w, h, text, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(cx - w / 2 + 2, y + 3, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = color; ctx.fillRect(cx - w / 2, y, w, h); ctx.fillStyle = g; ctx.fillRect(cx - w / 2, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx - w / 2 + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.floor(h * 0.5)}px system-ui,sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(text, cx, y + h * 0.68); ctx.restore();
}

// 배팅 케이지: 소실점으로 모이는 그물(좌·우·위)과 가로 고리
function cage(ctx, W, H, team) {
  const vx = W / 2, vy = H * 0.34, floor = H * 0.6;
  const dim = ctx.createLinearGradient(0, 0, 0, floor);
  dim.addColorStop(0, 'rgba(3,8,20,.74)'); dim.addColorStop(1, 'rgba(3,8,20,.3)');
  ctx.fillStyle = dim; ctx.fillRect(0, 0, W, floor);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, floor); ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(205,220,240,.24)'; ctx.lineWidth = 1;
  const N = 15;
  for (let i = 0; i <= N; i++) {                                   // 소실점에서 화면 가장자리로 나가는 줄
    const t = i / N;
    for (const [x, y] of [[t * W, -30], [-30, t * floor], [W + 30, t * floor]]) { ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(x, y); ctx.stroke(); }
  }
  for (const s of [0.13, 0.21, 0.32, 0.48, 0.72, 1.05, 1.55]) {      // 가까울수록 크고 진한 고리
    const hw = W * 0.6 * s, top = vy - vy * 1.15 * s;
    ctx.strokeStyle = `rgba(215,228,245,${Math.min(0.5, 0.12 + s * 0.26)})`; ctx.lineWidth = 0.8 + s * 1.1;
    ctx.beginPath(); ctx.moveTo(vx - hw, floor + 6); ctx.lineTo(vx - hw, top); ctx.lineTo(vx + hw, top); ctx.lineTo(vx + hw, floor + 6); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(8,14,26,.9)'; ctx.fillRect(0, 0, W, Math.max(5, H * 0.012));   // 맨 위 철제 빔
  sign(ctx, W / 2, H * 0.045, Math.min(W * 0.62, 260), Math.max(26, H * 0.04), 'BATTING CENTER', team.colors.main);
  ctx.save(); ctx.fillStyle = 'rgba(255,210,63,.95)'; ctx.font = `800 ${Math.max(10, H * 0.014)}px system-ui,sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('— PRACTICE —', W / 2, H * 0.045 + Math.max(26, H * 0.04) + Math.max(14, H * 0.022)); ctx.restore();
}

// 불펜: 양옆 철망 울타리
function bullpen(ctx, W, H, team) {
  const floor = H * 0.6;
  const dim = ctx.createLinearGradient(0, 0, 0, floor);
  dim.addColorStop(0, 'rgba(3,8,20,.62)'); dim.addColorStop(1, 'rgba(3,8,20,.22)');
  ctx.fillStyle = dim; ctx.fillRect(0, 0, W, floor);
  for (const [x0, x1] of [[0, W * 0.2], [W * 0.8, W]]) {
    ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, x1 - x0, floor); ctx.clip();
    ctx.fillStyle = 'rgba(4,10,22,.35)'; ctx.fillRect(x0, 0, x1 - x0, floor);
    ctx.strokeStyle = 'rgba(205,220,240,.3)'; ctx.lineWidth = 1;
    for (let d = -floor; d < W; d += 13) {                          // 마름모 철망
      ctx.beginPath(); ctx.moveTo(x0 + d, 0); ctx.lineTo(x0 + d + floor, floor); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + d + floor, 0); ctx.lineTo(x0 + d, floor); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(180,195,215,.55)'; ctx.fillRect(x0 === 0 ? W * 0.2 - 3 : W * 0.8, 0, 3, floor);   // 기둥
  }
  ctx.fillStyle = 'rgba(180,195,215,.5)'; ctx.fillRect(0, floor - 3, W * 0.2, 3); ctx.fillRect(W * 0.8, floor - 3, W * 0.2, 3);
  sign(ctx, W / 2, H * 0.045, Math.min(W * 0.5, 210), Math.max(26, H * 0.04), 'BULLPEN', team.colors.main);
  ctx.save(); ctx.fillStyle = 'rgba(255,210,63,.95)'; ctx.font = `800 ${Math.max(10, H * 0.014)}px system-ui,sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('— PRACTICE —', W / 2, H * 0.045 + Math.max(26, H * 0.04) + Math.max(14, H * 0.022)); ctx.restore();
}

// 그림을 화면에 놓을 자리: 꽉 채우는 크기 × zoom, 그림 속 기준점(fx, fy)을 화면의 (tx, ty)에 맞추되 빈틈이 생기지 않게 민다
export function practiceImageRect(iw, ih, W, H, fit, tx, ty) {
  const s = Math.max(W / iw, H / ih) * (fit ? fit.zoom : 1), w = iw * s, h = ih * s;
  if (!fit) return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v));
  return { x: clamp(tx - fit.fx * w, W - w), y: clamp(ty - fit.fy * h, H - h), w, h };
}

// c: buildBackdrop이 만든 캐시 캔버스(그 위에 덧그린다). kind: 'bat'(타격 연습) | 'pitch'(투구 연습). V: 시점(기준점 위치)
export function decoratePractice(c, kind, W, H, dpr, team, V) {
  load();
  const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const art = IMG[kind];
  if (art) {                                                       // 직접 만든 배경 그림이 있으면 화면 전체를 그걸로
    // 기준점: 타격 시점은 투수 발(투수판), 투구 시점은 홈플레이트 가운데(stadium.js가 feetY+2에 깊이 12로 그린다)
    const [tx, ty] = !V ? [W / 2, H / 2] : V.kind === 'catcher' ? [V.pitX, V.pitY] : [V.cx, V.feetY + 8];
    const r = practiceImageRect(art.img.width, art.img.height, W, H, art.fit, tx, ty);
    ctx.drawImage(art.img, r.x, r.y, r.w, r.h);
  } else if (kind === 'bat') cage(ctx, W, H, team);
  else bullpen(ctx, W, H, team);
  c.ready = c.ready && practiceArtSettled();
  return c;
}
