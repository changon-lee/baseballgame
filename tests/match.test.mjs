import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { cpuChoosePitch, cpuSwing } from '../js/core/ai.js';
import { createMatch, matchup, playUserPitch, cpuPitchToUser, resolveUserSwing, changePitcher, cpuMaybeChangePitcher } from '../js/core/match.js';

const sam = getTeam('samsung'), lg = getTeam('lg');
const mk = (innings = 9, seed = 1) => createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings, rng: createRng(seed) });
const throwStrike = (m, rng) => playUserPitch(m, { type: 'FB', target: { x: 0, y: 0 }, gaugePos: 0.5 }, rng);

test('user pitches in top, bats in bottom', () => {
  let m = mk(); assert.equal(matchup(m).userRole, 'pitch');
  m = { ...m, game: { ...m.game, half: 'bottom' } };
  assert.equal(matchup(m).userRole, 'bat');
});
test('pitch count increments per pitch', () => {
  const rng = createRng(2); let m = mk();
  m = throwStrike(m, rng).match; m = throwStrike(m, rng).match;
  assert.equal(m.pitchCount.home, 2);
});
test('changePitcher resets count and marks used', () => {
  const rng = createRng(2); let m = throwStrike(mk(), rng).match;
  const starter = m.pitcher.home, rp = sam.pitchers.find(p => p.role === 'RP').id;
  m = changePitcher(m, 'home', rp);
  assert.equal(m.pitcher.home, rp); assert.equal(m.pitchCount.home, 0); assert.ok(m.used.home.has(starter));
});
test('cannot bring back a used pitcher', () => {
  let m = mk(); const starter = m.pitcher.home, rp = sam.pitchers.find(p => p.role === 'RP').id;
  m = changePitcher(m, 'home', rp);
  const again = changePitcher(m, 'home', starter);
  assert.equal(again.pitcher.home, rp);
});
test('no swing on strike-zone pitch is STRIKE', () => {
  const m = { ...mk(), game: { ...mk().game, half: 'bottom' } };
  const pitch = { ...cpuPitchToUser(m, createRng(3)), plate: { x: 0, y: 0 }, isStrike: true };
  assert.equal(resolveUserSwing(m, pitch, null, createRng(3)).event, 'STRIKE');
});
test('no swing on far ball is BALL', () => {
  const m = { ...mk(), game: { ...mk().game, half: 'bottom' } };
  const pitch = { ...cpuPitchToUser(m, createRng(3)), plate: { x: 1.5, y: 0 }, isStrike: false };
  assert.equal(resolveUserSwing(m, pitch, null, createRng(3)).event, 'BALL');
});
test('user swing counts a pitch for the cpu pitcher', () => {
  const m = { ...mk(), game: { ...mk().game, half: 'bottom' } };
  const pitch = cpuPitchToUser(m, createRng(3));
  assert.equal(resolveUserSwing(m, pitch, 0, createRng(3)).match.pitchCount.away, 1);
});
test('cpu changes tired pitcher', () => {
  const m = { ...mk(), pitchCount: { home: 0, away: 150 } };
  const before = m.pitcher.away;
  assert.notEqual(cpuMaybeChangePitcher(m, createRng(1)).pitcher.away, before);
});
test('fresh cpu pitcher stays in', () => {
  const m = mk(); assert.equal(cpuMaybeChangePitcher(m, createRng(1)).pitcher.away, m.pitcher.away);
});
for (let seed = 1; seed <= 20; seed++) test(`full CPU-vs-CPU 9 inning game ends (seed ${seed})`, () => {
  const rng = createRng(seed); let m = mk(9, seed), pitches = 0;
  while (!m.game.over && pitches < 3000) {
    m = cpuMaybeChangePitcher(m, rng);
    const mu = matchup(m);
    if (mu.userRole === 'pitch') {
      const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng });
      m = playUserPitch(m, c, rng).match;
    } else {
      const p = cpuPitchToUser(m, rng);
      const s = cpuSwing({ batter: mu.batter, pitch: p, balls: m.game.balls, strikes: m.game.strikes, rng });
      m = resolveUserSwing(m, p, s.swing ? s.timingDiffMs : null, rng).match;
    }
    pitches++;
  }
  assert.ok(m.game.over, `not over after ${pitches}`);
});
