// 3D 타구 화면: playscript 대본을 중계 카메라처럼 그린다.
// 경기장·공·선수를 3D 좌표(피트)로 두고, 홈 뒤 높은 곳의 카메라가 공과 수비수를 따라 돌고 당겨서(줌) 비춘다.
import { toSec, trackAt, ballAt, fenceAt, BASES, polar, FENCE_H, jumpZ } from './playscript.js';
import { standsImage, groundTexture } from './stadium.js';
import { drawBall } from './figures.js';
import { fieldSprite, fieldCount, FIELD_PX } from './sprites.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const NEAR = 3;

// ── 경기장 모양(한 번만 계산) ──
const S2 = Math.SQRT1_2, OFF = 42, RB = 150;          // RB = 홈 뒤 파울 지역(카메라가 그 안쪽 높은 곳에 있다)
const poleL = polar(-45, fenceAt(-45)), poleR = polar(45, fenceAt(45));
const nL = [-S2, -S2], nR = [S2, -S2];
const AL = [poleL[0] + nL[0] * OFF, poleL[1] + nL[1] * OFF], AR = [poleR[0] + nR[0] * OFF, poleR[1] + nR[1] * OFF];
const sb = Math.sqrt(RB * RB - OFF * OFF);
const BL = [-S2 * sb + nL[0] * OFF, S2 * sb + nL[1] * OFF], BR = [S2 * sb + nR[0] * OFF, S2 * sb + nR[1] * OFF];
const aBL = Math.atan2(BL[0], BL[1]) * 180 / Math.PI;     // ≈ -90
const range = (a, b, step) => { const n = Math.max(1, Math.round(Math.abs(b - a) / step)), out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; };
const FENCE = range(-45, 45, 2.5).map(a => polar(a, fenceAt(a)));
const BACK = range(aBL, -360 - aBL, 6).map(a => polar(a, RB));
const RING = [poleL, AL, ...BACK, AR, poleR, ...FENCE.slice().reverse()];
const FAIR = [[0, 0], ...FENCE];
const OUTER = [poleL, [-800, poleL[1]], [-800, -500], [800, -500], [800, poleR[1]], poleR];
const circle = (cx, cy, r, n = 40) => range(0, 360, 360 / n).slice(0, -1).map(a => [cx + Math.sin(a * Math.PI / 180) * r, cy + Math.cos(a * Math.PI / 180) * r]);
const DIRT = circle(0, 60.5, 95, 56);
const INGRASS = [[0, 12], [53, 64], [0, 116], [-53, 64]];
const TRACK = [...range(-45, 45, 2.5).map(a => polar(a, fenceAt(a) - 15)), ...FENCE.slice().reverse()];
const quadLine = (a, b, w) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l * w / 2, ny = dx / l * w / 2; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]; };
const LINES = [quadLine([0, 0], poleL, 0.55), quadLine([0, 0], poleR, 0.55)];
const baseSq = ([x, y], r = 1.1) => [[x + r, y], [x, y + r], [x - r, y], [x, y - r]];
const PLATE = [[-0.71, 0.71], [0.71, 0.71], [0.71, 0], [0, -0.71], [-0.71, 0]];
const BOX = s => [[s * 1.2, -3], [s * 5.2, -3], [s * 5.2, 3], [s * 1.2, 3]];
// 벽: [시작, 끝, 높이]
const WALLS = [];
for (let i = 0; i < FENCE.length - 1; i++) WALLS.push([FENCE[i], FENCE[i + 1], FENCE_H, 'fence']);
WALLS.push([poleL, AL, FENCE_H, 'side'], [AL, BL, 5, 'side'], [BR, AR, 5, 'side'], [AR, poleR, FENCE_H, 'side']);
// 홈 뒤 둥근 관중석 앞 낮은 벽(관중석 아랫단 앞이 5피트 떠 있어서, 카메라 가까이에선 그 틈으로 바깥이 보였다)
for (const sg of [-1, 1]) {
  const B = sg < 0 ? BL : BR, aB = Math.atan2(B[0], B[1]) * 180 / Math.PI, arc = range(aB, sg * 150, 6).map(a => polar(a, RB + 0.5));
  for (let i = 0; i < arc.length - 1; i++) WALLS.push([arc[i], arc[i + 1], 5, 'side']);
}

