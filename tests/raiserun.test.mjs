// 육성모드 주력·주루 훈련·도루: 주력이 빠를수록 땅볼에 1루에서 살고, 도루 성공 확률이 오른다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAISE, DRILLS, newSlot, choose, slotPlayer, raiseTeam, xpPerTraining, prelude, applyDay, instant } from '../js/core/raise.js';
import { stealOdds, stealSpot, raiseSteal, raiseStep } from '../js/core/raisematch.js';
import { battedBallInfo } from '../js/core/outcome.js';
import { createMatch, simulateUntil, simulateRest } from '../js/core/match.js';
import { defaultLineup } from '../js/core/team.js';
import { getTeam } from '../js/data/rosters.js';
import { createRng } from '../js/core/rng.js';

const ME = 'samsung-b01';                                     // 김지찬

test('every Samsung batter has a speed in raise mode only; the run drill trains it at once', () => {
  assert.equal(slotPlayer(newSlot('samsung-b01')).speed, 90);
  assert.equal(slotPlayer(newSlot('samsung-b07')).speed, 22);   // 강민호
  assert.ok(getTeam('samsung').batters.every(b => b.speed == null));   // 시즌·대결 모드 명단은 그대로
  const d = DRILLS.find(x => x.id === 'run');
  assert.deepEqual([d.kind, d.stat, d.name, d.cost, instant(d)], ['bat', 'speed', '주루 훈련', RAISE.runCost, true]);
  const s = { ...newSlot('samsung-b06'), fatigue: 0 };        // 김영웅 주력 55
  const r = choose(s, 'run');
  const xp = r.slot.growth.xp['samsung-b06'].speed + 12 * ((r.slot.growth.delta['samsung-b06'] || {}).speed || 0);
  assert.ok(Math.abs(xp - xpPerTraining('speed', 55) * RAISE.runXp) < 1e-9);
  assert.equal(r.slot.fatigue, RAISE.runCost);
  let t = s;
  for (let i = 0; i < 8; i++) t = choose({ ...t, chosen: false, fatigue: 0 }, 'run').slot;
  assert.ok(slotPlayer(t).speed > 55, `speed ${slotPlayer(t).speed}`);
});

test('speed 50 (or none) keeps the old odds; a fast runner beats out more grounders and hits into fewer double plays', () => {
  const roll = (speed, n = 6000) => {
    const rng = createRng(11); let ifs = 0, dp = 0;
    for (let i = 0; i < n; i++) {
      const e = battedBallInfo({ quality: 0.3, power: 50, outs: 0, runnerOnFirst: true, runnerOnThird: false, rng, lift: -0.5, ...(speed == null ? {} : { speed }) }).event;
      if (e === 'INFIELD_SINGLE') ifs++; if (e === 'DOUBLE_PLAY') dp++;
    }
    return { ifs, dp };
  };
  assert.deepEqual(roll(50), roll(null));
  const fast = roll(90), slow = roll(25);
  assert.ok(fast.ifs > slow.ifs * 1.4, `${fast.ifs} vs ${slow.ifs}`);
  assert.ok(fast.dp < slow.dp, `${fast.dp} vs ${slow.dp}`);
});

test('steal odds rise with speed and are lower for third', () => {
  assert.ok(stealOdds(0, 90) > stealOdds(0, 50) && stealOdds(0, 50) > stealOdds(0, 20));
  assert.ok(stealOdds(1, 70) < stealOdds(0, 70));
  assert.ok(Math.abs(stealOdds(0, 50) - 0.7) < 1e-9);
  assert.ok(stealOdds(0, 99) <= 0.95 && stealOdds(1, 0) >= 0.3);
});

