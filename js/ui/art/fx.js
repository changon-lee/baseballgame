// 사진 느낌 합성(시험 적용): 잔디 질감, 선수 그림자와 조명, 빛 번짐, 필름 입자.
// 새 그림 없이 코드로만 한다. 주소에 ?fx=0 을 붙이면 끄고(?fx=1 로 다시 켠다), 고른 값은 localStorage('fx')에 남는다
let on = true;
try {
  const q = new URLSearchParams(location.search).get('fx');
  if (q != null) localStorage.setItem('fx', q === '0' ? '0' : '1');
  on = localStorage.getItem('fx') !== '0';
} catch { /* 브라우저가 아니면(테스트) 그대로 */ }
export const fxOn = () => on && typeof document !== 'undefined';

// 시간대(stadium.js의 setTimeOfDay가 알려 준다)
const L = { night: false, dusk: 0 };
export function setFxLight(night, dusk) { L.night = night; L.dusk = dusk; }
// tint: 선수 그림 위(머리) → 아래(발) 색 덧입힘 [r,g,b,a]. cast: 땅에 눕는 그림자 [오른쪽으로 기우는 정도, 길이, 진하기]
// 낮은 해 하나(짧고 진한 그림자), 노을은 길고 따뜻하게, 밤은 조명탑 여러 개라 옅은 그림자가 사방으로
const light = () => L.night
  ? { tint: [[40, 58, 110, 0.3], [6, 12, 36, 0.52]], cast: [[-0.85, 0.2, 0.17], [0.85, 0.2, 0.17], [-0.28, 0.3, 0.15], [0.3, 0.3, 0.15]], glow: [0.5, -0.15, '185,205,255', 0.16] }
  : L.dusk
    ? { tint: [[255, 160, 80, 0.16], [60, 34, 60, 0.3]], cast: [[0.95, 0.5, 0.36]], glow: [0.16, 0.02, '255,165,90', 0.24] }
    : { tint: [[255, 236, 196, 0.1], [26, 40, 78, 0.24]], cast: [[0.42, 0.3, 0.4]], glow: [0.1, -0.08, '255,244,214', 0.22] };

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// 매 프레임 쓰는 작업용 캔버스(필요한 만큼만 커진다)
function scratch(slot, w, h) {
  let c = scratch[slot];
  if (!c || c.width < w || c.height < h) c = scratch[slot] = mk(Math.max(w, c ? c.width : 0), Math.max(h, c ? c.height : 0));
  return c;
}

// ── 잔디: 풀잎을 그려 넣은 타일을 멀수록 잘게 깔고, 깎은 줄무늬·얼룩·먼 곳의 뿌연 빛을 얹는다 ──
let mips = null;
function grassMips() {
  if (mips) return mips;
  const n = 256, c = mk(n, n), x = c.getContext('2d'), r = rnd(5);
  x.fillStyle = '#467f35'; x.fillRect(0, 0, n, n);
  x.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const px = r() * n, py = r() * n, len = 3 + r() * 7, lean = (r() - 0.5) * 3.4;
    x.strokeStyle = `hsla(${92 + r() * 30},${36 + r() * 24}%,${24 + r() * 24}%,.55)`; x.lineWidth = 0.8 + r() * 0.9;
    for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {       // 타일 가장자리에서 끊기지 않게
      x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + lean, py + oy - len); x.stroke();
    }
  }
  mips = [c];
  for (let s = n / 2; s >= 16; s /= 2) { const m = mk(s, s); m.getContext('2d').drawImage(mips[mips.length - 1], 0, 0, s, s); mips.push(m); }
  return mips;
}
// 타구 화면(3D)용: 풀잎 타일의 밝기만(128 = 그대로). 땅 색 위에 overlay로 입힌다
let detail = null;
export function grassDetail() {
  if (detail || !fxOn()) return detail;
  const src = grassMips()[0], n = src.width, c = mk(n, n), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, n, n), p = d.data;
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum += p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11;
  const mean = sum / (p.length / 4);
  for (let i = 0; i < p.length; i += 4) { const v = 128 + (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11 - mean) * 1.9; p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0);
  return detail = c;
}
export function paintGrass(ctx, W, H, top, vx, spread) {
  const M = grassMips(), h = H - top, bands = 30;
  ctx.save();
  ctx.fillStyle = '#467f35'; ctx.fillRect(0, top, W, h);
  for (let i = 0; i < bands; i++) {
    const t0 = (i / bands) ** 1.7, t1 = ((i + 1) / bands) ** 1.7, t = (t0 + t1) / 2;
    const s = 0.06 + 1.25 * t;                                               // 가까울수록(아래) 풀잎이 크다
    const lv = Math.max(0, Math.min(M.length - 1, Math.floor(-Math.log2(s)))), k = 2 ** lv;
    const pat = ctx.createPattern(M[lv], 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix().translate(vx, top).scale(s * k, s * k * 0.6));
    ctx.fillStyle = pat; ctx.fillRect(0, top + h * t0, W, h * (t1 - t0) + 1);
  }
  // 깎은 줄무늬(가운데로 모이는 부채꼴 + 가로 띠). 작게 그려 늘려서 가장자리를 부드럽게
  const q = 5, sw = Math.ceil(W / q), sh = Math.ceil(h / q), sc = mk(sw, sh), x = sc.getContext('2d');
  x.scale(1 / q, 1 / q);
  for (let i = -16; i < 16; i++) {
    x.fillStyle = i % 2 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'; x.beginPath();
    x.moveTo(vx + i * spread * 0.1, 0); x.lineTo(vx + (i + 1) * spread * 0.1, 0); x.lineTo(vx + (i + 1) * spread, h); x.lineTo(vx + i * spread, h); x.closePath(); x.fill();
  }
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.3; ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sc, 0, top, W, h);
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, sw, sh); x.scale(1 / q, 1 / q);
  for (let j = 0; j < 14; j++) {
    const y0 = h * (j / 14) ** 2.1, y1 = h * ((j + 1) / 14) ** 2.1;
    x.fillStyle = j % 2 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'; x.fillRect(0, y0, W, y1 - y0);
  }
  ctx.globalAlpha = 0.16; ctx.drawImage(sc, 0, top, W, h);
  // 얼룩: 잔디가 고르지 않게
  const bw = 40, bh = 22, b = mk(bw, bh), bx = b.getContext('2d'), r = rnd(23), d = bx.createImageData(bw, bh);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 150; d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v * 0.9; d.data[i + 3] = 255; }
  bx.putImageData(d, 0, 0);
  ctx.globalAlpha = 0.2; ctx.drawImage(b, 0, top, W, h);
  // 먼 곳은 뿌옇고 밝게, 발밑은 조금 짙게
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const g = ctx.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, 'rgba(214,226,190,.3)'); g.addColorStop(0.3, 'rgba(214,226,190,.08)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,20,0,.16)');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, h);
  ctx.restore();
}