// ── 카메라 ──
function makeCam(C, T, F, W, H) {
  const f = norm(sub(T, C)), r = norm([f[1], -f[0], 0]);
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { C, f, r, u, F, cx: W / 2, cy: H * 0.5, W, H };
}
const toCam = (K, p) => { const d = sub(p, K.C); return [dot(d, K.r), dot(d, K.u), dot(d, K.f)]; };
const camToScreen = (K, c) => [K.cx + c[0] / c[2] * K.F, K.cy - c[1] / c[2] * K.F];
export function project(K, p) {
  const c = toCam(K, p);
  if (c[2] < NEAR) return null;
  return { x: K.cx + c[0] / c[2] * K.F, y: K.cy - c[1] / c[2] * K.F, s: K.F / c[2], d: c[2] };
}
// 가까운 면 뒤로 넘어간 부분을 잘라낸 다각형 경로
function polyPath(ctx, K, pts, z = 0) {
  const cs = pts.map(p => toCam(K, p.length === 3 ? p : [p[0], p[1], z]));
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR]); }
  }
  if (out.length < 3) return false;
  ctx.beginPath();
  out.forEach((c, i) => { const [x, y] = camToScreen(K, c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  return true;
}
function fillPoly(ctx, K, pts, color, z = 0) { if (polyPath(ctx, K, pts, z)) { ctx.fillStyle = color; ctx.fill(); } }

// 관심 대상(공 + 지금 중요한 선수)을 모두 담는 중심과 폭
const START = { c: [0, 120, 0], span: 230 };
function frameAt(sc, t) {
  if (t < 0.15) return START;
  const pts = [];
  if (!(t > sc.ballUntil)) { const b = ballAt(sc, t).p; pts.push([b[0], b[1], Math.min(b[2], 140)]); }
  for (const w of sc.watch) {
    if (t < w.t0 || t > w.t1) continue;
    const k = w.kind === 'f' ? trackAt(sc.fielders[w.id], t) : trackAt(sc.runners[w.id].keys, t);
    pts.push([k.x, k.y, 3]);
  }
  if (!pts.length) return START;
  const c = [0, 0, 0];
  pts.forEach(p => { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; });
  let r = 0;
  pts.forEach(p => { r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]), Math.abs(p[2] - c[2]) * 1.4); });
  return { c, span: clamp(r * 2.6 + 50, 80, 420) };
}
export function cameraAt(sc, t, W, H) {
  // 지난 0.6초를 평균해서 부드럽게 따라간다
  const c = [0, 0, 0]; let span = 0, ws = 0;
  for (let i = 0; i < 12; i++) {
    const w = 1 - i / 12, fr = frameAt(sc, t - i * 0.05);
    c[0] += fr.c[0] * w; c[1] += fr.c[1] * w; c[2] += fr.c[2] * w; span += fr.span * w; ws += w;
  }
  c[0] /= ws; c[1] /= ws; c[2] /= ws; span /= ws;
  const C = [c[0] * 0.3, -135, 62];
  const T = [c[0], c[1], c[2] * 0.75];
  const dist = Math.hypot(T[0] - C[0], T[1] - C[1], T[2] - C[2]);
  return makeCam(C, T, Math.min(W, H * 0.75) * dist / span, W, H);
}

