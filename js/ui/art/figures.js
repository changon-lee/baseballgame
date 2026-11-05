// 선수 그림: 관절 리그를 명암·하이라이트·윤곽선이 있는 2D 일러스트로 그린다.
import { toS } from './view.js';

const SKIN = '#e2b38c', SKIN_D = '#bb8762', SKIN_L = '#f0c9a6';
const HAIR = '#231a15';
const INK = 'rgba(18,20,30,.42)';
const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ── 기본 도형 ───────────────────────────────────────────
function limb(ctx, a, b, wa, wb, light, dark, outline = true) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const p1 = [a[0] + nx * wa / 2, a[1] + ny * wa / 2], p2 = [b[0] + nx * wb / 2, b[1] + ny * wb / 2];
  const p3 = [b[0] - nx * wb / 2, b[1] - ny * wb / 2], p4 = [a[0] - nx * wa / 2, a[1] - ny * wa / 2];
  const g = ctx.createLinearGradient(p1[0], p1[1], p4[0], p4[1]);
  g.addColorStop(0, light); g.addColorStop(0.55, light); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  // 사각형과 양끝 원을 따로 채운다(감김 방향이 섞이면 겹친 곳이 구멍이 됨)
  ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3); ctx.lineTo(...p4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(a[0], a[1], wa / 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(b[0], b[1], wb / 2, 0, Math.PI * 2); ctx.fill();
  if (outline) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.moveTo(...p3); ctx.lineTo(...p4); ctx.stroke();
  }
}
function ellipse(ctx, x, y, rx, ry, rot, fill, stroke) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
}
function shadow(ctx, x, y, rx, ry) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, 'rgba(0,0,0,.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.save(); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(x, y * rx / ry, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ── 부위 ───────────────────────────────────────────────
function legPart(ctx, hip, knee, foot, u, dark, toe) {
  const pl = dark ? u.pantsD : u.pants, pd = dark ? shadeMix(u.pantsD, 0.8) : u.pantsD;
  const calf = L(knee, foot, 0.42);
  limb(ctx, hip, knee, 20, 16, pl, pd);
  limb(ctx, knee, calf, 16, 14, pl, pd);
  // 무릎 주름
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(knee[0] - 5, knee[1] - 2); ctx.quadraticCurveTo(knee[0], knee[1] + 3, knee[0] + 5, knee[1] - 1); ctx.stroke();
  // 스타킹
  limb(ctx, calf, foot, 12, 10, dark ? u.sleeveD : u.sock, u.sleeveD);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; // 스타킹 줄
  const s1 = L(calf, foot, 0.25);
  ctx.beginPath(); ctx.arc(s1[0], s1[1], 1.2, 0, Math.PI * 2); ctx.fill();
  // 스파이크
  ctx.save(); ctx.translate(foot[0], foot[1]);
  const g = ctx.createLinearGradient(0, -7, 0, 4); g.addColorStop(0, '#2b2b33'); g.addColorStop(1, '#0c0c10');
  if (toe) {   // 옆모습 신발 (+x 방향 앞코)
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(-8, 4); ctx.quadraticCurveTo(-10, -6, -1, -6); ctx.quadraticCurveTo(10, -5, 15, 1);
    ctx.lineTo(15, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(7, -1); ctx.stroke();
  } else {     // 정면 신발
    ellipse(ctx, 0, 0, 9, 5, 0, g);
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-4, -2.5, 8, 1.2);
  }
  ctx.restore();
}
function shadeMix(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = c => Math.round(Math.max(0, Math.min(255, c * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function armPart(ctx, sh, el, hand, u, dark, handFill) {
  const jl = dark ? u.jerseyD : u.jersey, jd = dark ? shadeMix(u.jerseyD, 0.82) : u.jerseyD;
  const sl = dark ? u.sleeveD : u.sleeve, sd = u.sleeveD;
  const cuff = L(sh, el, 0.5);
  limb(ctx, sh, el, 14, 11.5, sl, sd);           // 언더셔츠 긴팔
  limb(ctx, sh, cuff, 16.5, 14, jl, jd);          // 저지 반팔
  ctx.strokeStyle = u.trim; ctx.lineWidth = 1.6;  // 소매 라인
  const dx = el[0] - sh[0], dy = el[1] - sh[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len * 7, ny = dx / len * 7;
  ctx.beginPath(); ctx.moveTo(cuff[0] + nx, cuff[1] + ny); ctx.lineTo(cuff[0] - nx, cuff[1] - ny); ctx.stroke();
  const wrist = L(el, hand, 0.82);
  limb(ctx, el, wrist, 11.5, 9.5, sl, sd);
  limb(ctx, wrist, hand, 8.5, 8, dark ? SKIN_D : SKIN, SKIN_D);
  ellipse(ctx, hand[0], hand[1], 5.8, 5.4, 0, handFill || (dark ? SKIN_D : SKIN), INK);
}
function torsoPart(ctx, a, b, hip, u, light, frontView) {
  // a,b = 두 어깨, light = 빛이 오는 쪽이 a인지
  const top = Math.min(a[1], b[1]);
  const g = ctx.createLinearGradient(a[0], 0, b[0], 0);
  g.addColorStop(0, light ? u.jerseyL : u.jerseyD); g.addColorStop(0.5, u.jersey); g.addColorStop(1, light ? u.jerseyD : u.jerseyL);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1] - 3);
  ctx.quadraticCurveTo((a[0] + b[0]) / 2, top - 7, b[0], b[1] - 3);
  ctx.quadraticCurveTo(b[0] + 3 * Math.sign(b[0] - a[0]), (b[1] + hip[1]) / 2, hip[0] + 13 * Math.sign(b[0] - a[0] || 1), hip[1] + 2);
  ctx.lineTo(hip[0] - 13 * Math.sign(b[0] - a[0] || 1), hip[1] + 2);
  ctx.quadraticCurveTo(a[0] - 3 * Math.sign(b[0] - a[0]), (a[1] + hip[1]) / 2, a[0], a[1] - 3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.stroke();
  // 주름
  ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(hip[0] - 6, hip[1] - 8); ctx.quadraticCurveTo(hip[0] - 2, hip[1] - 22, hip[0] + 4, hip[1] - 30); ctx.stroke();
  if (frontView) {
    // 단추선 + 단추
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    ctx.strokeStyle = u.trim; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(mx, my - 2); ctx.lineTo(hip[0], hip[1] - 3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 1; i <= 3; i++) { const p = L([mx, my], hip, i / 4.2); ctx.beginPath(); ctx.arc(p[0] + 2, p[1], 1, 0, Math.PI * 2); ctx.fill(); }
    // 목 라인
    ctx.strokeStyle = u.trim; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx - 6, my - 4); ctx.lineTo(mx, my + 4); ctx.lineTo(mx + 6, my - 4); ctx.stroke();
  }
  // 벨트
  ctx.fillStyle = u.belt; ctx.fillRect(hip[0] - 14, hip[1] - 2, 28, 5.5);
  ctx.fillStyle = '#d9d9d9'; ctx.fillRect(hip[0] - 2.5, hip[1] - 1.5, 5, 4.5);
}

// ── 타자 ───────────────────────────────────────────────
export function drawBat(ctx, hands, ang) { bat(ctx, hands, ang); }
function bat(ctx, hands, ang) {
  const d = [Math.cos(ang), Math.sin(ang)];
  const knob = [hands[0] - d[0] * 8, hands[1] - d[1] * 8];
  const mid = [hands[0] + d[0] * 30, hands[1] + d[1] * 30], end = [hands[0] + d[0] * 90, hands[1] + d[1] * 90];
  limb(ctx, knob, mid, 4.4, 5.6, '#d6a86c', '#9c6c36');
  limb(ctx, mid, end, 5.6, 10, '#dcae72', '#a07038');
  ellipse(ctx, knob[0], knob[1], 3.4, 3.4, 0, '#8d5f2e');
  // 광택
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(...L(mid, end, 0.15)); ctx.lineTo(...L(mid, end, 0.9)); ctx.stroke();
}
function batterHead(ctx, P, u) {
  limb(ctx, P.neck, [P.head[0] - 2, P.head[1] + 6], 10, 10, SKIN, SKIN_D);
  const [hx, hy] = P.head;
  // 얼굴 옆모습
  const g = ctx.createLinearGradient(hx - 10, 0, hx + 12, 0); g.addColorStop(0, SKIN_D); g.addColorStop(0.6, SKIN); g.addColorStop(1, SKIN_L);
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(hx - 9, hy - 6);
  ctx.quadraticCurveTo(hx - 10, hy + 10, hx - 2, hy + 13);       // 뒤통수 → 턱 뒤
  ctx.quadraticCurveTo(hx + 7, hy + 14, hx + 9, hy + 8);         // 턱
  ctx.lineTo(hx + 10, hy + 4); ctx.lineTo(hx + 13.5, hy + 1);     // 입 → 코
  ctx.lineTo(hx + 10.5, hy - 3); ctx.quadraticCurveTo(hx + 11, hy - 9, hx + 6, hy - 11);
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
  ellipse(ctx, hx + 6.5, hy - 2.5, 1.5, 1.2, 0, '#2a1d17');                 // 눈
  ctx.strokeStyle = HAIR; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx + 4, hy - 6); ctx.lineTo(hx + 9, hy - 6); ctx.stroke(); // 눈썹
  ctx.strokeStyle = 'rgba(90,40,30,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + 8.5, hy + 7); ctx.lineTo(hx + 11, hy + 6.5); ctx.stroke(); // 입
  // 헬멧
  const hg = ctx.createRadialGradient(hx - 2, hy - 13, 2, hx, hy - 6, 17);
  hg.addColorStop(0, shadeMix(u.cap, 1.6)); hg.addColorStop(0.45, u.cap); hg.addColorStop(1, u.capD);
  ctx.fillStyle = hg; ctx.beginPath();
  ctx.moveTo(hx + 12, hy - 4);
  ctx.quadraticCurveTo(hx + 11, hy - 19, hx - 1, hy - 19);
  ctx.quadraticCurveTo(hx - 14, hy - 18, hx - 13, hy - 2);
  ctx.quadraticCurveTo(hx - 13, hy + 9, hx - 4, hy + 9);           // 귀덮개
  ctx.quadraticCurveTo(hx + 2, hy + 8, hx + 1, hy - 1);
  ctx.lineTo(hx + 12, hy - 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = u.capD; ctx.beginPath(); ctx.moveTo(hx + 10, hy - 5); ctx.quadraticCurveTo(hx + 20, hy - 6, hx + 22, hy - 3); ctx.lineTo(hx + 11, hy - 2); ctx.closePath(); ctx.fill(); // 챙
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(hx - 5, hy + 1, 2.2, 0, Math.PI * 2); ctx.fill(); // 귀 구멍
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(hx - 4, hy - 13, 5, 2.2, -0.35, 0, Math.PI * 2); ctx.fill();
}

export function drawBatter(ctx, { x, y, scale, facing, pose: P, uni: u }) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale);
  shadow(ctx, 8, 2, 58, 10);
  const hipB = [P.hip[0] - 7, P.hip[1]], hipF = [P.hip[0] + 7, P.hip[1]];
  legPart(ctx, hipB, P.bk, P.bf, u, true, 1);
  armPart(ctx, P.bs, P.be, P.hands, u, true, u.batGlove);
  torsoPart(ctx, P.bs, P.fs, P.hip, u, false, false);
  legPart(ctx, hipF, P.fk, P.ff, u, false, 1);
  bat(ctx, P.hands, P.bat);
  armPart(ctx, P.fs, P.fe, P.hands, u, false, u.batGlove);
  batterHead(ctx, P, u);
  ctx.restore();
}

// ── 투수 ───────────────────────────────────────────────
function glove(ctx, p, u, front) {
  ctx.save(); ctx.translate(p[0] + 2, p[1]); ctx.rotate(0.3);
  const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13); g.addColorStop(0, '#b07a43'); g.addColorStop(1, u.gloveD);
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(-9, 8); ctx.quadraticCurveTo(-13, -6, -6, -13); ctx.quadraticCurveTo(0, -16, 6, -12);
  ctx.quadraticCurveTo(12, -6, 10, 6); ctx.quadraticCurveTo(0, 12, -9, 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#3e260f'; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.strokeStyle = 'rgba(60,35,12,.7)'; ctx.lineWidth = 0.9;
  for (let i = -1; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 3.5 - 1, -12); ctx.lineTo(i * 3 - 1, front ? 2 : 4); ctx.stroke(); }
  ctx.restore();
}
function pitcherHead(ctx, P, u, back) {
  limb(ctx, P.neck, P.head, 10, 10, back ? SKIN_D : SKIN, SKIN_D);
  const [hx, hy] = P.head;
  // 귀
  ellipse(ctx, hx - 10.5, hy + 1, 2.5, 4, 0, SKIN_D); ellipse(ctx, hx + 10.5, hy + 1, 2.5, 4, 0, SKIN_D);
  if (back) {
    const g = ctx.createRadialGradient(hx, hy - 2, 2, hx, hy, 12); g.addColorStop(0, '#3a2c24'); g.addColorStop(1, HAIR);
    ellipse(ctx, hx, hy, 10.5, 12, 0, g, INK);
    ctx.fillStyle = SKIN_D; ctx.fillRect(hx - 5, hy + 9, 10, 5);
  } else {
    const g = ctx.createRadialGradient(hx - 3, hy - 2, 1, hx, hy + 2, 13); g.addColorStop(0, SKIN_L); g.addColorStop(0.6, SKIN); g.addColorStop(1, SKIN_D);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(hx - 10, hy - 4);
    ctx.quadraticCurveTo(hx - 10, hy + 9, hx, hy + 13); ctx.quadraticCurveTo(hx + 10, hy + 9, hx + 10, hy - 4);
    ctx.quadraticCurveTo(hx, hy - 12, hx - 10, hy - 4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(hx - 9, hy - 4, 18, 3);               // 챙 그림자
    ellipse(ctx, hx - 4, hy + 1, 1.5, 1.2, 0, '#2a1d17'); ellipse(ctx, hx + 4, hy + 1, 1.5, 1.2, 0, '#2a1d17');
    ctx.strokeStyle = HAIR; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(hx - 6.5, hy - 1.5); ctx.lineTo(hx - 2, hy - 2); ctx.moveTo(hx + 2, hy - 2); ctx.lineTo(hx + 6.5, hy - 1.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,70,50,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, hy + 1); ctx.lineTo(hx - 1, hy + 5); ctx.lineTo(hx + 1, hy + 5.5); ctx.stroke();      // 코
    ctx.beginPath(); ctx.moveTo(hx - 3, hy + 8.5); ctx.quadraticCurveTo(hx, hy + 9.5, hx + 3, hy + 8.5); ctx.stroke();    // 입
  }
  // 모자
  const cg = ctx.createLinearGradient(hx - 12, hy - 18, hx + 12, hy - 4); cg.addColorStop(0, shadeMix(u.cap, 1.35)); cg.addColorStop(1, u.capD);
  ctx.fillStyle = cg; ctx.beginPath();
  ctx.moveTo(hx - 11.5, hy - 3); ctx.quadraticCurveTo(hx - 12, hy - 18, hx, hy - 18.5); ctx.quadraticCurveTo(hx + 12, hy - 18, hx + 11.5, hy - 3);
  ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(hx, hy - 18.5); ctx.lineTo(hx, hy - 3); ctx.stroke();
  ellipse(ctx, hx, hy - 18.3, 1.6, 1.2, 0, u.capD);
  if (!back) {
    ctx.fillStyle = u.capD; ctx.beginPath(); ctx.ellipse(hx, hy - 3, 14, 4, 0, 0, Math.PI); ctx.fill();          // 챙
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(hx - 3, hy - 3.5, 8, 1.4, 0, Math.PI, 0); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(hx, hy - 5, 3, Math.PI, 0); ctx.fill();         // 뒤 조절창
  }
}

export function drawPitcher(ctx, { x, y, scale, mirror, pose: P, uni: u, back, holdBall, player }) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * mirror, scale);
  shadow(ctx, 0, 3, 52, 10);
  legPart(ctx, [P.hip[0] - 8, P.hip[1]], P.lK, P.lF, u, true, 0);
  legPart(ctx, [P.hip[0] + 8, P.hip[1]], P.rK, P.rF, u, false, 0);
  const throwBehind = P.lH[1] < P.ls[1] - 10 && P.lH[0] < P.ls[0];
  // 뒷모습: 몸 앞(가슴 쪽)에 있는 손은 몸통에 가려진다
  const inFront = (h, sh) => Math.abs(h[0]) < 18 && h[1] > sh[1] - 6;
  const gloveHidden = back && inFront(P.rH, P.rs), throwHidden = back && inFront(P.lH, P.ls);
  if (gloveHidden) { armPart(ctx, P.rs, P.rE, P.rH, u, true); glove(ctx, P.rH, u, false); }
  if (throwHidden || (!back && throwBehind)) armPart(ctx, P.ls, P.lE, P.lH, u, true);
  if (throwHidden && holdBall) drawBall(ctx, P.lH[0], P.lH[1] - 3, 3.6, 0);
  torsoPart(ctx, P.ls, P.rs, P.hip, u, !back, !back);
  if (back && player) {
    const cx = (P.ls[0] + P.rs[0]) / 2, cy = (P.ls[1] + P.hip[1]) / 2;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(mirror, 1);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = 'bold 8.5px system-ui,sans-serif';
    ctx.fillStyle = u.num; ctx.fillText(player.name, 0, -15);
    if (player.num != null) {
      ctx.font = '900 25px system-ui,sans-serif';
      ctx.lineWidth = 3; ctx.strokeStyle = u.numEdge; ctx.strokeText(String(player.num), 0, 9);
      ctx.fillStyle = u.num; ctx.fillText(String(player.num), 0, 9);
    }
    ctx.restore();
  }
  if (!gloveHidden) { armPart(ctx, P.rs, P.rE, P.rH, u, false); glove(ctx, P.rH, u, !back); }
  if (!throwHidden && !(!back && throwBehind)) armPart(ctx, P.ls, P.lE, P.lH, u, false);
  if (holdBall && !throwHidden) drawBall(ctx, P.lH[0], P.lH[1] - 3, 3.6, 0);
  pitcherHead(ctx, P, u, back);
  ctx.restore();
}

