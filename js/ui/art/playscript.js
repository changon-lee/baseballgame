// 인플레이 타구 대본: 공·수비수·주자가 시간에 따라 어디서 무엇을 하는지 미리 계산한다(그리기 없음).
// 결과(안타/아웃 등)는 이미 정해져 있고, 그 결과가 자연스럽게 나오도록 움직임을 맞춘다.
// 좌표: 피트. 홈 = (0,0), +y = 중견수 쪽, +x = 1루 쪽, z = 높이. 시간: 실제 초. 화면에선 SPEED배 빠르게 보여준다.
import { randNormal } from '../../core/rng.js';
import { groundAdvance, buntLead } from '../../core/rules.js';

export const SPEED = 1.3;
export const toMs = t => t * 1000 / SPEED;
export const toSec = ms => ms * SPEED / 1000;

const G = 32;                                            // 중력(ft/s²)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const polar = (deg, dist) => { const a = deg * Math.PI / 180; return [Math.sin(a) * dist, Math.cos(a) * dist]; };
export const angOf = (x, y) => Math.atan2(x, y) * 180 / Math.PI;
export const fenceAt = deg => 330 + 70 * Math.cos(clamp(deg, -45, 45) * Math.PI / 90);
export const FENCE_H = 10;
export const BASES = [[0, 0], [63.6, 63.6], [0, 127.3], [-63.6, 63.6]];
export const SPOTS = {
  P: [0, 56], C: [0, -3.5], '1B': polar(38, 100), '2B': polar(14, 148), SS: polar(-14, 148), '3B': polar(-38, 100),
  LF: polar(-28, 285), CF: polar(0, 315), RF: polar(28, 285),
};
const IF = ['1B', '2B', 'SS', '3B'], OF = ['LF', 'CF', 'RF'];
const runSpeed = n => (OF.includes(n) ? 27 : IF.includes(n) ? 24 : 20);
const armSpeed = n => (OF.includes(n) ? 118 : 100);
const REACT = 0.25;
const BAG = [null, [61.5, 65.5], [-1.5, 125.5], [-61.5, 65.5]];   // 베이스를 지키는 수비수가 서는 곳
const nearest = (pt, names) => names.reduce((b, n) => (hyp(...SPOTS[n], ...pt) < hyp(...SPOTS[b], ...pt) ? n : b));

// ── 시간표(keys) ── key = {t, x, y, act}: t초에 (x,y)에 있고 act를 시작해 다음 key의 위치로 움직인다
export function trackAt(keys, t) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  if (!b || t <= a.t) return { x: a.x, y: a.y, act: a.act, since: Math.max(0, t - a.t), vx: 0, vy: 0, face: a.face };
  const u = (t - a.t) / (b.t - a.t), d = b.t - a.t;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, act: a.act, since: t - a.t, vx: (b.x - a.x) / d, vy: (b.y - a.y) / d, face: a.face };
}
const lastKey = keys => keys[keys.length - 1];
function key(keys, t, x, y, act, face) {
  const l = lastKey(keys);
  t = Math.max(t, l.t);
  if (t === l.t && keys.length > 1) { Object.assign(l, { x, y, act, face }); return t; }
  keys.push({ t, x, y, act, face });
  return t;
}
const act = (keys, t, a, face) => { const l = lastKey(keys); return key(keys, t, l.x, l.y, a, face); };
// 지금 자리에서 (x,y)까지 뛰어간다. 도착 시각을 돌려준다
function runTo(keys, t0, x, y, speed, after = 'stand', runAct = 'run') {
  const l = lastKey(keys); t0 = Math.max(t0, l.t);
  const d = hyp(l.x, l.y, x, y);
  if (d < 0.5) return act(keys, t0, after);
  key(keys, t0, l.x, l.y, runAct);
  return key(keys, t0 + d / speed, x, y, after);
}
// 마지막으로 뛴 구간의 끝 dur초를 슬라이딩으로 바꾸고, 베이스에 누웠다가 일어난다(마지막 key가 도착이어야 한다)
function slideIn(keys, dur = 0.35, lie = 0.55) {
  const n = keys.length, a = keys[n - 2], b = keys[n - 1];
  if (!a || a.act !== 'run' || b.t - a.t < dur + 0.05) return;
  const u = (b.t - dur - a.t) / (b.t - a.t);
  keys.splice(n - 1, 0, { t: b.t - dur, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, act: 'slide' });
  const end = b.act; b.act = 'slide';
  keys.push({ t: b.t + lie, x: b.x, y: b.y, act: end });
}
// 도착 시각을 정해 두고 뛴다(그보다 빨리 갈 수 있으면 늦게 출발)
function arriveAt(keys, tMin, tArr, x, y, speed, after) {
  const l = lastKey(keys), d = hyp(l.x, l.y, x, y);
  const start = Math.max(tMin, l.t, tArr - d / speed);
  if (d < 0.5) return act(keys, start, after);
  key(keys, start, l.x, l.y, 'run');
  return key(keys, Math.max(tArr, start + 0.05), x, y, after);
}

// ── 공 ──
// fly: 포물선(수평은 공기저항으로 점점 느려지고, 꼭대기가 뒤쪽에 있다), path: 굴러가는 공(미리 계산한 점들), hold: 수비수 손
function flyPos(s, t) {
  const u = clamp((t - s.t0) / (s.t1 - s.t0), 0, 1), k = s.k, sk = s.skew;
  const h = u * (1 + k) - k * u * u, f = Math.pow(u, sk);
  return [s.p0[0] + (s.p1[0] - s.p0[0]) * h, s.p0[1] + (s.p1[1] - s.p0[1]) * h, s.p0[2] + (s.p1[2] - s.p0[2]) * u + 4 * s.H * f * (1 - f)];
}
function pathPos(s, t) {
  const n = s.pts.length / 3 - 1, i = clamp((t - s.t0) / s.dt, 0, n), a = Math.floor(i), b = Math.min(n, a + 1), u = i - a;
  const P = s.pts;
  return [P[a * 3] + (P[b * 3] - P[a * 3]) * u, P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * u, P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * u];
}
const HAND_Z = { field: 1.2, catch: 6.8, camp: 5, receive: 5, throw: 6.5, tag: 2, dive: 1.2 };
// 펜스 앞 점프: 뛰어오른 높이(피트). since = 점프 시작 뒤 초
export const JUMP_MS = 0.6;
export const jumpZ = since => (since >= 0 && since < JUMP_MS ? 4.2 * Math.sin(Math.PI * since / JUMP_MS) : 0);
export function ballAt(sc, t) {
  const segs = sc.ball;
  let s = segs[0];
  for (const q of segs) if (q.t0 <= t) s = q;
  const tt = Math.min(t, s.t1 ?? t);
  if (s.type === 'fly' || s.type === 'throw') return { p: flyPos(s, tt), seg: s };
  if (s.type === 'path') return { p: pathPos(s, tt), seg: s };
  if (s.type === 'hold') {
    const f = trackAt(sc.fielders[s.who], t);
    return { p: [f.x, f.y, f.act === 'jump' ? 6.8 + jumpZ(f.since) : HAND_Z[f.act] ?? 4], seg: s, held: true };
  }
  return { p: s.p, seg: s };                              // rest
}

