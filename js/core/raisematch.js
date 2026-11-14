// 육성모드 경기 진행: 내 선수 장면(타자면 내 타석, 선발이면 내가 던지는 초 공격, 마무리면 9·10회초)까지 자동으로 넘기고,
// 대타·강판·등판 여부를 정한다. 삼성은 늘 홈(말 공격)이다.
// raise = { kind: 'bat'|'pitch', role: null|'SP'|'CL', playerId, cond }
import { matchup, simulateUntil, simulateRest, changePitcher } from './match.js';
import { fatigue } from './pitch.js';
import { battingSide, applyEvent, stealRunners } from './rules.js';
import { availableRelievers } from './team.js';
import { playerLine } from './growth.js';

export const PULL_FATIGUE = 0.6;        // 컴퓨터 투수 교체와 같은 기준
export const PULL_RUNS = 5;             // 한 이닝에 이만큼 주면 그 이닝 뒤 강판
export const PINCH = { inning: 7, cond: -1, so: 2 };
export const CLOSE_GAP = 3;             // 마무리는 9회초 시작 때 점수 차가 이 이하일 때만

const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const out = (m, note, from) => ({ match: m, phase: 'done', note, skipped: m !== from });
const me = (m, from) => ({ match: m, phase: 'me', note: null, skipped: m !== from });
const finish = (m, rng, note, from) => out(m.game.over ? m : simulateRest(m, rng), note, from);

export function raiseStep(m, raise, rng) {
  if (m.game.over) return out(m, 'end', m);
  if (raise.kind === 'bat') return batStep(m, raise, rng);
  return raise.role === 'CL' ? closerStep(m, raise, rng) : starterStep(m, raise, rng);
}

// ── 내 타자의 도루 ──
// 내 타석이 끝나고 내가 1루(또는 2루)에 있으면, 다음 타자 첫 공 전에 도루할지 묻는다(phase 'steal').
// 성공 확률은 주력으로: 2루 = 0.45 + 주력 × 0.005(주력 50 → 70%, 90 → 90%), 3루는 8%p 낮게
export const RUN_SPEED = 50;
export const STEAL = { base: 0.45, perSpeed: 0.005, third: -0.08, min: 0.3, max: 0.95 };
export const stealOdds = (base, speed = RUN_SPEED) =>
  Math.max(STEAL.min, Math.min(STEAL.max, STEAL.base + speed * STEAL.perSpeed + (base === 1 ? STEAL.third : 0)));
// 타석 결과 → 타자가 선 베이스(0=1루, 1=2루). 안 나갔거나 알 수 없으면 없음
const REACH = { SINGLE: 0, WALK: 0, HBP: 0, ERROR: 0, DOUBLE: 1 };
const speedOf = (m, id) => { const b = m.teams.home.batters.find(x => x.id === id); return (b && b.speed) ?? RUN_SPEED; };

// 지금 도루를 물어볼 자리 { base: 내가 있는 베이스, p: 성공 확률 } 또는 null
export function stealSpot(m, id) {
  const g = m.game, n = m.log.length, e = m.log[n - 1];
  if (!e || e.batterId !== id || g.over || (m.pa && m.pa.length) || g.inning !== e.inning || g.half !== e.half || battingSide(g) !== 'home') return null;
  let base = e.play === 'BUNT_FC' ? 0 : REACH[e.event];
  if (base == null) return null;
  const my = m.myRun && m.myRun.at === n ? m.myRun : null;     // 이번 타석 뒤에 이미 뛰었거나 안 뛰기로 했다
  if (my) { if (my.stop) return null; base = my.base; }
  if (base > 1 || !g.bases[base] || g.bases[base + 1]) return null;
  const st = stealRunners(g.bases);
  if (!st || st.lead !== base) return null;
  return { base, p: stealOdds(base, speedOf(m, id)) };
}

// 도루한다(go) / 안 한다. 돌려주는 것: { match, ok, lead, trail } (안 하면 ok = null)
export function raiseSteal(m, id, go, rng) {
  const n = m.log.length, spot = stealSpot(m, id);
  if (!spot || !go) return { match: { ...m, myRun: { at: n, stop: true } }, ok: null };
  const st = stealRunners(m.game.bases), ok = rng() < spot.p;
  const game = applyEvent(m.game, ok ? 'STEAL' : 'CAUGHT_STEALING').state;
  return {
    match: { ...m, game, myRun: ok ? { at: n, base: spot.base + 1 } : { at: n, stop: true }, steals: [...(m.steals || []), { id, ok, base: spot.base + 1 }] },
    ok, lead: st.lead, trail: st.trail,
  };
}

// ── 타자 ──
function batStep(m0, { playerId: id, cond }, rng) {
  if (!m0.lineups.home.order.includes(id)) return finish(m0, rng, 'pinch', m0);
  const spot = stealSpot(m0, id);
  if (spot) return { match: m0, phase: 'steal', spot, note: null, skipped: false };
  const isMe = x => battingSide(x.game) === 'home' && matchup(x).batter.id === id;
  const m = simulateUntil(m0, rng, isMe);
  if (m.game.over) return out(m, 'end', m0);
  const mine = m.log.filter(e => e.batterId === id);
  const cold = m.game.inning >= PINCH.inning && cond <= PINCH.cond && m.game.balls + m.game.strikes === 0
    && !mine.some(e => HIT.includes(e.event)) && mine.filter(e => e.event === 'STRIKEOUT').length >= PINCH.so;
  if (!cold) return me(m, m0);
  const bench = m.teams.home.batters.find(b => !m.lineups.home.order.includes(b.id));
  if (!bench) return me(m, m0);
  const order = m.lineups.home.order.map(x => (x === id ? bench.id : x));
  return finish({ ...m, lineups: { ...m.lineups, home: { ...m.lineups.home, order } } }, rng, 'pinch', m0);
}

