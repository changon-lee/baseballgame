// 불방망이·응원 열기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { createMatch, resolveUserSwing } from '../js/core/match.js';
import { swingResult } from '../js/core/batting.js';
import { hitsToday, isHot, rally, heatBoost, HOT, RALLY } from '../js/core/heat.js';

const pa = (batterId, event, inning = 3, half = 'bottom') => ({ batterId, event, inning, half });
const sam = getTeam('samsung'), lg = getTeam('lg');
const mk = (heat, log = []) => {
  const m = createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings: 9, rng: createRng(1), heat });
  return { ...m, log, game: { ...m.game, inning: 3, half: 'bottom' } };
};

test('a batter is hot from his second hit of the game; walks and errors do not count', () => {
  const log = [pa('a', 'SINGLE', 1), pa('a', 'WALK', 2), pa('b', 'HR', 2)];
  assert.equal(hitsToday(log, 'a'), 1); assert.ok(!isHot(log, 'a'));
  log.push(pa('a', 'DOUBLE', 4));
  assert.ok(isHot(log, 'a')); assert.ok(!isHot(log, 'b'));
  assert.ok(!isHot([pa('c', 'ERROR'), pa('c', 'SINGLE')], 'c'));
});

test('rally gauge: hits and walks fill it, outs drain it, it is per half-inning and resets after the boosted at-bat', () => {
  assert.deepEqual(rally([pa('a', 'SINGLE'), pa('b', 'STRIKEOUT'), pa('c', 'DOUBLE')], 3, 'bottom'), { value: 2, full: false });
  assert.equal(rally([pa('a', 'OUT'), pa('b', 'OUT')], 3, 'bottom').value, 0);                 // 0 밑으로 안 내려간다
  assert.equal(rally([pa('a', 'HR', 2), pa('b', 'HR', 2)], 3, 'bottom').value, 0);              // 지난 이닝은 안 친다
  const four = [pa('a', 'SINGLE'), pa('b', 'WALK'), pa('c', 'DOUBLE')];
  assert.ok(rally(four, 3, 'bottom').full);
  assert.deepEqual(rally([...four, pa('d', 'HR')], 3, 'bottom'), { value: 0, full: false });    // 폭발 타석 뒤 처음부터
  assert.equal(rally([...four, pa('d', 'OUT'), pa('e', 'SINGLE')], 3, 'bottom').value, 1);
});

test('boost: only in heat games; hot and rally stack with a cap; the CPU side never gets the rally', () => {
  const hot = [pa('x', 'SINGLE', 1), pa('x', 'SINGLE', 2)];
  assert.equal(heatBoost(mk(false, hot), 'x', 'home'), null);
  const h = heatBoost(mk(true, hot), 'x', 'home');
  assert.equal(h.reach, HOT.reach); assert.equal(h.quality, HOT.quality); assert.ok(h.hot && !h.rally);
  const full = [...hot, pa('y', 'DOUBLE'), pa('z', 'DOUBLE')];
  const both = heatBoost(mk(true, full), 'x', 'home');
  assert.ok(both.hot && both.rally); assert.ok(both.reach <= 1.25 && both.reach > RALLY.reach);
  assert.equal(heatBoost(mk(true, full), 'nobody', 'away'), null);
  assert.equal(heatBoost(mk(true, []), 'x', 'home'), null);
});

test('a bigger bat reaches a ball the normal bat misses, and quality goes up', () => {
  const pitch = { type: 'FB', speedKmh: 145, plate: { x: 0.5, y: 0 }, breakX: 0, breakY: 0, isStrike: true };
  const bat = { x: 0, y: 0, level: 'hard' }, batter = { contact: 50 };
  const plain = swingResult({ timingDiffMs: 0, batter, pitch, rng: createRng(1), bat });
  const big = swingResult({ timingDiffMs: 0, batter, pitch, rng: createRng(1), bat, boost: { reach: 1.25, quality: 0.1 } });
  assert.ok(plain.aimMiss); assert.ok(!big.aimMiss);
  const mid = { ...pitch, plate: { x: 0, y: 0 } };
  const q0 = swingResult({ timingDiffMs: 60, batter, pitch: mid, rng: createRng(1), bat }).quality;
  const q1 = swingResult({ timingDiffMs: 60, batter, pitch: mid, rng: createRng(1), bat, boost: { reach: 1, quality: 0.05 } }).quality;
  assert.ok(q1 > q0);
});

test('the match applies the boost to the batter at the plate', () => {
  const pitch = { type: 'FB', speedKmh: 145, plate: { x: 0.5, y: 0 }, breakX: 0, breakY: 0, isStrike: true, throws: 'R', travelMs: 400 };
  const m0 = mk(true);
  const id = m0.lineups.home.order[0];
  const hot = { ...m0, log: [pa(id, 'SINGLE', 1), pa(id, 'SINGLE', 2)] };
  const bat = { x: 0, y: 0, level: 'hard' };
  assert.ok(resolveUserSwing(m0, pitch, 0, createRng(2), bat).contact.aimMiss);
  assert.ok(!resolveUserSwing(hot, pitch, 0, createRng(2), bat).contact.aimMiss);
});