// 굴러가는(튀는) 공을 흉내 낸다. 펜스에 맞으면 튕겨 나온다
function simGround(p0, v0, t0, maxT = 9) {
  const dt = 1 / 60, pts = [];
  let [x, y, z] = p0, [vx, vy, vz] = v0, rolling = false, wallT = null;
  pts.push(x, y, z);
  for (let i = 0; i < maxT / dt; i++) {
    if (!rolling) { vz -= G * dt; z += vz * dt; }
    x += vx * dt; y += vy * dt;
    if (!rolling && z <= 0) {
      z = 0;
      if (vz < -5) { vz = -vz * 0.4; vx *= 0.8; vy *= 0.8; } else { vz = 0; rolling = true; }
    }
    if (rolling) {
      const sp = Math.hypot(vx, vy), ns = Math.max(0, sp - 13 * dt);
      if (sp > 0) { vx *= ns / sp; vy *= ns / sp; }
    }
    const r = Math.hypot(x, y), fa = fenceAt(angOf(x, y)) - 1.5;
    if (Math.abs(angOf(x, y)) <= 46 && r >= fa) {
      const vr = (vx * x + vy * y) / r;
      if (vr > 0) {
        if (wallT === null && vr > 8) wallT = t0 + (i + 1) * dt;   // 담장을 세게 맞힌 순간(소리)
        vx += (-0.3 * vr - vr) * x / r; vy += (-0.3 * vr - vr) * y / r; x *= fa / r; y *= fa / r;
      }
    }
    pts.push(x, y, z);
    if (rolling && Math.hypot(vx, vy) < 0.3) break;
  }
  return { type: 'path', t0, t1: t0 + (pts.length / 3 - 1) * dt, dt, pts, wallT };
}
// 수비수가 굴러오는 공을 잡을 수 있는 가장 이른 순간
function intercept(path, f0, speed, tMin, zMax = 4.5) {
  for (let t = Math.max(path.t0, tMin); t <= path.t1; t += 1 / 60) {
    const p = pathPos(path, t);
    if (p[2] <= zMax && hyp(...f0, p[0], p[1]) / speed + REACT <= t) return { t, x: p[0], y: p[1] };
  }
  const e = pathPos(path, path.t1);
  return { t: Math.max(path.t1, REACT + hyp(...f0, e[0], e[1]) / speed), x: e[0], y: e[1] };
}
const hang = H => 2 * Math.sqrt(2 * H / G) * 0.95;
// 수비수가 공이 떨어질 때까지 뛰어서 닿을 수 있는 거리(반응 시간 빼고). 안타가 떨어지는 곳은 모두에게 이보다 멀어야 자연스럽다
export const reachBy = (n, T) => runSpeed(n) * Math.max(0, T - REACT);
// 아무도 못 잡는 곳에 떨어지는 안타: pick()으로 뽑은 { ang, dist, H } 중 모든 수비수가 닿지 못하는 첫 자리(못 찾으면 마지막)
function dropSpot(pick) {
  let c;
  for (let i = 0; i < 30; i++) {
    c = pick(i);
    if (Math.abs(c.ang) <= 45) c.dist = Math.min(c.dist, fenceAt(c.ang) - 12);
    const [x, y] = polar(c.ang, c.dist), T = hang(c.H);
    if ([...IF, ...OF].every(n => hyp(...SPOTS[n], x, y) > reachBy(n, T) + 6)) return c;
  }
  return c;
}
const cutAt = (segs, t) => { const s = segs[segs.length - 1]; s.t1 = Math.min(s.t1, t); };