// 내 투수를 불펜 투수로 바꾼다(남은 불펜이 없으면 그대로)
function pullMe(m, rng) {
  const avail = availableRelievers(m.teams.home, m.used.home, m.pitcher.home);
  const rps = avail.filter(p => p.role === 'RP'), pool = rps.length ? rps : avail;
  if (!pool.length) return m;
  return changePitcher(m, 'home', pool[Math.floor(rng() * pool.length)].id);
}

const runsInHalf = (log, id, inning) => log.reduce((a, e) => a + (e.pitcherId === id && e.inning === inning && e.half === 'top' ? e.runs || 0 : 0), 0);

// ── 선발 ──
function starterStep(m0, { playerId: id }, rng) {
  if (m0.pitcher.home !== id) return finish(m0, rng, 'pulled', m0);
  const m = simulateUntil(m0, rng, x => x.game.half === 'top' || x.pitcher.home !== id);
  if (m.game.over) return out(m, 'end', m0);
  if (m.pitcher.home !== id) return finish(m, rng, 'pulled', m0);
  const fresh = m.game.balls + m.game.strikes === 0;          // 강판은 타석 사이에만
  const tired = fresh && fatigue(m.pitchCount.home, matchup(m).pitcher.stamina) >= PULL_FATIGUE;
  const blown = fresh && m.game.outs === 0 && m.game.inning > 1 && runsInHalf(m.log, id, m.game.inning - 1) >= PULL_RUNS
    && !m.log.some(e => e.inning === m.game.inning && e.half === 'top');
  if (tired || blown) return finish(pullMe(m, rng), rng, 'pulled', m0);
  return me(m, m0);
}

// ── 마무리 ──
function closerStep(m0, { playerId: id }, rng) {
  let m = m0;
  if (m.raiseIn && m.pitcher.home !== id) return finish(m, rng, 'end', m0);   // 등판했다가 내려갔다(스스로 교체 포함)
  const pitched = m.log.some(e => e.pitcherId === id);
  if (m.pitcher.home === id) {
    m = simulateUntil(m, rng, x => x.game.half === 'top' || x.pitcher.home !== id);
    if (m.game.over) return out(m, 'end', m0);
    if (m.pitcher.home !== id) return finish(m, rng, 'end', m0);
    if (m.game.inning > 10) return finish(pullMe(m, rng), rng, 'end', m0);
    return me(m, m0);
  }
  if (pitched) return finish(m, rng, 'end', m0);
  // 아직 안 나왔다: 컴퓨터 교체에서 빠지게 '쓴 투수'로 묶어 두고 9회초 시작까지 넘긴다
  if (!m.used.home.has(id)) m = { ...m, used: { ...m.used, home: new Set([...m.used.home, id]) } };
  m = simulateUntil(m, rng, x => x.game.inning >= 9 && x.game.half === 'top');
  if (m.game.over) return out(m, 'noshow', m0);
  if (m.game.inning > 9 || m.game.outs > 0 || Math.abs(m.game.score.home - m.game.score.away) > CLOSE_GAP) return finish(m, rng, 'noshow', m0);
  const used = new Set([...m.used.home, m.pitcher.home]);
  m = { ...m, used: { ...m.used, home: used }, pitcher: { ...m.pitcher, home: id }, pitchCount: { ...m.pitchCount, home: 0 }, raiseIn: true };
  return me(m, m0);
}

// ── 기록 ──
const diff = e => e.score.home - e.score.away;

// 승·패·세이브 (삼성 홈 기준). result: 'home' | 'away' | 'draw'
// 결승점(이긴 팀이 마지막으로 앞서기 시작한 타석)을 기준으로: 패 = 그 점수를 내준 투수, 승 = 그때 삼성 마운드에 있던 투수(선발은 5이닝 이상)
const lastGoAhead = (log, sign) => {
  let k = -1;
  log.forEach((e, i) => { if (Math.sign(diff(e)) === sign && (i ? Math.sign(diff(log[i - 1])) : 0) !== sign) k = i; });
  return k;
};
const homePitcherAt = (log, k) => { for (let i = k; i >= 0; i--) if (log[i].half === 'top') return log[i].pitcherId; return null; };

export function decisions(log, id, role, result) {
  const idx = log.map((e, i) => (e.pitcherId === id ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return { w: 0, l: 0, sv: 0 };
  const first = idx[0], last = idx[idx.length - 1], after = log.slice(last + 1);
  const outs = idx.reduce((a, i) => a + (log[i].outs || 0), 0);
  const gw = result === 'home' ? lastGoAhead(log, 1) : -1, gl = result === 'away' ? lastGoAhead(log, -1) : -1;
  const w = gw >= 0 && homePitcherAt(log, gw) === id && (role !== 'SP' || outs >= 15) ? 1 : 0;
  const l = gl >= 0 && log[gl].pitcherId === id ? 1 : 0;
  const before = first > 0 ? diff(log[first - 1]) : 0;
  const sv = role === 'CL' && !w && result === 'home' && before >= 1 && before <= CLOSE_GAP
    && idx.every(i => diff(log[i]) > 0) && !after.some(e => e.half === 'top') ? 1 : 0;
  return { w, l, sv };
}

// 그 경기 내 기록 한 줄 { bat, pit } (없으면 null)
export function gameLine(log, id) {
  const line = playerLine({}, log.filter(e => e.batterId === id || e.pitcherId === id));
  return { bat: line.bat[id] || null, pit: line.pit[id] || null };
}
