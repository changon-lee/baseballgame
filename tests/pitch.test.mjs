import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { gaugePos, gaugeError, sweetWidth, fatigue, energy, gaugePeriod, isStrike, computePitch, aimFromTouch, PITCH_TYPES } from '../js/core/pitch.js';

const P = (o = {}) => ({ name: 't', throws: 'R', role: 'SP', velo: 150, control: 80, stamina: 85, pitches: ['FB', 'CU'], ...o });
const avgErr = (gpos, n = 200, o = {}) => {
  let s = 0;
  for (let i = 1; i <= n; i++) {
    const p = computePitch({ pitcher: P(o), type: 'FB', target: { x: 0.5, y: 0.5 }, gaugePos: gpos, pitchCount: 0, rng: createRng(i) });
    s += Math.hypot(p.plate.x - 0.5, p.plate.y - 0.5);
  }
  return s / n;
};
const avgSpeed = (pc, type = 'FB') => {
  let s = 0;
  for (let i = 1; i <= 100; i++) s += computePitch({ pitcher: P({ velo: 155 }), type, target: { x: 0, y: 0 }, gaugePos: 0.5, pitchCount: pc, rng: createRng(i) }).speedKmh;
  return s / 100;
};

test('gauge is triangle wave', () => {
  assert.equal(gaugePos(0, 1000), 0); assert.equal(gaugePos(500, 1000), 1);
  assert.equal(gaugePos(1000, 1000), 0); assert.equal(gaugePos(250, 1000), 0.5);
  assert.equal(gaugeError(0.5), 0); assert.equal(gaugeError(0), 1);
});
test('better control widens sweet spot', () => assert.ok(sweetWidth(90, 0) > sweetWidth(40, 0)));
test('fatigue narrows sweet spot', () => assert.ok(Math.abs(sweetWidth(80, 1) - sweetWidth(80, 0) * 0.4) < 1e-9));
test('fatigue starts past half stamina', () => {
  assert.equal(fatigue(40, 88), 0); assert.ok(fatigue(60, 88) > 0); assert.equal(fatigue(200, 30), 1);
});
test('energy bar drains with pitches', () => { assert.equal(energy(0, 80), 1); assert.ok(energy(60, 80) < 1); assert.equal(energy(500, 80), 0); });
test('tired gauge moves faster', () => assert.ok(gaugePeriod(1) < gaugePeriod(0)));
test('ball touching zone edge is a strike', () => {
  // 판정 존 반폭 0.85 + 공 반지름 0.17
  assert.equal(isStrike({ x: 0.95, y: 0 }), true); assert.equal(isStrike({ x: 1.05, y: 0 }), false);
  assert.equal(isStrike({ x: 0, y: 0.95 }), true); assert.equal(isStrike({ x: 0, y: 1.05 }), false);
});
test('on-target pitch lands near target', () => assert.ok(avgErr(0.5) < 0.25));
test('off-timing pitch scatters more', () => assert.ok(avgErr(0.05) > avgErr(0.5) * 2));
test('ace throws harder than tired self', () => assert.ok(avgSpeed(0) > avgSpeed(150) + 5));
test('curve is slower than fastball', () => assert.ok(avgSpeed(0, 'CU') < avgSpeed(0, 'FB')));
test('lefty breaks mirror righty', () => {
  const r = computePitch({ pitcher: P(), type: 'SL', target: { x: 0, y: 0 }, gaugePos: 0.5, pitchCount: 0, rng: createRng(1) });
  const l = computePitch({ pitcher: P({ throws: 'L' }), type: 'SL', target: { x: 0, y: 0 }, gaugePos: 0.5, pitchCount: 0, rng: createRng(1) });
  assert.equal(l.breakX, -r.breakX); assert.equal(r.breakX, PITCH_TYPES.SL.breakX);
});
test('aim lifts above finger and clamps', () => {
  const zone = { left: 100, top: 100, width: 200, height: 200 };
  assert.deepEqual(aimFromTouch({ x: 200, y: 250 }, zone, 50), { x: 0, y: 0 });
  assert.deepEqual(aimFromTouch({ x: -500, y: -500 }, zone, 50), { x: -1.6, y: 1.6 });
});
test('isStrike field matches plate', () => {
  const p = computePitch({ pitcher: P({ control: 100 }), type: 'FB', target: { x: 0, y: 0 }, gaugePos: 0.5, pitchCount: 0, rng: () => 0.5 });
  assert.equal(p.isStrike, isStrike(p.plate));
  assert.equal(p.isStrike, true);
});