// ── 배경 ──
function drawSky(ctx, K) {
  const g = ctx.createLinearGradient(0, 0, 0, K.H);
  g.addColorStop(0, '#4b98e6'); g.addColorStop(0.45, '#5ea5ea'); g.addColorStop(1, '#b9dcf6');   // 관중석 그림 윗부분 하늘색에 맞춤
  ctx.fillStyle = g; ctx.fillRect(0, 0, K.W, K.H);
}
// 그림 속 삼각형(u,v)을 화면 삼각형(x,y)에 붙인다(경계를 살짝 넓혀 이음새가 안 보이게)
function imgTri(ctx, img, s0, s1, s2, d0, d1, d2) {
  const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3, grow = p => {
    const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1; return [p.x + dx / l * 0.7, p.y + dy / l * 0.7];
  };
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...grow(d0)); ctx.lineTo(...grow(d1)); ctx.lineTo(...grow(d2)); ctx.closePath(); ctx.clip();
  // (u,v) → (x,y) 아핀 변환 풀기
  const du1 = s1[0] - s0[0], dv1 = s1[1] - s0[1], du2 = s2[0] - s0[0], dv2 = s2[1] - s0[1];
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) > 1e-9) {
    const dx1 = d1.x - d0.x, dy1 = d1.y - d0.y, dx2 = d2.x - d0.x, dy2 = d2.y - d0.y;
    const a = (dx1 * dv2 - dx2 * dv1) / det, b = (dy1 * dv2 - dy2 * dv1) / det;
    const c = (dx2 * du1 - dx1 * du2) / det, d = (dy2 * du1 - dy1 * du2) / det;
    ctx.transform(a, b, c, d, d0.x - a * s0[0] - c * s0[1], d0.y - b * s0[0] - d * s0[1]);
    const ux = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 4)), vy = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 4));
    const uw = Math.min(img.width, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 4)) - ux, vh = Math.min(img.height, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 4)) - vy;
    if (uw > 0 && vh > 0) ctx.drawImage(img, ux, vy, uw, vh, ux, vy, uw, vh);   // 필요한 부분만
  }
  ctx.restore();
}
// 그림 사각형 영역(u0..u1, v0..v1)을 화면 사각형(위 왼/오, 아래 왼/오)에 삼각형 두 개로
function imgQuad(ctx, img, u0, u1, v0, v1, tl, tr, bl, br) {
  imgTri(ctx, img, [u0, v0], [u1, v0], [u0, v1], tl, tr, bl);
  imgTri(ctx, img, [u1, v0], [u1, v1], [u0, v1], tr, br, bl);
}
// 3D 사각형(위 왼, 위 오, 아래 오, 아래 왼)에 그림 영역을 붙인다. 카메라 가까운 면 뒤로 넘어간 부분은 잘라 내고 나머지를 그린다
// (예전엔 한 점이라도 카메라 뒤면 통째로 건너뛰어서, 카메라 옆 관중석이 뚝 잘려 판자처럼 떠 보였다)
function texQuad3(ctx, K, img, P, UV, color) {
  const cs = P.map(p => toCam(K, p)), out = [];
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4], ua = UV[i], ub = UV[(i + 1) % 4], ina = a[2] >= NEAR, inb = b[2] >= NEAR;
    if (ina) out.push([a, ua]);
    if (ina !== inb) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([[lerp(a[0], b[0], t), lerp(a[1], b[1], t), NEAR], [lerp(ua[0], ub[0], t), lerp(ua[1], ub[1], t)]]);
    }
  }
  if (out.length < 3) return;
  const sp = out.map(([c]) => { const [x, y] = camToScreen(K, c); return { x, y }; });
  if (offscreen(K, sp)) return;
  if (!img) { quadFill(ctx, sp, color); return; }
  for (let i = 1; i < out.length - 1; i++) imgTri(ctx, img, out[0][1], out[i][1], out[i + 1][1], sp[0], sp[i], sp[i + 1]);
}
const quadFill = (ctx, ps, color) => { ctx.fillStyle = color; ctx.beginPath(); ps.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); };
const offscreen = (K, ps) => ps.every(p => p.x < -50) || ps.every(p => p.x > K.W + 50) || ps.every(p => p.y < -50) || ps.every(p => p.y > K.H + 50);
const SPAN_A = 54;                                        // 외야 관중석 그림이 덮는 각도(±), 폴 옆 꺾인 곳까지
const DEP = 175, HT = 215, ROW = 675;                     // 관중석: 바깥으로 DEP, 펜스 위로 HT 만큼 올라가는 경사면 / 그림에서 쓰는 높이
// 파울 지역 옆 관중석: 아랫단(b)·바깥 방향(o)·단면(pr: [바깥 거리, 높이] 세 점 = 아래층·위층)·위아래층 경계의 그림 높이(v)·그림 가로 위치(u, 0..1).
// 외야 관중석 끝에서 시작해 바깥 방향을 파울 쪽 벽에 수직으로 서서히 돌리고, 그림은 끝에서 거울처럼 되짚어 이어 붙인다.
// 중계 카메라(홈 뒤 62피트)는 파울 쪽 벽을 늘인 선보다 바깥에 있어서, 외야처럼 가파르면 경사면 뒤쪽이 보인다(= 안 그려져 하늘이 뚫림).
// 그래서 아래층은 완만하게 멀리 깔고(카메라가 위에서 내려다본다), 그 뒤에 위층을 가파르게 세운다
const SIDE = (() => {
  const out = {}, ftU = 1 / (2 * SPAN_A * Math.PI / 180 * (fenceAt(SPAN_A) + 1));   // 외야 그림 1피트 = 그림 가로의 몇 배
  const sm = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  for (const sg of [-1, 1]) {
    const A = sg < 0 ? AL : AR, B = sg < 0 ? BL : BR, nrm = sg < 0 ? nL : nR;
    const Q = polar(sg * SPAN_A, fenceAt(sg * SPAN_A) + 1);
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    const off0 = (Q[0] - A[0]) * nrm[0] + (Q[1] - A[1]) * nrm[1];        // 외야 끝이 파울 쪽 벽에서 바깥으로 떨어진 거리
    const aEnd = Math.atan2(nrm[0], nrm[1]) * 180 / Math.PI;
    const pts = [];
    for (const t of range(0, L, 12)) {
      const k = sm(t / 90), off = off0 + (0.5 - off0) * k, ang = sg * SPAN_A + (aEnd - sg * SPAN_A) * k;
      const b = [Q[0] + d[0] * t + nrm[0] * (off - off0), Q[1] + d[1] * t + nrm[1] * (off - off0)];
      const u = t * ftU;
      const pr = [[0, lerp(FENCE_H, 5, k)], [lerp(DEP / 2, 150, k), lerp(FENCE_H + HT / 2, 60, k)], [lerp(DEP, 260, k), FENCE_H + HT]];
      pts.push({ b, o: polar(ang, 1), pr, v: lerp(ROW / 2, 440, k), u: sg < 0 ? u : 1 - u });
    }
    // 홈 뒤 둥근 벽을 따라 카메라 옆까지 더 이어 간다(카메라가 왼쪽·오른쪽 끝을 비출 때 홈 뒤가 텅 비어 보이지 않게)
    const aB = Math.atan2(B[0], B[1]) * 180 / Math.PI, side = pts[pts.length - 1].pr;
    let u = L * ftU;
    for (const a of range(aB, sg * 150, 6).slice(1)) {
      const b = polar(a, RB + 0.5), last = pts[pts.length - 1].b;
      u += Math.hypot(b[0] - last[0], b[1] - last[1]) * ftU;
      pts.push({ b, o: polar(a, 1), pr: side, v: 440, u: sg < 0 ? u % 1 : 1 - u % 1 });
    }
    out[sg] = pts;
  }
  return out;
})();
function drawStands(ctx, K, crowdTint) {
  const img = standsImage('field');
  // 외야: 관중석 그림을 펜스 뒤에 빙 둘러 세운다
  const step = 2;
  for (let a = -SPAN_A; a < SPAN_A - 0.01; a += step) {
    const a1 = a + step;
    const R0 = fenceAt(a) + 1, R1 = fenceAt(a1) + 1;
    const tl = project(K, [...polar(a, R0 + DEP), FENCE_H + HT]), tr = project(K, [...polar(a1, R1 + DEP), FENCE_H + HT]);
    const bl = project(K, [...polar(a, R0), FENCE_H]), br = project(K, [...polar(a1, R1), FENCE_H]);
    if (!tl || !tr || !bl || !br || offscreen(K, [tl, tr, bl, br])) continue;
    if (!img) quadFill(ctx, [tl, tr, br, bl], crowdTint);
    else imgQuad(ctx, img, (a + SPAN_A) / (2 * SPAN_A) * img.width, (a1 + SPAN_A) / (2 * SPAN_A) * img.width, 0, ROW, tl, tr, bl, br);
  }
  // 파울 지역 옆 관중석: 외야 관중석 끝(폴 옆 꺾인 곳)에서 같은 높이·경사로 홈 쪽까지 이어 붙인다.
  // (예전엔 낮은 관중석만 따로 두어서, 좌중간·우중간을 비추면 그 위로 하늘이 뚫려 관중석 조각이 떠 보였다)
  // 먼 위층을 먼저, 가까운 아래층을 나중에 그린다
  for (const layer of [1, 0]) for (const sg of [-1, 1]) {
    const pts = SIDE[sg];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const at = (q, j) => { const [o, z] = q.pr[j]; return [q.b[0] + q.o[0] * o, q.b[1] + q.o[1] * o, z]; };
      // 카메라가 이 경사면 뒤쪽(아래)에 있으면 그리지 않는다
      const lo = at(p0, layer), hi = at(p0, layer + 1), run = p0.pr[layer + 1][0] - p0.pr[layer][0], rise = hi[2] - lo[2];
      const n = [-p0.o[0] * rise, -p0.o[1] * rise, run];
      if ((K.C[0] - lo[0]) * n[0] + (K.C[1] - lo[1]) * n[1] + (K.C[2] - lo[2]) * n[2] < 0) continue;
      // 위아래로 몇 조각 나눠 그린다(가까이서 크게 보일 때 그림이 덜 일그러지게)
      const T0 = at(p0, layer + 1), T1 = at(p1, layer + 1), B0 = at(p0, layer), B1 = at(p1, layer);
      const u0 = p0.u * (img ? img.width : 1), u1 = p1.u * (img ? img.width : 1), v0 = layer ? 0 : p0.v, v1 = layer ? p0.v : ROW;
      const N = 3, mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
      for (let j = 0; j < N; j++) {
        const k0 = j / N, k1 = (j + 1) / N, va = lerp(v0, v1, k0), vb = lerp(v0, v1, k1);
        texQuad3(ctx, K, img, [mix(T0, B0, k0), mix(T1, B1, k0), mix(T1, B1, k1), mix(T0, B0, k1)], [[u0, va], [u1, va], [u1, vb], [u0, vb]], crowdTint);
      }
    }
  }
}
// 카메라 가까운 쪽 관중석: 아래층 관중 그림을 무늬로 깔고, 카메라를 따라 움직이게 한다
let crowdPat = null;
function drawOuter(ctx, K) {
  const img = standsImage('field');
  if (img && !crowdPat) {
    const c = document.createElement('canvas'); c.width = Math.round(img.width * 0.35); c.height = Math.round(235 * 0.35);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 440, img.width, 235, 0, 0, c.width, c.height);
    x.fillStyle = 'rgba(14,20,32,.35)'; x.fillRect(0, 0, c.width, c.height);   // 조금 어둡게
    crowdPat = ctx.createPattern(c, 'repeat');
  }
  if (!polyPath(ctx, K, OUTER)) return;
  if (crowdPat) {
    const a = project(K, [0, -60, 0]);
    if (a && crowdPat.setTransform) crowdPat.setTransform(new DOMMatrix([1, 0, 0, 1, a.x, a.y]));
    ctx.fillStyle = crowdPat;
  } else ctx.fillStyle = '#2c333f';
  ctx.fill();
}
// 사진에서 뽑은 잔디·흙 결을 바닥에 입힌다: 바닥을 칸으로 나눠 칸마다 무늬를 원근(아핀)에 맞춰 overlay로 칠한다.
// 아주 멀어서 무늬가 자글거릴 칸은 점점 흐리게, 카메라 뒤로 넘어간 칸은 건너뛴다
const CELL = 45, TEX_FT = 55;                             // 칸 크기(피트), 무늬 한 장(512px)이 덮는 길이(피트)
function groundGrain(ctx, K, k, clipPts, x0, x1, y0, y1, alpha) {
  const img = groundTexture(k);
  if (!img || !polyPath(ctx, K, clipPts)) return;
  ctx.save(); ctx.clip(); ctx.globalCompositeOperation = 'overlay';
  const pat = ctx.createPattern(img, 'repeat'), tp = 512 / TEX_FT;
  if (!pat.setTransform) { ctx.restore(); return; }
  for (let x = x0; x < x1; x += CELL) for (let y = y0; y < y1; y += CELL) {
    const a = project(K, [x, y, 0]), b = project(K, [x + CELL, y, 0]), c = project(K, [x, y + CELL, 0]), d = project(K, [x + CELL, y + CELL, 0]);
    if (!a || !b || !c || !d || offscreen(K, [a, b, c, d])) continue;
    const du = CELL * tp, m = new DOMMatrix([(b.x - a.x) / du, (b.y - a.y) / du, (c.x - a.x) / du, (c.y - a.y) / du, 0, 0]);
    const px = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));      // 무늬 한 칸이 화면에서 몇 픽셀인지
    const f = Math.min(1, Math.max(0, (px - 0.12) / 0.3));
    if (f <= 0) continue;
    m.e = a.x - m.a * x * tp - m.c * y * tp; m.f = a.y - m.b * x * tp - m.d * y * tp;
    pat.setTransform(m);
    ctx.globalAlpha = alpha * f; ctx.fillStyle = pat;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(c.x, c.y); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawGround(ctx, K, bases) {
  fillPoly(ctx, K, RING, '#3a8a45');
  // 잔디 깎은 무늬(페어 지역만)
  if (polyPath(ctx, K, FAIR)) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let y = 0; y < 430; y += 30) if (polyPath(ctx, K, [[-450, y], [450, y], [450, y + 15], [-450, y + 15]])) ctx.fill();
    ctx.fillStyle = 'rgba(0,30,0,.06)';
    for (let x = -330; x < 330; x += 30) if (polyPath(ctx, K, [[x, 0], [x + 15, 0], [x + 15, 430], [x, 430]])) ctx.fill();
    ctx.restore();
  }
  groundGrain(ctx, K, 'grass_tex', RING, -450, 450, -90, 450, 0.65);   // 흙은 그 위에 덮어 칠한다
  fillPoly(ctx, K, TRACK, '#a07a52');
  fillPoly(ctx, K, DIRT, '#b98a5e');
  groundGrain(ctx, K, 'dirt_tex', DIRT, -100, 100, -40, 160, 0.8);
  groundGrain(ctx, K, 'dirt_tex', TRACK, -450, 450, 150, 450, 0.8);
  fillPoly(ctx, K, INGRASS, '#3f9049');
  groundGrain(ctx, K, 'grass_tex', INGRASS, -60, 60, 10, 120, 0.65);
  fillPoly(ctx, K, circle(0, 60.5, 9, 20), '#c2946a');
  fillPoly(ctx, K, circle(0, 0, 13, 24), '#b98a5e');
  LINES.forEach(q => fillPoly(ctx, K, q, 'rgba(255,255,255,.92)', 0.02));
  for (const s of [-1, 1]) if (polyPath(ctx, K, BOX(s), 0.02)) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.stroke(); }
  fillPoly(ctx, K, [[-1, 60.3], [1, 60.3], [1, 60.8], [-1, 60.8]], '#fff', 0.3);
  fillPoly(ctx, K, PLATE, '#f5f5f0', 0.05);
  [1, 2, 3].forEach(i => fillPoly(ctx, K, baseSq(BASES[i]), bases && bases[i - 1] ? '#ffe27a' : '#fbfbf6', 0.25));
}
function drawPoles(ctx, K) {                              // 펜스 위 노란 줄(관중석 아랫단이 덮지 않게 다시) + 파울 폴
  ctx.strokeStyle = '#f1c40f';
  for (const [a, b, h, kind] of WALLS) {
    if (kind !== 'fence') continue;
    const t0 = project(K, [a[0], a[1], h]), t1 = project(K, [b[0], b[1], h]);
    if (t0 && t1) { ctx.lineWidth = Math.max(1, t0.s * 0.35); ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke(); }
  }
  for (const p of [poleL, poleR]) {
    const a = project(K, [p[0], p[1], 0]), b = project(K, [p[0], p[1], 85]);
    if (a && b) { ctx.strokeStyle = '#f5d33b'; ctx.lineWidth = Math.max(1.5, a.s * 0.8); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  }
}
function drawWalls(ctx, K) {
  for (const [a, b, h, kind] of WALLS) {
    const pts = [[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h], [a[0], a[1], h]];
    if (!polyPath(ctx, K, pts)) continue;
    ctx.fillStyle = kind === 'fence' ? '#1d5a35' : '#24463a'; ctx.fill();
    const t0 = project(K, [a[0], a[1], h]), t1 = project(K, [b[0], b[1], h]);
    if (t0 && t1) { ctx.strokeStyle = kind === 'fence' ? '#f1c40f' : '#d9dde3'; ctx.lineWidth = Math.max(1, t0.s * 0.35); ctx.beginPath(); ctx.moveTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.stroke(); }
  }
  // 펜스 거리 표시
  ctx.textAlign = 'center';
  for (const [a, label] of [[-45, '99'], [-22, '107'], [0, '122'], [22, '107'], [45, '99']]) {
    const p = polar(a, fenceAt(a) - 0.5), q = project(K, [p[0], p[1], FENCE_H * 0.5]);
    if (!q || q.s < 0.6) continue;
    ctx.font = `800 ${Math.round(q.s * 4)}px system-ui,sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(label, q.x, q.y + q.s * 1.5);
  }
  ctx.textAlign = 'left';
}
function shadow(ctx, K, x, y, r, alpha) {
  const c = project(K, [x, y, 0]), e = project(K, [x, y + r, 0]);
  if (!c || !e) return;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.beginPath();
  ctx.ellipse(c.x, c.y, r * c.s, Math.max(1, Math.abs(e.y - c.y)), 0, 0, Math.PI * 2); ctx.fill();
}

// ── 선수(코드로 그린 작은 사람) ──
// 관절 좌표(피트, x = 진행/바라보는 방향이 +, y = 위)
function poseOf(act, ph, since) {
  const P = { hip: [0, 3.1], neck: [0, 5.2], kn: [[-0.35, 1.6], [0.35, 1.6]], ft: [[-0.45, 0], [0.45, 0]], el: [[-0.75, 4.3], [0.75, 4.3]], hd: [[-0.8, 3.4], [0.8, 3.4]], side: false };
  switch (act) {
    case 'ready': case 'set': case 'lead':
      return { ...P, hip: [0, 2.6], neck: [0.25, 4.6], kn: [[-0.8, 1.45], [0.8, 1.45]], ft: [[-1, 0], [1, 0]], el: [[-0.7, 3.6], [0.7, 3.6]], hd: [[-0.4, 2.9], [0.45, 2.9]] };
    case 'crouch':
      return { ...P, hip: [0, 1.7], neck: [0.2, 3.8], kn: [[-0.95, 1.6], [0.95, 1.6]], ft: [[-0.85, 0], [0.85, 0]], el: [[-0.6, 3], [0.7, 3]], hd: [[-0.3, 2.6], [0.6, 3.1]] };
    case 'field':
      return { ...P, side: true, hip: [-0.3, 2.2], neck: [0.9, 3.6], kn: [[-1.0, 1.3], [0.9, 1.2]], ft: [[-1.4, 0], [1.2, 0]], el: [[0.9, 2.2], [1.3, 2.4]], hd: [[1.4, 0.5], [1.6, 0.6]] };
    case 'catch': case 'jump':
      return { ...P, el: [[-0.45, 5.7], [0.55, 5.7]], hd: [[-0.2, 6.6], [0.35, 6.7]] };
    case 'camp': case 'watch':
      return { ...P, el: [[-0.7, 4.3], [0.6, 5.0]], hd: [[-0.8, 3.4], [0.45, 5.8]] };
    case 'receive':
      return { ...P, side: true, kn: [[-0.4, 1.6], [0.6, 1.6]], ft: [[-0.7, 0], [0.9, 0]], el: [[0.6, 4.6], [0.9, 4.8]], hd: [[1.3, 4.8], [1.5, 5.0]] };
    case 'throw': {
      const k = clamp(since / 0.35, 0, 1);
      return { ...P, side: true, hip: [0, 2.9], neck: [lerp(-0.5, 0.9, k), 5.0], kn: [[-0.9, 1.4], [1.0, 1.5]], ft: [[-1.5, 0], [1.4, 0]],
        el: [[lerp(-1.2, 0.6, k), lerp(5.2, 4.2, k)], [0.9, 4.5]], hd: [[lerp(-2.0, 1.6, k), lerp(5.6, 3.4, k)], [lerp(1.3, 0.2, k), lerp(4.6, 3.6, k)]] };
    }
    case 'dive':
      return { ...P, side: true, hip: [-0.4, 1.0], neck: [1.9, 1.5], kn: [[-1.6, 0.9], [-1.4, 1.2]], ft: [[-2.8, 0.7], [-2.6, 1.3]], el: [[2.6, 1.7], [2.7, 1.4]], hd: [[3.5, 1.6], [3.6, 1.3]] };
    case 'bat':
      return { ...P, side: true, hip: [0, 3.0], neck: [0.2, 5.1], kn: [[-0.9, 1.5], [0.8, 1.5]], ft: [[-1.1, 0], [1.1, 0]], el: [[-0.6, 4.6], [-0.2, 4.4]], hd: [[-0.6, 5.1], [-0.5, 5.0]], bat: true };
    case 'run': case 'drop': {
      const legs = [0, Math.PI].map(o => {
        const p = ph + o, th = 0.75 * Math.sin(p), bend = 0.25 + 1.1 * Math.max(0, Math.cos(p));
        const kn = [Math.sin(th) * 1.5, 3.1 - Math.cos(th) * 1.5];
        return [kn, [kn[0] + Math.sin(th - bend) * 1.5, kn[1] - Math.cos(th - bend) * 1.5]];
      });
      const lift = 0.15 * Math.abs(Math.cos(ph)), arms = [0, Math.PI].map(o => {
        const a = -0.8 * Math.sin(ph + o), el = [0.5 + Math.sin(a) * 1.0, 4.9 - Math.cos(a) * 1.0];
        return [el, [el[0] + Math.sin(a + 1.4) * 0.9, el[1] - Math.cos(a + 1.4) * 0.9]];
      });
      return { side: true, hip: [0, 3.1 + lift], neck: [0.55, 5.2 + lift], kn: legs.map(l => [l[0][0], l[0][1] + lift]), ft: legs.map(l => [l[1][0], l[1][1] + lift]), el: arms.map(a => a[0]), hd: arms.map(a => a[1]) };
    }
    default: return P;
  }
}
const SKIN = '#e2b38c';
function drawPerson(ctx, x, y, s, u, act, ph, since, dir, helmet, glove) {
  const P = poseOf(act, ph, since);
  const fx = P.side ? dir : 1;
  const X = p => x + p[0] * s * fx, Y = p => y - p[1] * s;
  const line = (a, b, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w * s; ctx.beginPath(); ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); ctx.stroke(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sh = [P.neck[0], P.neck[1] - 0.25];
  const limbs = (k, out) => {
    const o = out ? 0.16 : 0;
    line(P.hip, P.kn[k], 0.5 + o, out ? '#1a1d26' : u.pants); line(P.kn[k], P.ft[k], 0.42 + o, out ? '#1a1d26' : u.pants);
    if (!out) { line([lerp(P.kn[k][0], P.ft[k][0], 0.45), lerp(P.kn[k][1], P.ft[k][1], 0.45)], P.ft[k], 0.4, u.sock); line(P.ft[k], [P.ft[k][0] + 0.35, P.ft[k][1]], 0.32, '#22252c'); }
  };
  const arm = (k, out) => { const o = out ? 0.16 : 0; line(sh, P.el[k], 0.36 + o, out ? '#1a1d26' : u.sleeve); line(P.el[k], P.hd[k], 0.3 + o, out ? '#1a1d26' : SKIN); };
  // 외곽선 → 먼 쪽 팔다리 → 몸 → 가까운 쪽
  for (const out of [true, false]) {
    limbs(0, out); arm(0, out);
    line(P.hip, P.neck, 1.15 + (out ? 0.16 : 0), out ? '#1a1d26' : u.jersey);
    if (!out) line([lerp(P.hip[0], P.neck[0], 0.08), lerp(P.hip[1], P.neck[1], 0.08)], [lerp(P.hip[0], P.neck[0], 0.12), lerp(P.hip[1], P.neck[1], 0.12)], 1.1, u.belt);
    limbs(1, out); arm(1, out);
  }
  if (glove) { ctx.fillStyle = '#8a5a2b'; ctx.beginPath(); ctx.arc(X(P.hd[1]), Y(P.hd[1]), 0.34 * s, 0, Math.PI * 2); ctx.fill(); }
  if (P.bat) { ctx.strokeStyle = '#d6a86c'; ctx.lineWidth = 0.22 * s; ctx.beginPath(); ctx.moveTo(X(P.hd[0]), Y(P.hd[0])); ctx.lineTo(X([P.hd[0][0] - 1.4, P.hd[0][1] + 2.4]), Y([P.hd[0][0] - 1.4, P.hd[0][1] + 2.4])); ctx.stroke(); }
  // 머리 + 모자/헬멧
  const hx = X([P.neck[0] + 0.1, 0]), hy = Y([0, P.neck[1] + 0.55]), hr = 0.36 * s;
  ctx.fillStyle = '#1a1d26'; ctx.beginPath(); ctx.arc(hx, hy, hr + 0.08 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = u.cap; ctx.beginPath(); ctx.arc(hx, hy - hr * 0.15, hr * (helmet ? 1.12 : 1.04), Math.PI, 0); ctx.fill();
  ctx.fillRect(hx + (P.side ? (dir > 0 ? 0 : -hr * 1.5) : -hr * 0.7), hy - hr * 0.25, hr * (P.side ? 1.5 : 1.4), hr * 0.28);
}

// ── 선수 그림(일러스트). 그림이 없으면 false → 코드로 그린 사람 ──
// view = 카메라에서 본 방향: 'front'(카메라 쪽으로 옴), 'back'(멀어짐), 'side'(옆으로). 옆모습은 오른쪽을 보므로 dir < 0이면 뒤집는다
// 후보를 차례로 해 보고 그림이 있는 첫 번째를 쓴다(앞·뒷모습 달리기 그림이 아직 없으면 옆모습으로)
// 기준점: foot = 발 가운데, head = 머리(달릴 땐 머리가 엉덩이보다 앞이라 조금 뒤로), mid = 그림 가운데
// 달리기는 i = 'cyc': 그 묶음의 그림 수로 한 바퀴(ph 2π)를 나눠 고른다
function spriteFor(kind, act, ph, since, view) {
  const running = act === 'run' || act === 'drop';
  if (kind === 'u') return [['ump', 0, 'foot']];
  if (kind === 'r') {
    if (running) return [...(view !== 'side' ? [[`runner_${view}`, 'cyc', 'foot']] : []), ['runner', 'cyc', 'foot', true]];
    if (act === 'slide') return [['rbase', 2, 'mid', true]];
    if (act === 'lead' || act === 'tag') return [['rbase', 1, 'mid', true]];
    if (act === 'bat') return [['runner', 0, 'foot', true]];
    return [['rbase', 0, 'foot', true]];
  }
  if (running) return [...(view !== 'side' ? [[`frun_${view}`, 'cyc', 'foot']] : []), ['frun', 'cyc', 'foot', true]];
  switch (act) {
    case 'throw': return [['fthrow', since < 0.12 ? 0 : since < 0.32 ? 1 : 2, 'mid', true]];
    case 'dive': return [['fthrow', 3, 'mid', true]];
    case 'field': return [['fielder', 1, 'foot']];
    case 'catch': case 'jump': return [...(view === 'back' ? [['fback', 1, 'foot']] : []), ['fielder', 2, 'foot']];
    case 'ready': case 'set': case 'lead': case 'crouch': case 'cover': case 'receive': return [...(view === 'back' ? [['fback', 2, 'foot']] : []), ['fielder', 0, 'foot']];
    default: return [...(view === 'back' ? [['fback', 0, 'foot']] : []), ['fielder', 3, 'foot']];
  }
}
function drawSprite(ctx, x, y, s, u, kind, act, ph, since, dir, view) {
  for (const [set, i0, anchor, side] of spriteFor(kind, act, ph, since, view)) {
    const n = fieldCount(set);
    const i = i0 === 'cyc' ? ((Math.floor(ph / (2 * Math.PI) * n) % n) + n) % n : i0;
    const sp = n && fieldSprite(set, i, u);
    if (!sp) continue;
    const k = s / FIELD_PX, ax = anchor === 'foot' ? sp.ax : anchor === 'head' ? sp.hx - sp.h * 0.1 : sp.w / 2;
    ctx.save();
    ctx.translate(x, y);
    if (side && dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(sp.img, -ax * k, -sp.h * k, sp.w * k, sp.h * k);
    ctx.restore();
    return true;
  }
  return false;
}

// ── 한 장면 그리기 ──
// uni = { field: 수비 팀 유니폼, bat: 공격 팀 유니폼 }, ms = 타구 후 지난 시간
export function drawPlay3D(ctx, W, H, sc, ms, uni) {
  const t = toSec(ms);
  const K = cameraAt(sc, t, W, H);
  drawSky(ctx, K);
  drawOuter(ctx, K);                                     // 경기장 바깥(카메라 쪽 관중석)
  // 관중석은 땅·벽보다 나중에: 카메라(홈 뒤 높은 곳)는 파울 쪽 관중석 안쪽에 있어서 가까운 관중석이 벽·땅을 가린다.
  // 관중석은 모두 펜스·벽 꼭대기보다 높고 바깥이라, 나중에 그려도 땅·벽을 잘못 가리는 일은 없다(폴만 다시 위에)
  drawGround(ctx, K, null);
  drawWalls(ctx, K);
  drawStands(ctx, K, '#5b6a80');
  drawPoles(ctx, K);

  // 선수들
  const ents = [];
  const throwDir = (f, tt) => {                         // 던지거나 받을 때 공이 가는/오는 쪽
    for (const s of sc.ball) {
      if (s.type !== 'throw' || tt < s.t0 - 0.6 || tt > s.t1 + 0.4) continue;
      const a = project(K, [...s.p0.slice(0, 2), 0]), b = project(K, [...s.p1.slice(0, 2), 0]);
      if (a && b) return Math.sign(b.x - a.x) * (Math.hypot(f.x - s.p0[0], f.y - s.p0[1]) < 8 ? 1 : -1) || 1;
    }
    return 1;
  };
  const ballNow = ballAt(sc, t).p;
  // kind: 'f' 수비수, 'r' 주자, 'u' 심판
  const add = (k, u, kind, name) => {
    const p = project(K, [k.x, k.y, k.act === 'jump' ? jumpZ(k.since) : 0]);
    if (!p) return;
    const q = project(K, [k.x + k.vx * 0.1, k.y + k.vy * 0.1, 0]);
    let dir = q && Math.abs(q.x - p.x) > 0.01 ? Math.sign(q.x - p.x) : 1;
    if (k.act === 'throw' || k.act === 'receive') dir = throwDir(k, t);
    if (k.act === 'field' || k.act === 'dive') { const b = project(K, ballAt(sc, t).p); if (b) dir = Math.sign(b.x - p.x) || 1; }
    const speed = Math.hypot(k.vx, k.vy);
    const act = (k.act === 'run' || k.act === 'drop') && speed < 0.5 ? 'stand' : k.act;
    // 카메라에서 선수 쪽으로 향하는 방향과 움직이는 방향의 각도 → 앞/옆/뒷모습
    const ex = k.x - K.C[0], ey = k.y - K.C[1], el = Math.hypot(ex, ey) || 1;
    let view = 'side';
    if (speed >= 0.5) {
      const c = (k.vx * ex + k.vy * ey) / (speed * el);
      view = c > 0.62 ? 'back' : c < -0.62 ? 'front' : 'side';
    } else if (kind === 'f' && (act === 'watch' || act === 'stand' || act === 'catch' || act === 'camp')) {
      // 서서 공을 볼 때: 공이 자기보다 한참 뒤(카메라 반대쪽)에 떠 있으면 등을 보인다
      const bp = ballNow, c = ((bp[0] - k.x) * ex + (bp[1] - k.y) * ey) / el;
      if (c > 25 && bp[2] > 3) view = 'back';
    }
    if (name === 'C' && speed < 0.5) view = 'back';     // 포수는 카메라를 등지고 있다
    ents.push({ d: p.d, x: p.x, y: p.y, s: p.s, wx: k.x, wy: k.y, draw: () => {
      const ph = t * speed / 2.6;
      if (drawSprite(ctx, p.x, p.y, p.s, kind === 'u' ? null : u, kind, act, ph, k.since, dir, view)) return;
      drawPerson(ctx, p.x, p.y, p.s, u, act, ph, k.since, dir, kind === 'r', kind === 'f');
    } });
  };
  for (const n of Object.keys(sc.fielders)) add(trackAt(sc.fielders[n], t), uni.field, 'f', n);
  for (const r of sc.runners) add(trackAt(r.keys, t), uni.bat, 'r');
  add({ x: 0, y: -8, act: 'stand', vx: 0, vy: 0, since: 0 }, { pants: '#3b3f48', sock: '#2a2d34', sleeve: '#1d2a44', jersey: '#1d2a44', belt: '#111', cap: '#151a24' }, 'u');
  for (const e of ents) shadow(ctx, K, e.wx, e.wy, 1.3, 0.28);

  // 공
  const B = ballAt(sc, t), bp = project(K, B.p);
  if (B.p[2] > 0.3) shadow(ctx, K, B.p[0], B.p[1], 0.5, clamp(0.4 - B.p[2] / 300, 0.08, 0.4));
  // 날아가는 타구는 꼬리선을 남긴다(중계 화면처럼)
  const fl = sc.ball.find(s => s.type === 'fly');
  const fade = fl ? clamp(1 - (t - fl.t1 - 1.2) / 0.8, 0, 1) : 0;   // 떨어지고 조금 뒤 꼬리선이 사라진다
  if (fl && t > fl.t0 && fade > 0) {
    const t1 = Math.min(t, fl.t1);
    ctx.lineCap = 'round';
    let prev = null;
    for (let i = 0; i <= 28; i++) {
      const tt = fl.t0 + (t1 - fl.t0) * i / 28, q = project(K, ballAt({ ball: [fl] }, tt).p);
      if (q && prev) { ctx.strokeStyle = `rgba(255,255,255,${(0.08 + 0.4 * i / 28) * fade})`; ctx.lineWidth = Math.max(1, q.s * 0.25); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      prev = q;
    }
  }
  ents.sort((a, b) => b.d - a.d);
  let ballDrawn = false;
  for (const e of ents) {
    if (bp && !B.held && !ballDrawn && bp.d > e.d) { drawBall(ctx, bp.x, bp.y, Math.max(2.2, bp.s * 0.3), ms / 30); ballDrawn = true; }
    e.draw();
  }
  if (bp && !ballDrawn && !B.held) drawBall(ctx, bp.x, bp.y, Math.max(2.2, bp.s * 0.3), ms / 30);

  // 비거리
  const shownAt = sc.landT ?? (sc.fly && sc.outs.length ? sc.outs[0] : null);
  if (shownAt != null && t >= shownAt && sc.distM) {
    ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    const txt = `비거리 ${sc.distM}m`;
    ctx.strokeText(txt, 12, H - 16); ctx.fillStyle = '#eef3fa'; ctx.fillText(txt, 12, H - 16);
  }
  return { decided: ms >= sc.decisiveMs, t };
}