// ── 대본 만들기 ──
// event: SINGLE/DOUBLE/TRIPLE/HR/OUT/SAC_FLY/DOUBLE_PLAY/INFIELD_SINGLE/ERROR/SINGLE_HOME_OUT/LINE_DP/SAC_BUNT/BUNT_SINGLE/BUNT_FC, fly: 뜬공 여부,
// style: 같은 결과의 다른 장면(dive, wall, liner, home_safe, fumble, throw), contact.pull, bats: 'L'|'R'|'S', bases: 치기 전 주자
// 도루 장면: event = 'STEAL'(세이프) | 'CAUGHT_STEALING'(아웃), steal = { lead: 뛴 앞 주자(0=1루, 1=2루), trail: 같이 뛴 뒤 주자 | null }
export function buildPlay({ event, fly, contact, bats, bases = [false, false, false], rng, style = null, steal = null }) {
  const hand = bats === 'L' ? 1 : bats === 'R' ? -1 : (rng() < 0.5 ? 1 : -1);
  const pull = contact ? contact.pull : 0;
  let ang = clamp(hand * pull * 35 + randNormal(rng) * 7, -42, 42);
  const ev = event === 'SINGLE_HOME_OUT' ? 'SINGLE' : event;                    // 홈 보살도 타구는 안타
  const hit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'].includes(ev);
  // 2루 주자가 있는 단타는 외야수가 늘 홈으로 던진다: 보살(out) / 간발의 세이프(close) / 늦은 송구(late)
  const homePlay = ev === 'SINGLE' && bases[1];
  const homeMode = event === 'SINGLE_HOME_OUT' ? 'out' : style === 'home_safe' ? 'close' : 'late';
  const sc = { event, hit, fly: !!fly, ball: [], fielders: {}, runners: [], sounds: [], watch: [], decisive: 0, end: 0, distM: 0, landT: null, outs: [] };
  const F = sc.fielders;
  for (const n of Object.keys(SPOTS)) F[n] = [{ t: 0, x: SPOTS[n][0], y: SPOTS[n][1], act: n === 'C' ? 'crouch' : n === 'P' ? 'pitch' : 'ready' }];
  const used = new Set();
  const P0 = [0, 1.5, 3];

  // 주자: 타자(0) + 누상 주자. lead = 베이스에서 다음 베이스 쪽으로 조금 나가 있는 자리
  const baseAlong = (b, d) => { const a = BASES[b % 4], c = BASES[(b + 1) % 4], L = hyp(...a, ...c); return [a[0] + (c[0] - a[0]) * d / L, a[1] + (c[1] - a[1]) * d / L]; };
  const mkRunner = (base, x, y, a) => { const r = { base, keys: [{ t: 0, x, y, act: a }] }; sc.runners.push(r); return r; };
  const B = mkRunner(0, hand > 0 ? 3.2 : -3.2, 0.5, 'bat');
  const R = [null, null, null];
  bases.forEach((on, i) => { if (on) R[i] = mkRunner(i + 1, ...baseAlong(i + 1, i === 2 ? 6 : 10), 'lead'); });
  // 주자를 from 베이스에서 to 베이스까지 돌린다(베이스마다 key). 마지막 베이스 도착 시각
  const runBases = (r, t0, from, to, speed, endAct = 'stand') => {
    let t = t0;
    for (let b = from + 1; b <= to; b++) t = runTo(r.keys, t, ...BASES[b % 4], speed, b === to ? endAct : 'run', 'run');
    return t;
  };

  // 땅볼 진루(내야안타): 포스된 주자는 다음 베이스로, 나머지는 리드했다가 베이스로
  const forcedRunners = t0 => {
    const to = groundAdvance(bases);
    R.forEach((r, i) => {
      if (!r) return;
      if (to[i] > i + 1) { runBases(r, t0, i + 1, to[i], 23); return; }
      runTo(r.keys, 0.4, ...baseAlong(i + 1, 20), 12, 'lead');
      runTo(r.keys, 3, ...BASES[i + 1], 14, 'stand');
    });
  };
  // 공을 던진다: from 수비수가 tRel에 놓아서 to 지점에 도착하는 시각
  const throwBall = (from, tRel, to) => {
    const f = trackAt(F[from], tRel), d = hyp(f.x, f.y, ...to), dur = d / armSpeed(from) + 0.1;
    cutAt(sc.ball, tRel);
    sc.ball.push({ type: 'throw', t0: tRel, t1: tRel + dur, p0: [f.x, f.y, 6.5], p1: [to[0], to[1], 5], H: clamp(d * 0.03, 0.5, 12), k: 0.08, skew: 1 });
    return tRel + dur;
  };
  const hold = (who, t) => { cutAt(sc.ball, t); sc.ball.push({ type: 'hold', who, t0: t, t1: Infinity }); };
  // 받는 사람: spot에 미리 가 있다가 받는다
  const receive = (who, spot, tFrom, tArr, after = 'stand') => {
    used.add(who);
    runTo(F[who], tFrom, ...spot, runSpeed(who), 'cover');
    act(F[who], tArr - 0.3, 'receive');
    act(F[who], tArr + 0.25, after);
    hold(who, tArr);
    sc.sounds.push({ t: tArr, name: 'mitt' });
    sc.watch.push({ kind: 'f', id: who, t0: tArr - 1.2, t1: tArr + 0.6 });
  };
  // 뜬공 잡기
  const catchFly = (who, x, y, H) => {
    used.add(who);
    const T = hang(H), fx = x, fy = y - 1.2;
    sc.ball.push({ type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, 6.8], H, k: 0.3, skew: 1.16 });
    const sp = Math.max(runSpeed(who), hyp(...SPOTS[who], fx, fy) / Math.max(0.5, T - 0.4 - REACT));
    const arr = runTo(F[who], REACT, fx, fy, sp, 'camp');
    act(F[who], Math.max(arr, T - 0.3), 'catch');
    hold(who, T);
    sc.sounds.push({ t: T, name: 'mitt' });
    sc.watch.push({ kind: 'f', id: who, t0: 0.3, t1: T + 0.8 });
    return T;
  };
  // 굴러가는 공 잡기(땅볼/안타 처리). 잡은 시각과 자리
  const fieldBall = (who, path, tMin) => {
    used.add(who);
    const sp = runSpeed(who) * (OF.includes(who) ? 1 : 1.05);
    const I = intercept(path, F[who][0] ? [lastKey(F[who]).x, lastKey(F[who]).y] : SPOTS[who], sp, tMin);
    const arr = arriveAt(F[who], REACT, I.t - 0.05, I.x, I.y + (OF.includes(who) ? 0.5 : 1), sp, 'set');
    act(F[who], Math.max(arr, I.t - 0.15), 'field');
    sc.ball.push(path);
    hold(who, I.t);
    sc.watch.push({ kind: 'f', id: who, t0: 0.3, t1: I.t + 0.8 });
    return I;
  };
  const groundPath = (a, v, la = -3) => {
    const [dx, dy] = polar(a, 1), r = la * Math.PI / 180;
    return simGround(P0.slice(0, 2).concat([2.5]), [dx * v * Math.cos(r), dy * v * Math.cos(r), v * Math.sin(r)], 0);
  };
  // 타자가 1루로 뛴다(아웃이면 outT보다 조금 늦게 도착)
  const batterTo1B = outT => {
    const natural = 0.45 + 90 / 27.5;
    const arr = outT != null ? Math.max(natural, outT + 0.22) : natural;
    act(B.keys, 0.25, 'drop');
    key(B.keys, 0.45, B.keys[0].x, B.keys[0].y, 'run');
    key(B.keys, arr, ...BASES[1], 'run');
    const [ox, oy] = [BASES[1][0] + 13, BASES[1][1] + 6];
    key(B.keys, arr + 0.7, ox, oy, 'stand');
    return arr;
  };

  const bunt = event === 'SAC_BUNT' || event === 'BUNT_SINGLE' || event === 'BUNT_FC' || (event === 'OUT' && style === 'bunt');
  if (event === 'STEAL' || event === 'CAUGHT_STEALING') {
    // 도루: 공은 포수 미트에서 시작. 주자는 투구 때 이미 스타트를 끊어 베이스 사이를 달리고 있다.
    // 포수가 일어나 던지고, 베이스 커버가 받아 태그. 세이프면 주자가 한 발 먼저 슬라이딩, 아웃이면 공이 먼저
    const ok = event === 'STEAL', L = steal ? steal.lead : (bases[1] && !bases[2] ? 1 : 0), to = L + 2;
    const spot = BAG[to], cover = to === 3 ? '3B' : (rng() < 0.5 ? 'SS' : '2B');
    used.add('C');
    sc.ball.push({ type: 'hold', who: 'C', t0: 0, t1: Infinity });
    const rel = 0.62 + rng() * 0.18;
    act(F.C, rel - 0.38, 'throw');
    const arr = throwBall('C', rel, spot);
    act(F.C, rel + 0.45, 'stand');
    receive(cover, spot, REACT, arr, 'tag');
    const go = (r, from, dest, tArr) => {                                   // 스타트를 끊은 자리에서 다음 베이스까지
      const [sx, sy] = baseAlong(from, from === 2 ? 30 : 27);
      Object.assign(r.keys[0], { x: sx, y: sy, act: 'run' });
      const d = hyp(sx, sy, ...BASES[dest]);
      arriveAt(r.keys, 0, tArr, ...BASES[dest], d / tArr, 'stand');
    };
    const r = R[L], tR = ok ? arr - 0.1 - rng() * 0.18 : arr + 0.18 + rng() * 0.15;
    go(r, L + 1, to, tR); slideIn(r.keys);
    if (steal && steal.trail != null && R[steal.trail]) go(R[steal.trail], steal.trail + 1, steal.trail + 2, tR + 0.25);
    const tTag = Math.max(arr, tR);
    act(F[cover], tTag + 0.05, 'tag');
    if (ok) sc.sounds.push({ t: tR, name: 'ooh' });
    else {
      sc.outs.push(tTag + 0.05);
      const off = to === 3 ? [-82, 30] : [-16, 112];                       // 아웃된 주자는 더그아웃 쪽으로 걸어 나간다
      runTo(r.keys, tTag + 1.1, ...off, 7, 'stand');
    }
    // 카메라는 공(홈에 있는 포수 미트) 대신 뛰는 주자와 베이스 커버만 따라간다 → 슬라이딩이 크게 보인다
    sc.watch.length = 0;
    sc.watch.push({ kind: 'r', id: sc.runners.indexOf(r), t0: 0, t1: Infinity }, { kind: 'f', id: cover, t0: 0, t1: Infinity });
    sc.ballUntil = -1; sc.minSpan = 42;
    sc.decisive = tTag + 0.5;
  } else if (bunt) {
    // 번트: 공이 홈 앞으로 느리게 구르고, 투수·1루수·3루수가 달려 나와 잡아 던진다
    const side = rng() < 0.55 ? -1 : 1;                                       // -1 = 3루 쪽
    ang = side * (8 + rng() * 26);
    const who = Math.abs(ang) < 15 ? 'P' : side < 0 ? '3B' : '1B';
    const path = groundPath(ang, 26 + rng() * 10, -16);
    const I = fieldBall(who, path, 0.5);
    const lead = event === 'BUNT_FC' ? buntLead(bases) : -1;
    const tB = batterTo1B(event === 'BUNT_FC' || event === 'BUNT_SINGLE' ? null : I.t + 0.9);
    let decisive;
    if (lead >= 0) {
      // 야수 선택: 앞 주자를 잡으러 그 다음 베이스(또는 홈)로 던진다. 타자는 1루에서 산다
      const to = lead + 2, spot = to === 4 ? [0.6, 2.2] : BAG[to];
      const rcv = to === 4 ? 'C' : to === 3 ? (who === '3B' ? 'SS' : '3B') : (who === '1B' ? 'SS' : rng() < 0.5 ? 'SS' : '2B');
      const rel = I.t + 0.45;
      act(F[who], rel - 0.3, 'throw');
      const arr = throwBall(who, rel, spot);
      act(F[who], rel + 0.4, 'stand');
      receive(rcv, spot, REACT, arr, 'tag');
      const r = R[lead], tR = arr + 0.15;
      arriveAt(r.keys, 0.1, tR, ...BASES[to % 4], 26, 'stand'); slideIn(r.keys);
      runTo(r.keys, tR + 0.8, BASES[to % 4][0] * 0.8 - 12, BASES[to % 4][1] * 0.8 - 8, 8, 'stand');
      sc.outs.push(arr);
      R.forEach((q, i) => { if (q && i !== lead) runBases(q, 0.12, i + 1, i + 2, 25); });
      decisive = Math.max(arr, tB);
    } else {
      // 1루로 던진다: 희생번트·번트 아웃이면 타자보다 먼저, 번트 안타면 한 발 늦게
      const safe = event === 'BUNT_SINGLE';
      const cover = who === '1B' ? '2B' : '1B', dur = hyp(I.x, I.y, ...BAG[1]) / armSpeed(who) + 0.1;
      const rel = Math.max(I.t + 0.4, safe ? tB + 0.15 - dur : I.t + 0.4);
      act(F[who], rel - 0.3, 'throw');
      const arr = throwBall(who, rel, BAG[1]);
      act(F[who], rel + 0.4, 'stand');
      receive(cover, BAG[1], REACT, arr, 'stand');
      if (!safe) sc.outs.push(arr);
      R.forEach((q, i) => { if (q) runBases(q, 0.12, i + 1, i + 2, 25); });   // 주자는 모두 한 베이스씩
      decisive = Math.max(arr, tB);
    }
    sc.watch.push({ kind: 'r', id: 0, t0: I.t, t1: tB + 0.5 });
    sc.decisive = decisive + 0.35;
  } else if (event === 'HR') {
    const fa = fenceAt(ang), dist = fa + 18 + rng() * 50, H = 105 + rng() * 35;
    const [x, y] = polar(ang, dist), zLand = FENCE_H + (dist - fa) * 0.55;
    const T = hang(H) * 0.95;
    sc.ball.push({ type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, zLand], H, k: 0.3, skew: 1.16 });
    sc.ball.push({ type: 'rest', t0: T, t1: Infinity, p: [x, y, zLand] });
    const who = nearest([x, y], OF); used.add(who);
    const [wx, wy] = polar(ang, fa - 5);
    const sp = runSpeed(who), arr = REACT + hyp(...SPOTS[who], wx, wy) / sp;
    if (arr < T) { runTo(F[who], REACT, wx, wy, sp, 'watch'); }
    else { const k = (T - REACT) * sp / hyp(...SPOTS[who], wx, wy); runTo(F[who], REACT, SPOTS[who][0] + (wx - SPOTS[who][0]) * k, SPOTS[who][1] + (wy - SPOTS[who][1]) * k, sp, 'watch'); }
    sc.watch.push({ kind: 'f', id: who, t0: 0.4, t1: T - 0.6 });
    sc.landT = T; sc.distM = Math.round(dist * 0.3048);
    sc.sounds.push({ t: T, name: 'cheer' });
    // 다 같이 천천히 홈까지
    act(B.keys, 0.3, 'drop');
    runBases(B, 0.9, 0, 4, 20, 'stand');
    R.forEach((r, i) => r && runBases(r, 0.6 + i * 0.1, i + 1, 4, 19, 'stand'));
    sc.decisive = T + 0.5;
    sc.ballUntil = T + 0.4;                                 // 그 뒤로 카메라는 베이스를 도는 타자를 따라간다
    sc.watch.push({ kind: 'r', id: 0, t0: T + 0.4, t1: Infinity });
  } else if (hit) {
    // 안타: 땅볼이면 내야 사이를 빠져나가고, 뜬공이면 수비수 앞/사이에 떨어진다
    let path, chaser, landT = 0;
    if (ev === 'SINGLE' && !fly) {
      const gaps = [-27, -5, 5, 27];
      ang = gaps[Math.floor(rng() * 4)] + randNormal(rng) * 2.5;
      path = groundPath(ang, 105 + rng() * 20);
      // 가까운 내야수가 몸을 날리지만 닿지 않는다
      const tIF = (() => { for (let t = 0; t < path.t1; t += 1 / 60) { const p = pathPos(path, t); if (Math.hypot(p[0], p[1]) > 128) return t; } return 1; })();
      const pIF = pathPos(path, tIF), diver = nearest([pIF[0], pIF[1]], IF.filter(n => n !== '1B' || ang > 20));
      used.add(diver);
      const dv = SPOTS[diver], k = 0.72;
      runTo(F[diver], REACT, dv[0] + (pIF[0] - dv[0]) * k, dv[1] + (pIF[1] - dv[1]) * k, hyp(...dv, pIF[0], pIF[1]) * k / Math.max(0.3, tIF - REACT), 'dive');
      act(F[diver], tIF + 0.7, 'stand');
      chaser = nearest(pathPos(path, Math.min(path.t1, tIF + 1)).slice(0, 2), OF);
      sc.ball.length = 0;
    } else {
      let dist, H;
      const sgn = ang < 0 ? -1 : 1, ang0 = ang;
      if (ev === 'TRIPLE') { ang = sgn * (19 + rng() * 9); dist = fenceAt(ang) - 25; H = 45; }
      else if (ev === 'DOUBLE') {                    // 외야 사이(좌·우중간)를 가르거나 선상으로 빠지는 낮은 타구 — 외야수가 못 닿는 곳
        ({ ang, dist, H } = dropSpot(() => (rng() < 0.55
          ? { ang: sgn * (10 + rng() * 8), dist: 290 + rng() * 45, H: 20 + rng() * 12 }
          : { ang: sgn * (37 + rng() * 5), dist: 265 + rng() * 50, H: 16 + rng() * 10 })));
      } else if (style === 'bloop') { dist = 128 + rng() * 22; H = 30 + rng() * 10; }   // 텍사스 안타: 내야수 머리 위, 외야수 앞
      else {                                         // 라인드라이브 안타: 내야수 뒤·외야수 앞, 둘 다 못 닿는 곳에 낮게
        ({ ang, dist, H } = dropSpot(i => ({ ang: clamp(ang0 + (i > 6 ? randNormal(rng) * 10 : 0), -42, 42), dist: 180 + rng() * 60, H: 12 + rng() * 16 })));
      }
      dist = Math.min(dist, fenceAt(ang) - 12);
      const [x, y] = polar(ang, dist), T = hang(H);
      if (style === 'bloop') {
        // 가까운 내야수가 등을 돌려 쫓아가지만 한 발 모자란다
        const back = nearest([x, y], IF), b0 = SPOTS[back], d = hyp(...b0, x, y), k = Math.max(0, (d - 7) / d);
        used.add(back);
        runTo(F[back], REACT, b0[0] + (x - b0[0]) * k, b0[1] + (y - b0[1]) * k, Math.max(runSpeed(back), d * k / Math.max(0.5, T - REACT)), 'dive');
        act(F[back], T + 0.7, 'stand');
      }
      const fl = { type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, 0], H, k: 0.3, skew: 1.16 };
      sc.ball.push(fl);
      const vh = 0.7 * dist / T, [dx, dy] = polar(ang, 1);
      path = simGround([x, y, 0], [dx * vh, dy * vh, (0 - P0[2] - 4 * H * 1.16) / T], T);
      landT = T; sc.landT = T; sc.distM = Math.round(dist * 0.3048);
      sc.sounds.push({ t: T, name: 'ooh' });
      chaser = nearest([x, y], OF);
    }
    // 외야수가 공을 쫓아가 잡는다(떨어진 뒤에)
    const I = fieldBall(chaser, path, Math.max(landT + 0.08, path.t0 + 0.6));
    if (path.wallT !== null && path.wallT < I.t) sc.sounds.push({ t: path.wallT, name: 'fence' });
    // 다른 외야수는 뒤를 받쳐 준다
    // 주자들: 정해진 베이스까지
    const dest = { SINGLE: [1, 2, 4, 4], DOUBLE: [2, 3, 4, 4], TRIPLE: [3, 4, 4, 4] }[ev];
    act(B.keys, 0.25, 'drop');
    key(B.keys, 0.45, B.keys[0].x, B.keys[0].y, 'run');
    let lastSafe = runBases(B, 0.45, 0, dest[0], 27);
    R.forEach((r, i) => { if (r && !(homePlay && i === 1)) lastSafe = Math.max(lastSafe, runBases(r, 0.12, i + 1, dest[i + 1], 26.5)); });
    if (homePlay) {
      // 홈 승부: 외야수가 홈으로 바로 던진다. 보살이면 공이 먼저, 세이프면 주자가 간발의 차로 먼저
      const r = R[1], t3 = runBases(r, 0.12, 2, 3, 26.5, 'run'), tNat = t3 + 90 / 26.5;
      const plate = [0.6, 2.2], dur = hyp(I.x, I.y, ...plate) / armSpeed(chaser) + 0.1;
      const out = homeMode === 'out';
      const rel = Math.max(I.t + 0.6, (out ? tNat - 0.35 : homeMode === 'close' ? tNat + 0.18 : tNat + 0.7) - dur);
      act(F[chaser], rel - 0.3, 'throw');
      const A = throwBall(chaser, rel, plate);
      act(F[chaser], rel + 0.45, 'stand');
      const tHome = out ? Math.max(tNat, A + 0.3) : Math.min(tNat, A - 0.15);
      arriveAt(r.keys, t3, tHome, 0, 0, 27, 'stand');
      if (homeMode !== 'late') slideIn(r.keys);
      receive('C', plate, 0.6, A, 'tag');
      act(F.C, tHome + 0.5, 'stand');
      if (out) { sc.outs.push(tHome); runTo(r.keys, tHome + 0.9, -22, -14, 8, 'stand'); }
      else if (homeMode === 'close') sc.sounds.push({ t: tHome, name: 'ooh' });
      sc.watch.push({ kind: 'r', id: sc.runners.indexOf(r), t0: I.t + 0.4, t1: tHome + 0.5 });
      sc.decisive = Math.max(lastSafe + 0.3, tHome + 0.45);
    } else {
    // 공은 중계 수비수에게 → 주자가 다 들어간 뒤 내야로
    const cut = ang < 0 ? 'SS' : '2B', other = cut === 'SS' ? '2B' : 'SS';
    const tgtBase = ev === 'SINGLE' ? 2 : 3;
    // 송구가 가는 베이스로 들어가는 주자는 미끄러져 들어간다
    for (const r of sc.runners) { const l = r.keys[r.keys.length - 1]; if (hyp(l.x, l.y, ...BASES[tgtBase]) < 1) slideIn(r.keys); }
    const fieldSpot = [I.x, I.y];
    const relay = (() => { const b = BASES[tgtBase], k = ev === 'SINGLE' ? 0 : 0.55; return [b[0] + (fieldSpot[0] - b[0]) * k, b[1] + (fieldSpot[1] - b[1]) * k]; })();
    act(F[chaser], I.t + 0.3, 'throw');
    const rel = I.t + 0.65;
    const coverer = ev === 'SINGLE' ? (ang < 0 ? '2B' : 'SS') : cut;
    const arr1 = throwBall(chaser, rel, ev === 'SINGLE' ? BAG[2] : relay);
    act(F[chaser], rel + 0.45, 'stand');
    receive(coverer, ev === 'SINGLE' ? BAG[2] : relay, REACT + 0.2, arr1, 'hold');
    let ballIn = arr1;
    if (ev !== 'SINGLE') {
      const recv = ev === 'TRIPLE' ? '3B' : other, spot = BAG[tgtBase];
      runTo(F[recv], REACT + 0.3, ...spot, runSpeed(recv), 'cover');
      const d2 = hyp(...relay, ...spot) / armSpeed(coverer) + 0.1;
      const rel2 = Math.max(arr1 + 0.45, lastSafe + 0.15 - d2);   // 주자가 들어간 뒤에 도착하게
      act(F[coverer], rel2 - 0.3, 'throw');
      const arr2 = throwBall(coverer, rel2, spot);
      act(F[coverer], rel2 + 0.4, 'stand');
      receive(recv, spot, REACT + 0.3, arr2, 'hold');
      ballIn = arr2;
    }
    sc.watch.push({ kind: 'r', id: 0, t0: I.t, t1: lastSafe + 0.5 });
    sc.decisive = Math.max(lastSafe + 0.3, ballIn + 0.2);
    }
  } else if (event === 'INFIELD_SINGLE') {
    // 내야안타: 느린 땅볼을 3루수·유격수·투수가 달려 나와 잡아 던지지만 타자가 한 발 먼저
    const who = rng() < 0.5 ? '3B' : rng() < 0.6 ? 'SS' : 'P';
    ang = (who === '3B' ? -24 : who === 'SS' ? -9 : 4) + randNormal(rng) * 3;
    const path = groundPath(ang, 52 + rng() * 14, -12);
    const I = fieldBall(who, path, 0.3);
    const tB = batterTo1B(null), dur = hyp(I.x, I.y, ...BAG[1]) / armSpeed(who) + 0.1;
    const rel = Math.max(I.t + 0.35, tB + 0.12 - dur);
    act(F[who], rel - 0.3, 'throw');
    const arr = throwBall(who, rel, BAG[1]);
    act(F[who], rel + 0.4, 'stand');
    receive('1B', BAG[1], REACT, arr, 'stand');
    forcedRunners(0.15);
    sc.watch.push({ kind: 'r', id: 0, t0: I.t, t1: tB + 0.5 });
    sc.decisive = Math.max(arr, tB) + 0.35;
  } else if (event === 'ERROR') {
    // 실책: fumble = 땅볼을 놓쳐 공이 튀어 나가고 다시 잡아 던지지만 늦다 / throw = 잡아서 던진 공이 1루수 키를 넘어간다
    const who = nearest(polar(ang, 140), ['2B', 'SS', '3B']);
    ang = angOf(...SPOTS[who]) + randNormal(rng) * 5;
    const path = groundPath(ang, 85 + rng() * 25, -6 + rng() * 5);
    const I = fieldBall(who, path, 0.3);
    const tB = batterTo1B(null);
    let last;
    if (style === 'throw') {
      act(F[who], I.t + 0.3, 'throw');
      const rel = I.t + 0.55, f = trackAt(F[who], rel);
      const miss = [BAG[1][0] + 14 + rng() * 8, BAG[1][1] - 10 - rng() * 10], d = hyp(f.x, f.y, ...miss), dur = d / armSpeed(who) + 0.1;
      cutAt(sc.ball, rel);
      sc.ball.push({ type: 'throw', t0: rel, t1: rel + dur, p0: [f.x, f.y, 6.5], p1: [...miss, 0.5], H: clamp(d * 0.05, 3, 14), k: 0.08, skew: 1 });
      act(F[who], rel + 0.4, 'stand');
      used.add('1B');
      runTo(F['1B'], REACT, ...BAG[1], 20, 'cover');
      act(F['1B'], rel + dur - 0.35, 'jump');                  // 뛰어올라 보지만 닿지 않는다
      act(F['1B'], rel + dur - 0.35 + JUMP_MS, 'stand');
      const ux = (miss[0] - f.x) / d, uy = (miss[1] - f.y) / d;
      const roll = simGround([...miss, 0.5], [ux * 34, uy * 34, 4], rel + dur, 6);
      sc.sounds.push({ t: rel + dur, name: 'ooh' });
      const I2 = fieldBall('1B', roll, rel + dur + 0.4);
      last = I2.t;
    } else {
      // 잡는 순간 글러브에 맞고 튄다
      sc.ball.pop();                                            // 잡은 것(hold) 취소
      cutAt(sc.ball, I.t);
      const [dx, dy] = polar(ang + (rng() < 0.5 ? -70 : 70) + randNormal(rng) * 20, 1);
      const defl = simGround([I.x, I.y, 1.5], [dx * 15, dy * 15, 6], I.t, 4);
      sc.sounds.push({ t: I.t, name: 'ooh' });
      act(F[who], I.t + 0.05, 'stand');
      const I2 = fieldBall(who, defl, I.t + 0.35);
      const dur = hyp(I2.x, I2.y, ...BAG[1]) / armSpeed(who) + 0.1, rel = Math.max(I2.t + 0.45, tB + 0.2 - dur);
      act(F[who], rel - 0.3, 'throw');
      const arr = throwBall(who, rel, BAG[1]);
      act(F[who], rel + 0.4, 'stand');
      receive('1B', BAG[1], REACT, arr, 'stand');
      last = arr;
    }
    R.forEach((r, i) => r && runBases(r, 0.15, i + 1, i + 2, 23));    // 주자는 모두 한 베이스씩
    sc.watch.push({ kind: 'r', id: 0, t0: I.t, t1: tB + 0.5 });
    sc.decisive = Math.max(last, tB) + 0.35;
  } else if (style === 'liner' || event === 'LINE_DP') {
    // 직선타: 낮고 빠르게 내야수 정면(한두 걸음 옆)으로. 병살이면 뛰어나갔던 주자가 귀루하기 전에 그 베이스로 던진다
    const who = nearest(polar(ang, 130), IF);
    const [sx, sy] = SPOTS[who], x = sx + randNormal(rng) * 3, y = sy - 2;
    const T = hyp(0, 0, x, y) / (125 + rng() * 25), zc = 4 + rng() * 2;
    sc.ball.push({ type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, zc], H: 2 + rng() * 2, k: 0.05, skew: 1 });
    used.add(who);
    runTo(F[who], 0.12, x, y - 1.2, 16, 'catch');
    act(F[who], Math.max(0.15, T - 0.18), 'catch');
    hold(who, T);
    sc.sounds.push({ t: T, name: 'mitt' });
    sc.outs.push(T);
    sc.watch.push({ kind: 'f', id: who, t0: 0.1, t1: T + 0.8 });
    act(B.keys, 0.25, 'drop');
    runTo(B.keys, 0.45, BASES[1][0] * 0.2, BASES[1][1] * 0.2, 18, 'stand');
    let outT = T;
    const li = event === 'LINE_DP' ? R.findIndex(Boolean) : -1;
    R.forEach((r, i) => {
      if (!r) return;
      const base = BASES[i + 1];
      runTo(r.keys, 0.1, ...baseAlong(i + 1, i === li ? 30 : 20), i === li ? 20 : 12, 'run');   // 맞는 순간 뛰어나간다
      if (i !== li) { runTo(r.keys, T + 0.1, ...base, 16, 'stand'); return; }
      const b = i + 1, rcv = b === 1 ? '1B' : b === 2 ? (who === 'SS' ? '2B' : 'SS') : '3B';
      if (rcv === who) {
        outT = runTo(F[who], T + 0.3, ...BAG[b], 18, 'tag');
        act(F[who], outT + 0.4, 'stand');
        sc.sounds.push({ t: outT, name: 'mitt' });
      } else {
        act(F[who], T + 0.22, 'throw');
        outT = throwBall(who, T + 0.42, BAG[b]);
        act(F[who], T + 0.8, 'stand');
        receive(rcv, BAG[b], REACT, outT, 'stand');
      }
      arriveAt(r.keys, T + 0.15, outT + 0.25, ...base, 25, 'stand');
      slideIn(r.keys, 0.3, 0.4);
      runTo(r.keys, outT + 0.9, base[0] * 0.8, base[1] * 0.8 - 12, 7, 'stand');   // 아웃: 더그아웃 쪽으로
      sc.outs.push(outT);
      sc.watch.push({ kind: 'r', id: sc.runners.indexOf(r), t0: T, t1: outT + 0.5 });
    });
    sc.decisive = Math.max(T + 0.6, outT + 0.35);
  } else if (event === 'OUT' && fly && (style === 'dive' || style === 'wall')) {
    // 호수비: dive = 뛰어서는 못 닿는 곳에 떨어지는 공을 몸을 날려 잡는다 / wall = 펜스를 넘어가려던 공을 뛰어올라 잡는다
    let who, x, y, T;
    if (style === 'wall') {
      who = nearest(polar(ang, 300), OF);
      ang = angOf(...SPOTS[who]) + randNormal(rng) * 8;
      [x, y] = polar(ang, fenceAt(ang) - 2.5);
      const H = 82 + rng() * 14; T = hang(H);
      sc.ball.push({ type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, FENCE_H + 1.2], H, k: 0.3, skew: 1.16 });
      used.add(who);
      const [wx, wy] = polar(ang, fenceAt(ang) - 4);
      const sp = Math.max(runSpeed(who), hyp(...SPOTS[who], wx, wy) / Math.max(0.6, T - 1.0 - REACT));
      const arr = runTo(F[who], REACT, wx, wy, sp, 'camp');
      act(F[who], Math.max(arr + 0.05, T - 0.32), 'jump');
      act(F[who], T - 0.32 + JUMP_MS, 'catch');
      act(F[who], T + 0.9, 'stand');
      sc.sounds.push({ t: T, name: 'ooh' });
    } else {
      who = nearest(polar(ang, 250), OF);
      const H = 48 + rng() * 14; T = hang(H);
      const f0 = SPOTS[who], reach = runSpeed(who) * (T - REACT - 0.4) + 10;
      const turn = 35 + rng() * 45, side = rng() < 0.5 ? -1 : 1;                       // 앞쪽 비스듬히(파울 지역으로는 안 간다)
      const spot = sg => { const q = polar(angOf(-f0[0], -f0[1]) + sg * turn, reach); return [f0[0] + q[0], f0[1] + q[1]]; };
      [x, y] = spot(side);
      if (Math.abs(angOf(x, y)) > 42) [x, y] = spot(-side);
      sc.ball.push({ type: 'fly', t0: 0, t1: T, p0: P0, p1: [x, y, 1.3], H, k: 0.3, skew: 1.16 });
      used.add(who);
      const d = hyp(...f0, x, y), ux = (x - f0[0]) / d, uy = (y - f0[1]) / d;
      const tDive = T - 0.38, sx = x - ux * 10, sy = y - uy * 10;
      runTo(F[who], REACT, sx, sy, hyp(...f0, sx, sy) / Math.max(0.4, tDive - REACT), 'dive');
      key(F[who], T, x - ux * 2, y - uy * 2, 'dive');
      act(F[who], T + 0.75, 'stand');
      sc.sounds.push({ t: T, name: 'ooh' });
    }
    hold(who, T);
    sc.sounds.push({ t: T, name: 'mitt' });
    sc.outs.push(T);
    sc.distM = Math.round(hyp(0, 0, x, y) * 0.3048);
    sc.watch.push({ kind: 'f', id: who, t0: 0.3, t1: T + 1 });
    act(B.keys, 0.25, 'drop');
    key(B.keys, 0.45, B.keys[0].x, B.keys[0].y, 'run');
    const toFirst = 0.45 + 90 / 25;
    if (T < toFirst) { const k = (T - 0.45) / (toFirst - 0.45); key(B.keys, T, BASES[1][0] * k, BASES[1][1] * k, 'stand'); }
    else { key(B.keys, toFirst, ...BASES[1], 'run'); key(B.keys, T, BASES[1][0] + 8, BASES[1][1] + 30, 'stand'); }
    R.forEach((r, i) => {
      if (!r) return;
      runTo(r.keys, 0.4, ...baseAlong(i + 1, 24), 13, 'lead');
      runTo(r.keys, T + 0.1, ...BASES[i + 1], 18, 'stand');
    });
    sc.decisive = T + 0.9;
  } else if (event === 'OUT' && fly || event === 'SAC_FLY') {
    let who, dist, H;
    if (event === 'SAC_FLY') { who = OF[Math.floor(rng() * 3)]; ang = angOf(...SPOTS[who]) + randNormal(rng) * 4; dist = hyp(0, 0, ...SPOTS[who]) + 5 + rng() * 25; H = 75 + rng() * 15; }
    else if (style === 'pop') {                     // 내야 뜬공: 아주 높이 떠서 내야수가 제자리 근처에서
      who = nearest(polar(ang, 120), IF);
      ang = clamp(angOf(...SPOTS[who]) + randNormal(rng) * 8, -40, 40);
      dist = clamp(hyp(0, 0, ...SPOTS[who]) - 15 + randNormal(rng) * 10, 50, 145);
      H = 95 + rng() * 25;
    } else if (style === 'foul') {                  // 파울플라이: 포수 뒤나 1·3루 옆 파울 지역
      const s = rng() < 0.35 ? 0 : ang < 0 ? -1 : 1;
      if (s === 0) { who = 'C'; ang = (rng() < 0.5 ? -1 : 1) * (100 + rng() * 30); dist = 30 + rng() * 25; H = 70 + rng() * 15; }
      else { who = s < 0 ? '3B' : '1B'; ang = s * (52 + rng() * 10); dist = 85 + rng() * 45; H = 60 + rng() * 15; }
    } else {
      const deep = rng() < 0.55;
      who = deep ? nearest(polar(ang, 280), OF) : nearest(polar(ang, 160), [...IF, ...OF]);
      ang = angOf(...SPOTS[who]) + randNormal(rng) * 6;
      dist = hyp(0, 0, ...SPOTS[who]) + randNormal(rng) * (IF.includes(who) ? 12 : 25);
      H = IF.includes(who) ? 70 + rng() * 25 : deep ? 80 + rng() * 15 : 55 + rng() * 15;
    }
    if (Math.abs(ang) <= 45) dist = Math.min(dist, fenceAt(ang) - 8);
    const [x, y] = polar(ang, dist);
    const T = catchFly(who, x, y, H);
    if (style !== 'pop' && style !== 'foul') sc.distM = Math.round(dist * 0.3048);
    if (style === 'foul') sc.sounds.push({ t: T, name: 'ooh' });
    sc.outs.push(T);
    // 타자는 1루 쪽으로 뛰다가 잡히면 멈춘다
    act(B.keys, 0.25, 'drop');
    key(B.keys, 0.45, B.keys[0].x, B.keys[0].y, 'run');
    const toFirst = 0.45 + 90 / 25;
    if (T < toFirst) { const k = (T - 0.45) / (toFirst - 0.45); key(B.keys, T, BASES[1][0] * k, BASES[1][1] * k, 'stand'); }
    else { key(B.keys, toFirst, ...BASES[1], 'run'); key(B.keys, T, BASES[1][0] + 8, BASES[1][1] + 30, 'stand'); }
    // 누상 주자: 몇 걸음 나갔다가 잡히면 돌아온다. 희생플라이면 3루 주자는 붙어 있다가 홈으로
    R.forEach((r, i) => {
      if (!r) return;
      const base = BASES[i + 1];
      if (event === 'SAC_FLY' && i === 2) {
        runTo(r.keys, 0.3, ...base, 14, 'tag');
        const home = runTo(r.keys, T + 0.05, 0, 0, 27, 'stand');
        slideIn(r.keys);
        sc.watch.push({ kind: 'r', id: sc.runners.indexOf(r), t0: T, t1: home + 0.4 });
        // 홈 송구는 한 발 늦게
        act(F[who], T + 0.25, 'throw');
        const rel = T + 0.6, arr = throwBall(who, rel, [0.5, 2]);
        act(F[who], rel + 0.45, 'stand');
        receive('C', [0.5, 2], 0.6, arr, 'stand');
        sc.decisive = Math.max(home, arr) + 0.3;
        return;
      }
      const [lx, ly] = baseAlong(i + 1, 22);
      runTo(r.keys, 0.4, lx, ly, 12, 'lead');
      runTo(r.keys, T + 0.1, ...base, 16, 'stand');
    });
    if (!sc.decisive) {
      // 공을 내야로 돌려준다
      act(F[who], T + 0.4, 'throw');
      const rel = T + 0.75, tgt = IF.includes(who) ? SPOTS.P : BAG[2], rcv = IF.includes(who) ? 'P' : (ang < 0 ? 'SS' : '2B');
      const arr = throwBall(who, rel, tgt);
      act(F[who], rel + 0.45, 'stand');
      receive(rcv, tgt, REACT + 0.5, arr, 'hold');
      sc.decisive = T + 0.45;
    }
  } else {
    // 땅볼 아웃 / 병살
    const dp = event === 'DOUBLE_PLAY';
    let who = nearest(polar(ang, 140), IF);
    if (dp && who === '1B') who = '2B';
    ang = angOf(...SPOTS[who]) + randNormal(rng) * 5;
    const path = groundPath(ang, 80 + rng() * 30, -6 + rng() * 5);
    const I = fieldBall(who, path, 0.3);
    act(F[who], I.t + 0.3, 'throw');
    let rel = I.t + 0.55, outT;
    if (dp) {
      const pivot = who === 'SS' || who === '3B' ? '2B' : 'SS';
      const a1 = throwBall(who, rel, BAG[2]);
      act(F[who], rel + 0.4, 'stand');
      receive(pivot, BAG[2], REACT, a1, 'throw');
      // 1루 주자는 2루에서 아웃
      const r1 = R[0];
      if (r1) { runTo(r1.keys, 0.15, ...BASES[2], Math.min(27, hyp(r1.keys[0].x, r1.keys[0].y, ...BASES[2]) / Math.max(0.5, a1 + 0.2 - 0.15)), 'stand'); slideIn(r1.keys); runTo(r1.keys, a1 + 0.5, -14, 120, 8, 'stand'); }
      const rel2 = a1 + 0.35;
      const a2 = throwBall(pivot, rel2, BAG[1]);
      act(F[pivot], rel2 + 0.4, 'stand');
      receive('1B', BAG[1], REACT, a2, 'stand');
      sc.outs.push(a1, a2);
      outT = a2;
    } else if (who === '1B') {
      // 1루수가 잡아서 직접 베이스를 밟는다
      outT = runTo(F['1B'], I.t + 0.2, ...BASES[1], 22, 'tag');
      act(F['1B'], outT + 0.4, 'stand');
      sc.sounds.push({ t: outT, name: 'mitt' });
      sc.outs.push(outT);
    } else {
      outT = throwBall(who, rel, BAG[1]);
      act(F[who], rel + 0.4, 'stand');
      receive('1B', BAG[1], REACT, outT, 'stand');
      sc.outs.push(outT);
    }
    batterTo1B(outT);
    // 땅볼이면 포스된 주자는 무조건 다음 베이스로 뛴다(규칙 계산 groundAdvance와 같은 진루). 병살 1루 주자는 위에서 2루 아웃
    const to = groundAdvance(bases);
    R.forEach((r, i) => {
      if (!r || r.keys.length > 1) return;
      if (to[i] > i + 1) { runBases(r, 0.12, i + 1, to[i], 25); return; }
      const [lx, ly] = baseAlong(i + 1, 18);                 // 포스가 아닌 주자: 리드했다가 돌아온다
      runTo(r.keys, 0.4, lx, ly, 12, 'lead');
      runTo(r.keys, outT + 0.1, ...BASES[i + 1], 16, 'stand');
    });
    sc.decisive = outT + 0.35;
  }

  // 남은 수비수: 공 쪽을 보며 몇 걸음, 내야수는 가까운 베이스로
  const bl = (() => { const s = sc.ball.find(q => q.type === 'fly') || sc.ball.find(q => q.type === 'path'); if (!s) return [0, 120]; const p = s.type === 'fly' ? s.p1 : pathPos(s, s.t1); return [p[0], p[1]]; })();
  // 뜬공(파울·홈런 제외): 떨어지는 곳 가까이(110피트 안)의 수비수는 그쪽으로 달려간다. 잡는 사람과 부딪히지 않게 14피트 앞에서 멈춘다
  const flyS = event !== 'HR' && style !== 'foul' && !steal ? sc.ball.find(q => q.type === 'fly') : null;
  const converge = (n, keys) => {
    if (!flyS) return false;
    const a = angOf(flyS.p1[0], flyS.p1[1]), r = Math.min(hyp(0, 0, flyS.p1[0], flyS.p1[1]), fenceAt(a) - 6);
    const [lx, ly] = polar(a, r), [sx, sy] = SPOTS[n], d = hyp(sx, sy, lx, ly);
    if (d > 110 || d < 16) return false;
    const go = Math.min(reachBy(n, flyS.t1 - flyS.t0) + 4, d - 14), k = go / d;
    runTo(keys, REACT + 0.05, sx + (lx - sx) * k, sy + (ly - sy) * k, runSpeed(n), 'watch');
    return true;
  };
  for (const n of Object.keys(F)) {
    if (used.has(n)) continue;
    const keys = F[n];
    if (n === 'C') { act(keys, 0.45, 'stand'); continue; }
    if (n === 'P') { act(keys, 0.35, 'watch'); continue; }
    if (n === '1B' && !bunt && (hit || event === 'OUT' || event === 'LINE_DP')) { runTo(keys, 0.4, ...BAG[1], 20, 'cover'); continue; }
    if (n === '3B' && hit && !fly) { act(keys, 0.4, 'watch'); continue; }
    if (n !== 'P' && n !== 'C' && converge(n, keys)) continue;
    const [sx, sy] = SPOTS[n], k = OF.includes(n) ? 0.3 : 0.1;
    runTo(keys, 0.35, sx + (bl[0] - sx) * k, sy + (bl[1] - sy) * k, OF.includes(n) ? 16 : 10, 'watch');
  }
  // 누상 주자 중 아직 할 일이 없는 사람은 제자리
  for (const r of sc.runners) if (r.keys.length === 1) act(r.keys, 0.3, 'stand');

  let end = sc.decisive;
  for (const n of Object.keys(F)) end = Math.max(end, lastKey(F[n]).t);
  for (const r of sc.runners) end = Math.max(end, lastKey(r.keys).t);
  sc.end = end + 1;
  sc.decisiveMs = toMs(sc.decisive);
  sc.endMs = toMs(sc.end);
  return sc;
}

