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

// ── 배트 위치(내가 칠 때) ──
import { batReach, batOffset } from '../js/core/batting.js';
test('bat right on the ball: same as no aim', () => {
  const a = swingResult({ timingDiffMs: 0, batter, pitch: pitch(), rng: createRng(1) });
  const b = swingResult({ timingDiffMs: 0, batter, pitch: pitch(), rng: createRng(1), bat: { x: 0, y: 0 } });
  assert.equal(b.kind, 'INPLAY'); assert.equal(b.quality, a.quality);
});
test('bat far from the ball path is a swing and miss even with perfect timing', () => {
  const r = swingResult({ timingDiffMs: 0, batter, pitch: pitch({ plate: { x: 0.8, y: -0.8 } }), rng: createRng(1), bat: { x: -0.8, y: 0.8 } });
  assert.equal(r.kind, 'MISS'); assert.ok(r.aimMiss);
});
test('reach is generous: a bat a third of the zone off still connects', () => {
  const r = swingResult({ timingDiffMs: 0, batter, pitch: pitch({ plate: { x: 0.3, y: 0.2 } }), rng: createRng(1), bat: { x: 0, y: 0 } });
  assert.equal(r.kind, 'INPLAY');
});
test('off-center contact is weaker than square contact', () => {
  const sq = swingResult({ timingDiffMs: 0, batter, pitch: pitch(), rng: createRng(1), bat: { x: 0, y: 0 } });
  const edge = swingResult({ timingDiffMs: 0, batter, pitch: pitch(), rng: createRng(1), bat: { x: 0.45, y: 0 } });
  assert.ok(edge.quality < sq.quality);
});
test('hard mode has a smaller bat, better contact a wider one', () => {
  assert.ok(batReach(50, true).rx < batReach(50).rx);
  assert.ok(batReach(90).rx > batReach(30).rx && batReach(90).ry > batReach(30).ry);
});
test('ball above the bat lifts (fly), below sinks (grounder)', () => {
  assert.ok(batOffset({ x: 0, y: 0 }, { x: 0, y: 0.3 }, 50).lift > 0);
  assert.ok(batOffset({ x: 0, y: 0 }, { x: 0, y: -0.3 }, 50).lift < 0);
});
