import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, applyEvent, battingSide } from '../js/core/rules.js';

const setup = (o = {}) => ({ ...createGameState({ innings: 3 }), ...o });
const run = (s, events) => { let runs = 0; for (const e of events) { const r = applyEvent(s, e); s = r.state; runs += r.runs; } return { s, runs }; };

test('walk forces runners only', () => {
  const { s, runs } = run(setup({ bases: [false, true, false] }), ['BALL', 'BALL', 'BALL', 'BALL']);
  assert.deepEqual(s.bases, [true, true, false]); assert.equal(runs, 0);
});
test('bases loaded walk scores 1', () => {
  const { runs } = run(setup({ bases: [true, true, true] }), ['BALL', 'BALL', 'BALL', 'BALL']);
  assert.equal(runs, 1);
});
test('single scores runner from second', () => {
  const { s, runs } = run(setup({ bases: [true, true, false] }), ['SINGLE']);
  assert.deepEqual(s.bases, [true, true, false]); assert.equal(runs, 1);
});
test('foul with two strikes keeps count', () => {
  const { s } = run(setup({ strikes: 2 }), ['FOUL']);
  assert.equal(s.strikes, 2);
});
test('three strikes is out and next batter', () => {
  const { s } = run(setup(), ['STRIKE', 'STRIKE', 'STRIKE']);
  assert.equal(s.outs, 1); assert.equal(s.battingIndex.away, 1); assert.equal(s.strikes, 0);
});
test('sac fly scores from third', () => {
  const { s, runs } = run(setup({ bases: [false, false, true], outs: 1 }), ['SAC_FLY']);
  assert.equal(runs, 1); assert.equal(s.outs, 2);
});
test('three outs switch sides', () => {
  const { s } = run(setup({ bases: [true, false, true] }), ['OUT', 'OUT', 'OUT']);
  assert.equal(s.half, 'bottom'); assert.deepEqual(s.bases, [false, false, false]);
  assert.equal(battingSide(s), 'home');
});
test('home leading after top of last inning ends game', () => {
  const { s } = run(setup({ inning: 3, score: { away: 0, home: 2 } }), ['OUT', 'OUT', 'OUT']);
  assert.ok(s.over); assert.equal(s.result, 'home');
});
test('walk-off ends immediately', () => {
  const { s } = run(setup({ inning: 3, half: 'bottom', score: { away: 1, home: 1 }, bases: [false, false, true] }), ['SINGLE']);
  assert.ok(s.over); assert.equal(s.result, 'home');
});
test('tie after max innings is draw', () => {
  const { s } = run(setup({ inning: 5, half: 'bottom', score: { away: 1, home: 1 } }), ['OUT', 'OUT', 'OUT']);
  assert.ok(s.over); assert.equal(s.result, 'draw');
});
test('tie after regulation goes to extra inning', () => {
  const { s } = run(setup({ inning: 3, half: 'bottom', score: { away: 1, home: 1 } }), ['OUT', 'OUT', 'OUT']);
  assert.ok(!s.over); assert.equal(s.inning, 4); assert.equal(s.half, 'top');
});
test('9-inning game has max 11', () => {
  assert.equal(createGameState({ innings: 9 }).maxInnings, 11);
});
test('applyEvent does not mutate input', () => {
  const s0 = setup({ bases: [true, false, false] });
  applyEvent(s0, 'DOUBLE');
  assert.deepEqual(s0.bases, [true, false, false]);
});

const bottomLast = (o = {}) => setup({ inning: 3, half: 'bottom', ...o });
test('walk-off single counts only the winning run (tie, runners on 2nd and 3rd)', () => {
  const { s, runs } = run(bottomLast({ bases: [false, true, true] }), ['SINGLE']);
  assert.equal(runs, 1); assert.deepEqual(s.score, { away: 0, home: 1 }); assert.ok(s.over); assert.equal(s.result, 'home');
});
test('walk-off double with loaded bases, down by one, counts two runs', () => {
  const { s, runs } = run(bottomLast({ bases: [true, true, true], score: { away: 1, home: 0 } }), ['DOUBLE']);
  assert.equal(runs, 2); assert.deepEqual(s.score, { away: 1, home: 2 });
});
test('walk-off triple counts only the winning run', () => {
  const { runs } = run(bottomLast({ bases: [true, true, true] }), ['TRIPLE']);
  assert.equal(runs, 1);
});
test('walk-off home run still scores everyone', () => {
  const { s, runs } = run(bottomLast({ bases: [true, true, true] }), ['HR']);
  assert.equal(runs, 4); assert.deepEqual(s.score, { away: 0, home: 4 });
});
test('non-walk-off hit keeps all runs when game not decided', () => {
  const { runs } = run(bottomLast({ bases: [false, true, true], score: { away: 5, home: 0 } }), ['SINGLE']);
  assert.equal(runs, 2);
});

// ── 다양한 타구 결과 ──
test('infield single: batter to first, forced runners move up', () => {
  const { s, runs } = run(setup({ bases: [false, true, true] }), ['INFIELD_SINGLE']);
  assert.deepEqual(s.bases, [true, true, true]); assert.equal(runs, 0);
  assert.deepEqual(run(setup({ bases: [false, true, false] }), ['INFIELD_SINGLE']).s.bases, [true, true, false]);
  assert.equal(run(setup({ bases: [true, true, true] }), ['INFIELD_SINGLE']).runs, 1);
});
test('error: batter on first, every runner moves up one', () => {
  const { s, runs } = run(setup({ bases: [true, false, true] }), ['ERROR']);
  assert.deepEqual(s.bases, [true, true, false]); assert.equal(runs, 1); assert.equal(s.outs, 0);
});
test('single with the runner from second thrown out at home', () => {
  const { s, runs } = run(setup({ bases: [true, true, true], outs: 0 }), ['SINGLE_HOME_OUT']);
  assert.deepEqual(s.bases, [true, true, false]); assert.equal(runs, 1); assert.equal(s.outs, 1);
});
test('line drive double play doubles off the lead-most runner nearest first', () => {
  const { s } = run(setup({ bases: [true, true, false], outs: 0 }), ['LINE_DP']);
  assert.deepEqual(s.bases, [false, true, false]); assert.equal(s.outs, 2);
  assert.deepEqual(run(setup({ bases: [false, true, false] }), ['LINE_DP']).s.bases, [false, false, false]);
});

test('ground outs move forced runners up only; fly outs move nobody', () => {
  const g = (bases, ev = 'OUT', outs = 0) => applyEvent(setup({ bases, outs }), ev, { ground: true });
  assert.deepEqual(g([true, false, false]).state.bases, [false, true, false]);
  assert.deepEqual(g([false, true, false]).state.bases, [false, true, false]);         // 1루가 비면 2루 주자는 포스가 아니라 그대로
  assert.deepEqual(g([false, true, true]).state.bases, [false, true, true]);
  assert.deepEqual(g([true, false, true]).state.bases, [false, true, true]);
  const full = g([true, true, true]);
  assert.deepEqual(full.state.bases, [false, true, true]); assert.equal(full.runs, 1);
  assert.equal(g([true, true, true], 'OUT', 2).runs, 0);                               // 3아웃이면 득점 없음
  assert.deepEqual(applyEvent(setup({ bases: [true, true, false] }), 'OUT').state.bases, [true, true, false]);   // 뜬공은 그대로
  const dp = g([true, true, false], 'DOUBLE_PLAY');
  assert.deepEqual(dp.state.bases, [false, false, true]); assert.equal(dp.state.outs, 2);
});