// ── 포수 + 심판 (투구 시점, 정면) ─────────────────────────
export function drawCatcherAndUmpire(ctx, V, mitt, u) {
  const k = V.zh / 120, cx = V.cx, base = V.feetY - V.zh * 0.05;
  // 심판
  const ux = cx + V.zw * 0.22, uy = V.cy + V.zh * 0.05;
  const ug = ctx.createLinearGradient(ux - V.zw * 0.3, 0, ux + V.zw * 0.3, 0); ug.addColorStop(0, '#2a3446'); ug.addColorStop(1, '#141b27');
  ellipse(ctx, ux, uy, V.zw * 0.27, V.zh * 0.31, 0, ug, INK);
  ellipse(ctx, ux, uy - V.zh * 0.36, 9 * k, 10 * k, 0, SKIN_D);
  ctx.fillStyle = '#0d0f14'; ctx.beginPath(); ctx.arc(ux, uy - V.zh * 0.4, 9.8 * k, Math.PI, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b6f78'; ctx.lineWidth = 1.2 * k;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(ux - 7 * k, uy - V.zh * 0.36 + i * 3.4 * k); ctx.lineTo(ux + 7 * k, uy - V.zh * 0.36 + i * 3.4 * k); ctx.stroke(); }
  // 포수
  shadow(ctx, cx, base + 4 * k, 46 * k, 8 * k);
  const pants = (px, rot) => { ctx.save(); ctx.translate(px, base - 18 * k); ctx.rotate(rot); ellipse(ctx, 0, 0, 15 * k, 20 * k, 0, u.pantsD, INK); ctx.restore(); };
  pants(cx - 22 * k, -0.3); pants(cx + 22 * k, 0.3);
  const guard = gx => {
    const g = ctx.createLinearGradient(gx, 0, gx + 13 * k, 0); g.addColorStop(0, u.trim); g.addColorStop(1, u.trimD);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx, base - 24 * k, 13 * k, 26 * k, 4 * k) : ctx.rect(gx, base - 24 * k, 13 * k, 26 * k); ctx.fill();
    ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx + 3 * k, base - 20 * k); ctx.lineTo(gx + 3 * k, base - 2 * k); ctx.stroke();
  };
  guard(cx - 35 * k); guard(cx + 22 * k);
  const pg = ctx.createLinearGradient(cx - 25 * k, 0, cx + 25 * k, 0); pg.addColorStop(0, shadeMix(u.trim, 1.25)); pg.addColorStop(1, u.trimD);
  ellipse(ctx, cx, base - 48 * k, 25 * k, 27 * k, 0, pg, INK);                       // 프로텍터
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.4 * k;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 18 * k, base - 60 * k + i * 12 * k); ctx.quadraticCurveTo(cx, base - 56 * k + i * 12 * k, cx + 18 * k, base - 60 * k + i * 12 * k); ctx.stroke(); }
  const hg = ctx.createRadialGradient(cx - 4 * k, base - 86 * k, 2, cx, base - 80 * k, 15 * k); hg.addColorStop(0, shadeMix(u.cap, 1.5)); hg.addColorStop(1, u.capD);
  ellipse(ctx, cx, base - 80 * k, 13.5 * k, 14 * k, 0, hg, INK);                     // 헬멧
  ctx.strokeStyle = '#a9adb5'; ctx.lineWidth = 1.4 * k;                              // 마스크 철망
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx - 9 * k, base - 77 * k + i * 4 * k); ctx.lineTo(cx + 9 * k, base - 77 * k + i * 4 * k); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, base - 85 * k); ctx.lineTo(cx, base - 69 * k); ctx.stroke();
  // 미트
  const [mx, my] = mitt ? toS(V, mitt.x, mitt.y) : [cx - 6 * k, base - 52 * k];
  limb(ctx, [cx - 18 * k, base - 62 * k], [mx, my], 11 * k, 9 * k, u.sleeve, u.sleeveD);
  const mr = V.zw * 0.13;
  const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 1, mx, my, mr);
  mg.addColorStop(0, '#b47d45'); mg.addColorStop(1, '#5c3815');
  ellipse(ctx, mx, my, mr * 0.95, mr, 0, mg, '#3e260f');
  ellipse(ctx, mx, my, mr * 0.55, mr * 0.6, 0, '#4a2c10');
  if (mitt) { ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(mx, my, mr * 1.25, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
}

// ── 공 ─────────────────────────────────────────────────
export function drawBall(ctx, x, y, r, spin = 0) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(x + r * 0.15, y + r * 0.22, r, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f1efe8'); g.addColorStop(1, '#c9c5ba');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (r > 4.5) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(spin); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = '#c8342c'; ctx.lineWidth = Math.max(0.8, r * 0.1);
    ctx.beginPath(); ctx.arc(-r * 1.05, 0, r * 0.75, -0.95, 0.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 1.05, 0, r * 0.75, Math.PI - 0.95, Math.PI + 0.95); ctx.stroke();
    if (r > 9) {
      ctx.lineWidth = Math.max(0.6, r * 0.05);
      for (let i = -3; i <= 3; i++) {
        const a = i * 0.25;
        for (const s of [-1, 1]) {
          const cx = s * r * 1.05, px = cx - s * Math.cos(a) * r * 0.75, py = Math.sin(a) * r * 0.75;
          ctx.beginPath(); ctx.moveTo(px - 1.5 * s, py - 1.2); ctx.lineTo(px + 1.5 * s, py + 1.2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}
