// 타구 화면: 위에서 내려다본 경기장에 타구 궤적·수비수 움직임·비거리를 그린다.
// 좌표: 피트, 홈 = (0,0), +y = 중견수 방향, +x = 1루(우익) 방향
import { randNormal } from '../../core/rng.js';
import { drawBall, drawFielderTop } from './figures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const FIELDERS = { P: [0, 60], C: [0, -5], '1B': [38, 100], '2B': [14, 148], SS: [-14, 148], '3B': [-38, 100], LF: [-28, 285], CF: [0, 315], RF: [28, 285] };
const polar = (deg, dist) => { const a = deg * Math.PI / 180; return { x: Math.sin(a) * dist, y: Math.cos(a) * dist }; };
const fieldPos = n => polar(FIELDERS[n][0], FIELDERS[n][1]);
export const fenceAt = deg => 330 + 70 * Math.cos(deg * Math.PI / 90);
function nearest(pt, names) {
  let best = null, bd = Infinity;
  for (const n of names) { const f = fieldPos(n), d = Math.hypot(f.x - pt.x, f.y - pt.y); if (d < bd) { bd = d; best = n; } }
  return best;
}

// event: EventType, fly: 뜬공 여부, contact: {pull}, batter: {bats}
export function planPlay(event, fly, contact, batter, rng, startAt) {
  const hand = batter.bats === 'L' ? 1 : batter.bats === 'R' ? -1 : (rng() < 0.5 ? 1 : -1);
  const pull = contact ? contact.pull : 0;
  let ang = clamp(hand * pull * 35 + randNormal(rng) * 7, -42, 42);
  let dist, maxH, ground = false, catcher = null, hit = true;
  const IF = ['1B', '2B', 'SS', '3B'], OF = ['LF', 'CF', 'RF'];
  switch (event) {
    case 'HR': dist = fenceAt(ang) + 15 + rng() * 45; maxH = 125; break;
    case 'TRIPLE': ang = (ang < 0 ? -1 : 1) * (18 + rng() * 8); dist = fenceAt(ang) - 6; maxH = 45; break;
    case 'DOUBLE': ang = (ang < 0 ? -1 : 1) * (rng() < 0.5 ? 15 + rng() * 10 : 36 + rng() * 6); dist = 250 + rng() * 50; maxH = 40; break;
    case 'SINGLE':
      if (!fly) { const gaps = [-26, -4, 4, 26]; ang = gaps[Math.floor(rng() * 4)] + randNormal(rng) * 3; dist = 205; maxH = 3; ground = true; }
      else { dist = 165 + rng() * 45; maxH = 28; }
      break;
    case 'SAC_FLY': { const f = OF[Math.floor(rng() * 3)]; ang = FIELDERS[f][0] + randNormal(rng) * 4; dist = 300 + rng() * 20; maxH = 75; catcher = f; hit = false; break; }
    default: {
      hit = false;
      if (!fly) {
        ground = true; const f = nearest(polar(ang, 140), IF); catcher = f;
        ang = FIELDERS[f][0] + randNormal(rng) * 4; dist = FIELDERS[f][1] - 5 + randNormal(rng) * 6; maxH = 2;
      } else {
        const deep = rng() < 0.5;
        const f = deep ? nearest(polar(ang, 280), OF) : nearest(polar(ang, 160), [...IF, ...OF]); catcher = f;
        ang = FIELDERS[f][0] + randNormal(rng) * 6; dist = FIELDERS[f][1] + randNormal(rng) * 25; maxH = deep ? 85 : 60;
      }
    }
  }
  const to = polar(ang, dist);
  const dur = ground ? 650 + dist * 1.2 : 900 + dist * 2.4;
  const chaser = catcher || nearest(to, ['LF', 'CF', 'RF', '1B', '2B', 'SS', '3B']);
  return { start: startAt, dur, to, maxH, ground, catcher, chaser, hit, event, distM: Math.round(dist * 0.3048) };
}

