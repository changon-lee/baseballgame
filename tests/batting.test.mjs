import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { timingWindowMs, swingResult } from '../js/core/batting.js';
import { battedBall } from '../js/core/outcome.js';

const batter = { contact: 50, power: 50, eye: 50 };
const pitch = (o = {}) => ({ plate: { x: 0, y: 0 }, breakX: 0, breakY: 0.1, speedKmh: 145, isStrike: true, ...o });

test('perfect timing on middle pitch is good contact', () => {
  const r = swingResult({ timingDiffMs: 0, batter, pitch: pitch(), rng: createRng(1) });
  assert.equal(r.kind, 'INPLAY'); assert.ok(r.quality > 0.9);
});
test('very late swing misses', () => {
  assert.equal(swingResult({ timingDiffMs: 400, batter, pitch: pitch(), rng: createRng(1) }).kind, 'MISS');
});
test('swing at a ball far outside misses', () => {
  assert.equal(swingResult({ timingDiffMs: 0, batter, pitch: pitch({ plate: { x: 1.8, y: 0 } }), rng: createRng(1) }).kind, 'MISS');
});
test('early swing pulls', () => {
  const r = swingResult({ timingDiffMs: -timingWindowMs(50), batter, pitch: pitch(), rng: createRng(1) });
  assert.ok(r.pull > 0);
});
test('high contact has wider window', () => assert.ok(timingWindowMs(90) > timingWindowMs(30)));
test('swingResult never reads the clock', () => {
  const pn = performance.now, dn = Date.now;
  performance.now = () => { throw new Error('clock'); }; Date.now = () => { throw new Error('clock'); };
  try { swingResult({ timingDiffMs: 10, batter, pitch: pitch(), rng: createRng(1) }); }
  finally { performance.now = pn; Date.now = dn; }
});
test('sac fly only with runner on third and <2 outs', () => {
  const rng = createRng(3); let n = 0;
  for (let i = 0; i < 1000; i++) if (battedBall({ quality: 0.5, pull: 0, power: 50, outs: 0, runnerOnFirst: true, runnerOnThird: false, rng }) === 'SAC_FLY') n++;
  assert.equal(n, 0);
});
test('double play only with runner on first and <2 outs', () => {
  const rng = createRng(4); let n = 0;
  for (let i = 0; i < 1000; i++) if (battedBall({ quality: 0.4, pull: 0, power: 50, outs: 2, runnerOnFirst: true, runnerOnThird: false, rng }) === 'DOUBLE_PLAY') n++;
  assert.equal(n, 0);
});
