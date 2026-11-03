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