// 내가 방금 1루타를 치고 1루에 있는 경기(2사 전, 다음 타자 첫 공 전)
function onFirst(bases = [true, false, false], event = 'SINGLE') {
  const slot = newSlot(ME), team = raiseTeam(slot), rng = createRng(3);
  const m = createMatch({ userTeam: team, cpuTeam: getTeam('lg'), userLineup: defaultLineup(team), innings: 9, rng });
  return { ...m, game: { ...m.game, half: 'bottom', outs: 1, bases }, log: [{ batterId: ME, pitcherId: 'lg-p01', event, inning: 1, half: 'bottom', runs: 0, outs: 0 }], pa: [] };
}

test('after reaching first, raise mode asks to steal; going advances me, staying stops the question', () => {
  const m = onFirst();
  const spot = stealSpot(m, ME);
  assert.deepEqual(spot, { base: 0, p: stealOdds(0, 90) });
  const r = raiseStep(m, { kind: 'bat', role: null, playerId: ME, cond: 0 }, createRng(1));
  assert.equal(r.phase, 'steal');
  // 안 뛴다 → 다시 묻지 않는다
  const stay = raiseSteal(m, ME, false, createRng(1));
  assert.equal(stay.ok, null); assert.equal(stealSpot(stay.match, ME), null);
  // 뛴다(성공하는 씨앗을 찾아서) → 2루, 그다음 3루 도루를 또 묻는다
  let ok = null;
  for (let seed = 1; seed < 50 && !ok; seed++) { const x = raiseSteal(m, ME, true, createRng(seed)); if (x.ok) ok = x; }
  assert.deepEqual(ok.match.game.bases, [false, true, false]);
  assert.deepEqual(ok.match.steals, [{ id: ME, ok: true, base: 1 }]);
  assert.deepEqual(stealSpot(ok.match, ME), { base: 1, p: stealOdds(1, 90) });
  let out = null;
  for (let seed = 1; seed < 200 && !out; seed++) { const x = raiseSteal(m, ME, true, createRng(seed)); if (x.ok === false) out = x; }
  assert.deepEqual(out.match.game.bases, [false, false, false]); assert.equal(out.match.game.outs, 2);
  assert.equal(stealSpot(out.match, ME), null);
});

test('no steal question when the next base is taken, after an out, or once the next batter has seen a pitch', () => {
  assert.equal(stealSpot(onFirst([true, true, false]), ME), null);
  assert.equal(stealSpot(onFirst([false, false, false], 'OUT'), ME), null);
  assert.equal(stealSpot({ ...onFirst(), pa: [{ k: 'FB', v: 145, e: 'BALL' }] }, ME), null);
  assert.equal(stealSpot(onFirst([false, true, false], 'DOUBLE'), ME).base, 1);
  assert.equal(stealSpot(onFirst([false, true, true], 'DOUBLE'), ME), null);
});

test('steals from the game screen count in the season line and feed speed', () => {
  const slot = newSlot(ME), rng = createRng(5);
  const pre = prelude(slot, rng);
  let m = simulateUntil(pre.match, rng, x => x.log.length > pre.match.log.length);
  m = simulateRest(m, rng);
  const g = m.game;
  const result = { home: g.score.home, away: g.score.away, log: m.log, starterId: pre.set.lineup.starterId, raise: { note: 'end' },
    steals: [{ id: ME, ok: true, base: 1 }, { id: ME, ok: true, base: 2 }, { id: ME, ok: false, base: 1 }] };
  const out = applyDay(slot, result, rng);
  assert.equal(out.slot.stats.bat.sb, 2); assert.equal(out.slot.stats.bat.cs, 1);
  assert.equal(out.slot.total.bat.sb, 2);
  assert.deepEqual(out.report.run, { sb: 2, cs: 1 });
  const xp = (out.slot.growth.xp[ME] || {}).speed || 0;
  assert.ok(xp > 0 || ((out.slot.growth.delta[ME] || {}).speed || 0) > 0);
  // 다음 날 도루 없는 경기도 누적이 이어진다
  const next = applyDay(out.slot, null, rng);
  assert.equal(next.slot.stats.bat.sb, 2);
});
