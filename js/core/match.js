// 한 경기 진행. 사용자 팀 = 홈(말 공격), 컴퓨터 팀 = 원정(초 공격).
import { createGameState, applyEvent, battingSide } from './rules.js';
import { computePitch, fatigue } from './pitch.js';
import { swingResult } from './batting.js';
import { battedBallInfo } from './outcome.js';
import { cpuChoosePitch, cpuSwing } from './ai.js';
import { defaultLineup, availableRelievers } from './team.js';

const other = s => (s === 'home' ? 'away' : 'home');
const pitcherOf = (m, side) => m.teams[side].pitchers.find(p => p.id === m.pitcher[side]);
const batterOf = (m, side) => m.teams[side].batters.find(b => b.id === m.lineups[side].order[m.game.battingIndex[side]]);

// cpuLineup: 원정팀 타순(1:1 대결에서 상대가 정한 것). 없으면 기본 타순
export function createMatch({ userTeam, cpuTeam, userLineup, innings, rng, cpuStarterId, cpuLineup = null }) {
  const sps = cpuTeam.pitchers.filter(p => p.role === 'SP');
  const cpuStarter = sps.find(p => p.id === cpuStarterId) || sps[Math.floor(rng() * sps.length)];
  const lineups = { home: userLineup, away: { ...(cpuLineup || defaultLineup(cpuTeam)), starterId: cpuStarter.id } };
  return {
    game: createGameState({ innings }),
    teams: { home: userTeam, away: cpuTeam },
    lineups,
    pitcher: { home: userLineup.starterId, away: cpuStarter.id },
    pitchCount: { home: 0, away: 0 },
    used: { home: new Set(), away: new Set() },
    log: [],                      // 끝난 타석: { batterId, pitcherId, event, runs, outs, inning, half, score, bases, pitches }
    pa: [],                       // 지금 타석에 던진 공: { k: 구종, v: 구속, e: 결과 }
  };
}

export function matchup(m) {
  const bs = battingSide(m.game), ps = other(bs);
  const pitcher = pitcherOf(m, ps);
  return {
    batter: batterOf(m, bs), pitcher, battingSide: bs, pitchingSide: ps,
    userRole: bs === 'away' ? 'pitch' : 'bat',
    fatigue: fatigue(m.pitchCount[ps], pitcher.stamina),
  };
}

// 타석 결과 이름 (볼넷·삼진은 마지막 공 이벤트와 다르다). 기록에는 공식 기록 이름으로 남긴다:
// 내야안타·홈 보살 안타 = 안타, 직선타 병살 = 병살. 원래 장면 이름은 play에 따로 둔다
const PA_OF = { BALL: 'WALK', STRIKE: 'STRIKEOUT', INFIELD_SINGLE: 'SINGLE', SINGLE_HOME_OUT: 'SINGLE', LINE_DP: 'DOUBLE_PLAY' };
const paEvent = e => PA_OF[e] || e;
const OUTS_OF = { STRIKE: 1, OUT: 1, SAC_FLY: 1, DOUBLE_PLAY: 2, LINE_DP: 2, SINGLE_HOME_OUT: 1 };

// 공 하나의 결과를 경기에 반영
function commit(m, event, ps, pitch, fly, style) {
  const mu = matchup(m);
  const { state, runs, paEnded } = applyEvent(m.game, event, { ground: (event === 'OUT' && !fly && style !== 'liner') || event === 'DOUBLE_PLAY' });
  let log = m.log || [];
  let pa = [...(m.pa || []), pitch ? { k: pitch.type, v: pitch.speedKmh, e: event } : { e: event }];
  if (paEnded) {
    const ev = paEvent(event), g = m.game;
    const outs = Math.min(OUTS_OF[event] || 0, 3 - g.outs);
    log = [...log, { batterId: mu.batter.id, pitcherId: mu.pitcher.id, event: ev, runs, outs,
      inning: g.inning, half: g.half, outsBefore: g.outs, bases: [...g.bases], score: { ...state.score }, pitches: pa, fly: !!fly,
      ...(ev !== event && event !== 'BALL' && event !== 'STRIKE' ? { play: event } : {}), ...(style ? { style } : {}) }];
    pa = [];
  }
  return { match: { ...m, game: state, log, pa, pitchCount: { ...m.pitchCount, [ps]: m.pitchCount[ps] + 1 } }, runs, paEnded };
}

// 스윙(또는 노스윙) → 이벤트
function decide(m, batter, pitch, timingDiffMs, rng, bat = null) {
  if (timingDiffMs == null) return { event: pitch.isStrike ? 'STRIKE' : 'BALL', contact: null, fly: false, swung: false };
  const contact = swingResult({ timingDiffMs, batter, pitch, rng, bat });
  if (contact.kind === 'MISS') return { event: 'STRIKE', contact, fly: false, swung: true };
  if (contact.kind === 'FOUL') return { event: 'FOUL', contact, fly: false, swung: true };
  const g = m.game;
  const info = battedBallInfo({ quality: contact.quality, pull: contact.pull, power: batter.power, outs: g.outs,
    runnerOnFirst: g.bases[0], runnerOnSecond: g.bases[1], runnerOnThird: g.bases[2], rng, lift: contact.lift || 0 });
  return { event: info.event, contact, fly: info.fly, style: info.style || null, swung: true };
}

