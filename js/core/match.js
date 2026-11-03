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

export function createMatch({ userTeam, cpuTeam, userLineup, innings, rng, cpuStarterId }) {
  const sps = cpuTeam.pitchers.filter(p => p.role === 'SP');
  const cpuStarter = sps.find(p => p.id === cpuStarterId) || sps[Math.floor(rng() * sps.length)];
  const lineups = { home: userLineup, away: { ...defaultLineup(cpuTeam), starterId: cpuStarter.id } };
  return {
    game: createGameState({ innings }),
    teams: { home: userTeam, away: cpuTeam },
    lineups,
    pitcher: { home: userLineup.starterId, away: cpuStarter.id },
    pitchCount: { home: 0, away: 0 },
    used: { home: new Set(), away: new Set() },
    log: [],                      // 끝난 타석: { batterId, pitcherId, event, runs, outs }
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

// 타석 결과 이름 (볼넷·삼진은 마지막 공 이벤트와 다르다)
const paEvent = e => (e === 'BALL' ? 'WALK' : e === 'STRIKE' ? 'STRIKEOUT' : e);
const OUTS_OF = { STRIKEOUT: 1, OUT: 1, SAC_FLY: 1, DOUBLE_PLAY: 2 };

// 공 하나의 결과를 경기에 반영
function commit(m, event, ps) {
  const mu = matchup(m);
  const { state, runs, paEnded } = applyEvent(m.game, event);
  let log = m.log || [];
  if (paEnded) {
    const ev = paEvent(event);
    const outs = Math.min(OUTS_OF[ev] || 0, 3 - m.game.outs);
    log = [...log, { batterId: mu.batter.id, pitcherId: mu.pitcher.id, event: ev, runs, outs }];
  }
  return { match: { ...m, game: state, log, pitchCount: { ...m.pitchCount, [ps]: m.pitchCount[ps] + 1 } }, runs, paEnded };
}

// 스윙(또는 노스윙) → 이벤트
function decide(m, batter, pitch, timingDiffMs, rng) {
  if (timingDiffMs == null) return { event: pitch.isStrike ? 'STRIKE' : 'BALL', contact: null, fly: false, swung: false };
  const contact = swingResult({ timingDiffMs, batter, pitch, rng });
  if (contact.kind === 'MISS') return { event: 'STRIKE', contact, fly: false, swung: true };
  if (contact.kind === 'FOUL') return { event: 'FOUL', contact, fly: false, swung: true };
  const g = m.game;
  const info = battedBallInfo({ quality: contact.quality, pull: contact.pull, power: batter.power, outs: g.outs,
    runnerOnFirst: g.bases[0], runnerOnThird: g.bases[2], rng });
  return { event: info.event, contact, fly: info.fly, swung: true };
}

export function playUserPitch(m, { type, target, gaugePos }, rng) {
  const mu = matchup(m);
  const pitch = computePitch({ pitcher: mu.pitcher, type, target, gaugePos, pitchCount: m.pitchCount[mu.pitchingSide], rng });
  const swing = cpuSwing({ batter: mu.batter, pitch, balls: m.game.balls, strikes: m.game.strikes, rng });
  const d = decide(m, mu.batter, pitch, swing.swing ? swing.timingDiffMs : null, rng);
  const c = commit(m, d.event, mu.pitchingSide);
  return { match: c.match, pitch, swing: swing.swing ? swing : null, event: d.event, contact: d.contact, fly: d.fly, runs: c.runs, paEnded: c.paEnded };
}

export function cpuPitchToUser(m, rng) {
  const mu = matchup(m);
  const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng });
  return computePitch({ pitcher: mu.pitcher, ...c, pitchCount: m.pitchCount[mu.pitchingSide], rng });
}

export function resolveUserSwing(m, pitch, timingDiffMs, rng) {
  const mu = matchup(m);
  const d = decide(m, mu.batter, pitch, timingDiffMs, rng);
  const c = commit(m, d.event, mu.pitchingSide);
  return { match: c.match, event: d.event, contact: d.contact, fly: d.fly, runs: c.runs, paEnded: c.paEnded };
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