// ── 선수: 시간대 빛을 입혀 그린다(머리 쪽은 햇빛, 다리 쪽은 그늘). img의 sw×sh를 (dx,dy)에 dw×dh로 ──
export function drawLit(ctx, img, sw, sh, dx, dy, dw = sw, dh = sh) {
  if (!fxOn()) { ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh); return; }
  const c = scratch('lit', sw, sh), x = c.getContext('2d'), [a, b] = light().tint;
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, sw, sh); x.drawImage(img, 0, 0, sw, sh);
  x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, 0, sh);
  g.addColorStop(0, `rgba(${a})`); g.addColorStop(0.35, `rgba(${a.slice(0, 3)},0)`); g.addColorStop(0.4, `rgba(${b.slice(0, 3)},0)`); g.addColorStop(1, `rgba(${b})`);
  x.fillStyle = g; x.fillRect(0, 0, sw, sh);
  ctx.drawImage(c, 0, 0, sw, sh, dx, dy, dw, dh);
}
// 땅에 눕는 그림자. 원점 = 발(땅), 위쪽이 -y인 좌표에서 부른다. flip = 지금 좌표의 +x가 화면 오른쪽이면 1, 왼쪽이면 -1
export function castShadow(ctx, img, sw, sh, dx, dy, flip = 1) {
  if (!fxOn()) return;
  const w = Math.max(4, Math.round(sw / 4)), h = Math.max(4, Math.round(sh / 4));   // 작게 떠서 늘리면 가장자리가 흐려진다
  const c = scratch('cast', w, h), x = c.getContext('2d');
  x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h); x.drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#04100a'; x.fillRect(0, 0, w, h);
  const a0 = ctx.globalAlpha;
  for (const [lean, len, a] of light().cast) {
    ctx.save(); ctx.transform(1, 0, -lean * flip, -len, 0, 0); ctx.globalAlpha = a0 * a; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, 0, 0, w, h, dx, dy, sw, sh); ctx.restore();
  }
}

// ── 마무리: 빛 번짐(해·조명 쪽)과 필름 입자. 선수까지 다 그린 뒤, 글자·버튼을 그리기 전에 ──
let grain = null;
export function finishFrame(ctx, W, H, now = 0) {
  if (!fxOn()) return;
  if (!grain) {
    const n = 192; grain = mk(n, n);
    const x = grain.getContext('2d'), d = x.createImageData(n, n), r = rnd(77);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() + r() - 1) * 70; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0);
  }
  const [gx, gy, col, a] = light().glow;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(W * gx, H * gy, 0, W * gx, H * gy, Math.max(W, H) * 0.8);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(0.5, `rgba(${col},${a * 0.25})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.11;
  const k = Math.floor(now / 90), pat = ctx.createPattern(grain, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().translate((k * 71) % 192, (k * 113) % 192));
  ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