// 연습장 장면: 수비수·주자 없이 공만. 수비수가 잡던 순간부터는 공이 그대로 떨어져 구른다(그 뒤 송구는 지운다)
export function practicePlay(sc) {
  const out = { ...sc, fielders: {}, runners: [], watch: [], ballUntil: undefined };
  const segs = sc.ball, hi = segs.findIndex(q => q.type === 'hold');
  let stopT = sc.landT ?? 0;
  if (hi >= 0) {
    const th = segs[hi].t0, pre = segs.slice(0, hi), dt = 1 / 30;
    const at = t => ballAt({ ball: pre }, t).p;
    const p = at(th), q = at(Math.max(0, th - dt));
    const v = [(p[0] - q[0]) / dt, (p[1] - q[1]) / dt, (p[2] - q[2]) / dt];
    const roll = simGround([p[0], p[1], Math.max(0, p[2])], v, th);
    out.ball = [...pre, roll];
    stopT = Math.max(stopT, th + Math.min(1.2, roll.t1 - th));
  } else out.ball = segs.slice();
  out.sounds = sc.sounds.filter(x => x.name !== 'mitt' && x.name !== 'cheer' && (hi < 0 || x.t <= segs[hi].t0 || x.name === 'fence'));
  out.decisive = Math.max(0.8, Math.min(sc.decisive, stopT + 0.6));
  out.end = out.decisive + 1;
  out.decisiveMs = toMs(out.decisive); out.endMs = toMs(out.end);
  return out;
}