export function drawFieldView(ctx, W, H, play, now, uni, bases) {
  // 카메라: 확대해서 공을 따라간다(홈에서 시작해 타구 쪽으로 이동)
  const s = Math.min(W * 1.25 / 480, H * 1.1 / 430);
  const tt = clamp((now - play.start) / play.dur, 0, 1);
  const follow = play.to.y * (play.ground ? 1 - (1 - tt) * (1 - tt) : tt);
  const camY = clamp(follow * s - H * 0.45, 0, Math.max(0, 440 * s - H * 0.9));
  const camX = clamp(play.to.x * tt * s * 0.6, -W * 0.25, W * 0.25);
  const hx = W / 2 - camX, hy = H * 0.94 + camY;
  const fp = (x, y) => [hx + x * s, hy - y * s];
  // 관중석 링
  const bg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 520 * s); bg.addColorStop(0, '#13233b'); bg.addColorStop(1, '#070e1a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a2b45'; ctx.beginPath(); ctx.moveTo(...fp(0, -20));
  for (let a = -52; a <= 52; a += 2) { const p = polar(a, fenceAt(clamp(a, -45, 45)) + 75); ctx.lineTo(...fp(p.x, p.y)); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let r = 0; r < 6; r++) for (let a = -50; a <= 50; a += 2.2) { const p = polar(a + (r % 2), fenceAt(clamp(a, -45, 45)) + 14 + r * 10); const [x, y] = fp(p.x, p.y); ctx.fillRect(x, y, 2, 2); }
  // 외야 잔디 (체크 무늬)
  ctx.save(); ctx.beginPath(); ctx.moveTo(...fp(0, 0));
  for (let a = -45; a <= 45; a += 2) { const p = polar(a, fenceAt(a)); ctx.lineTo(...fp(p.x, p.y)); }
  ctx.closePath(); ctx.fillStyle = '#2e7d3a'; ctx.fill(); ctx.clip();
  for (let r = 0; r < 440; r += 30) { ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 15 * s; ctx.beginPath(); ctx.arc(hx, hy, r * s, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke(); }
  for (let a = -45; a <= 45; a += 10) { const p = polar(a, 420); ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 12 * s; ctx.beginPath(); ctx.moveTo(...fp(0, 0)); ctx.lineTo(...fp(p.x, p.y)); ctx.stroke(); }
  ctx.restore();
  // 워닝 트랙 + 펜스
  ctx.strokeStyle = '#8a6440'; ctx.lineWidth = 12 * s; ctx.beginPath();
  for (let a = -45; a <= 45; a += 2) { const p = polar(a, fenceAt(a) - 7); a === -45 ? ctx.moveTo(...fp(p.x, p.y)) : ctx.lineTo(...fp(p.x, p.y)); }
  ctx.stroke();
  ctx.strokeStyle = '#173f24'; ctx.lineWidth = 5; ctx.beginPath();
  for (let a = -45; a <= 45; a += 2) { const p = polar(a, fenceAt(a)); a === -45 ? ctx.moveTo(...fp(p.x, p.y)) : ctx.lineTo(...fp(p.x, p.y)); }
  ctx.stroke(); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 1.5; ctx.stroke();
  // 내야
  const dg = ctx.createRadialGradient(...fp(0, 62), 10 * s, ...fp(0, 62), 95 * s); dg.addColorStop(0, '#c4936a'); dg.addColorStop(1, '#a8774f');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(...fp(0, 62), 95 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2f8540'; ctx.beginPath(); ctx.moveTo(...fp(0, 10)); ctx.lineTo(...fp(54, 64)); ctx.lineTo(...fp(0, 117)); ctx.lineTo(...fp(-54, 64)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b8875d'; ctx.beginPath(); ctx.arc(...fp(0, 60.5), 9 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b8875d'; ctx.beginPath(); ctx.arc(...fp(0, 0), 13 * s, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  for (const a of [-45, 45]) { const p = polar(a, fenceAt(a)); ctx.beginPath(); ctx.moveTo(...fp(0, 0)); ctx.lineTo(...fp(p.x, p.y)); ctx.stroke(); }
  [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]].forEach(([x, y], i) => {
    const [px, py] = fp(x, y); ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = bases[i] ? '#f1c40f' : '#fff'; ctx.fillRect(-4.5, -4.5, 9, 9);
    if (bases[i]) { ctx.strokeStyle = 'rgba(241,196,15,.5)'; ctx.lineWidth = 3; ctx.strokeRect(-7, -7, 14, 14); }
    ctx.restore();
  });
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(...fp(0, 0), 4, 0, Math.PI * 2); ctx.fill();

  // 진행
  const t = clamp((now - play.start) / play.dur, 0, 1);
  const e = play.ground ? 1 - (1 - t) * (1 - t) : t;
  const bx = play.to.x * e, by = play.to.y * e;
  const h = play.ground ? Math.abs(Math.sin(t * Math.PI * 3)) * 4 * (1 - t) : 4 * play.maxH * t * (1 - t);

  for (const n of Object.keys(FIELDERS)) {
    let f = fieldPos(n), facing = -Math.PI / 2;
    if (n === play.chaser && now > play.start) {
      const reach = play.hit ? 0.65 : 1, k = clamp(t * 1.05, 0, 1) * reach;
      facing = Math.atan2(-(play.to.y - f.y), play.to.x - f.x);
      f = { x: f.x + (play.to.x - f.x) * k, y: f.y + (play.to.y - f.y) * k };
    }
    const [px, py] = fp(f.x, f.y);
    drawFielderTop(ctx, px, py, uni, n, facing);
  }
  if (now > play.start) {
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(...fp(0, 0)); ctx.lineTo(...fp(bx, by)); ctx.stroke(); ctx.setLineDash([]);
    const [sx, sy] = fp(bx, by);
    const sh = 4 + h * 0.03;
    ctx.fillStyle = `rgba(0,0,0,${0.5 - Math.min(0.3, h / 400)})`; ctx.beginPath(); ctx.ellipse(sx, sy, sh, sh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    drawBall(ctx, sx, sy - h * s * 0.9, 3.8 + h * 0.055, now / 40);
  }
  if (!play.ground) {
    ctx.font = 'bold 14px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.5)';
    const txt = `비거리 ${Math.round(Math.hypot(bx, by) * 0.3048)}m`;
    ctx.strokeText(txt, 12, 22); ctx.fillStyle = '#eef3fa'; ctx.fillText(txt, 12, 22);
  }
  return { landed: t >= 1 };
}