// level: 제구 게이지 난이도(내가 던질 때). 자동 진행은 컴퓨터와 같은 easy
// 이번 타석에서 바로 전에 던진 공 { k, v } (없으면 null)
export const lastPitch = m => { const p = m.pa && m.pa[m.pa.length - 1]; return p && p.k ? p : null; };

export function playUserPitch(m, { type, target, gaugePos, level = 'easy' }, rng) {
  const mu = matchup(m);
  const pitch = computePitch({ pitcher: mu.pitcher, type, target, gaugePos, pitchCount: m.pitchCount[mu.pitchingSide], rng, level });
  const swing = cpuSwing({ batter: mu.batter, pitch, balls: m.game.balls, strikes: m.game.strikes, rng, prev: lastPitch(m) });
  const d = decide(m, mu.batter, pitch, swing.swing ? swing.timingDiffMs : null, rng);
  const c = commit(m, d.event, mu.pitchingSide, pitch, d.fly, d.style);
  return { match: c.match, pitch, swing: swing.swing ? swing : null, event: d.event, contact: d.contact, fly: d.fly, style: d.style, runs: c.runs, paEnded: c.paEnded };
}

export function cpuPitchToUser(m, rng) {
  const mu = matchup(m);
  const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng });
  return computePitch({ pitcher: mu.pitcher, ...c, pitchCount: m.pitchCount[mu.pitchingSide], rng });
}

// 1:1 대결: 서버가 판정(decideSwing, 난수 사용)하고, 서버와 두 폰이 같은 판정을 각자 경기에 반영(applyDecision, 난수 없음)한다
export const decideSwing = (m, pitch, timingDiffMs, rng, bat = null) => decide(m, matchup(m).batter, pitch, timingDiffMs, rng, bat);
export function applyDecision(m, pitch, d) {
  const c = commit(m, d.event, matchup(m).pitchingSide, pitch, d.fly, d.style || null);
  return { match: c.match, pitch, swing: d.swung ? {} : null, event: d.event, contact: d.contact, fly: d.fly, style: d.style || null, runs: c.runs, paEnded: c.paEnded };
}

// bat: 배트를 댄 곳({ x, y, hard }, 존 좌표). 없으면 위치는 따지지 않는다(자동 진행)
export function resolveUserSwing(m, pitch, timingDiffMs, rng, bat = null) {
  const r = applyDecision(m, pitch, decideSwing(m, pitch, timingDiffMs, rng, bat));
  delete r.pitch; delete r.swing;
  return r;
}

export function changePitcher(m, side, pitcherId) {
  const ok = availableRelievers(m.teams[side], m.used[side], m.pitcher[side]).some(p => p.id === pitcherId);
  if (!ok) return m;
  const used = { ...m.used, [side]: new Set([...m.used[side], m.pitcher[side]]) };
  return { ...m, used, pitcher: { ...m.pitcher, [side]: pitcherId }, pitchCount: { ...m.pitchCount, [side]: 0 } };
}

export function cpuMaybeChangePitcher(m, rng, side = 'away') {
  const p = pitcherOf(m, side);
  if (fatigue(m.pitchCount[side], p.stamina) < 0.6) return m;
  const avail = availableRelievers(m.teams[side], m.used[side], p.id);
  const rps = avail.filter(q => q.role === 'RP');
  const pool = rps.length ? rps : avail;
  if (!pool.length) return m;
  return changePitcher(m, side, pool[Math.floor(rng() * pool.length)].id);
}

// ── 사람 손 없이 진행(자동 진행·넘기기) ──
// 공 하나: 양쪽 모두 컴퓨터처럼 던지고 친다. 결과 모양은 playUserPitch와 같다
export function autoPitch(m, rng) {
  const mu = matchup(m);
  const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng });
  return playUserPitch(m, c, rng);
}
// 지친 투수는 양쪽 다 바꾼다
export const autoChangePitchers = (m, rng) => cpuMaybeChangePitcher(cpuMaybeChangePitcher(m, rng, 'away'), rng, 'home');
// until(경기) 이 참이 되거나 경기가 끝날 때까지 공을 던진다
export function simulateUntil(m, rng, until) {
  let x = m, guard = 0;
  while (!x.game.over && !until(x) && guard++ < 5000) {
    x = autoChangePitchers(x, rng);
    x = autoPitch(x, rng).match;
  }
  return x;
}
// 이번 공격(또는 수비)만: 초/말이 바뀌면 멈춘다
export const simulateHalf = (m, rng) => { const { inning, half } = m.game; return simulateUntil(m, rng, x => x.game.inning !== inning || x.game.half !== half); };
export const simulateInning = (m, rng) => { const inn = m.game.inning; return simulateUntil(m, rng, x => x.game.inning !== inn); };
export const simulateRest = (m, rng) => simulateUntil(m, rng, () => false);
