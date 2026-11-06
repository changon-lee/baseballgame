// 컴퓨터 타자의 스윙 판단: 구석 스트라이크·유인구·완급 조절이 통하는지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { cpuSwing } from '../js/core/ai.js';
import { isStrike, PITCH_TYPES } from '../js/core/pitch.js';

const batter = { contact: 60, power: 60, eye: 60 };
const pitch = (type, x, y, v) => { const plate = { x, y }, t = PITCH_TYPES[type]; return { type, plate, speedKmh: v, breakX: t.breakX, breakY: t.breakY, isStrike: isStrike(plate) }; };
const swingRate = (p, prev = null, n = 20000) => { const rng = createRng(4); let s = 0; for (let i = 0; i < n; i++) s += cpuSwing({ batter, pitch: p, balls: 1, strikes: 1, rng, prev }).swing; return s / n; };
const timingSpread = (p, prev) => { const rng = createRng(5); let a = 0, k = 0;
  for (let i = 0; i < 40000; i++) { const s = cpuSwing({ batter, pitch: p, balls: 1, strikes: 1, rng, prev }); if (s.swing) { a += Math.abs(s.timingDiffMs); k++; } } return a / k; };

test('batters take more strikes on the corners than down the middle', () => {
  const mid = swingRate(pitch('FB', 0, 0, 145)), corner = swingRate(pitch('FB', 0.95, -0.95, 145));
  assert.ok(isStrike({ x: 0.95, y: -0.95 }));
  assert.ok(corner < mid * 0.75, `mid ${mid} corner ${corner}`);
});

test('breaking balls just off the zone get chased more than fastballs there', () => {
  const fb = swingRate(pitch('FB', 0, -1.15, 145)), cu = swingRate(pitch('CU', 0, -1.15, 118)), far = swingRate(pitch('CU', 0, -1.55, 118));
  assert.ok(cu > fb * 1.3, `fb ${fb} cu ${cu}`);
  assert.ok(far < cu, `near ${cu} far ${far}`);
});

test('changing speeds throws off timing; the same pitch again is easier to time', () => {
  const cu = pitch('CU', 0, 0, 118), fb = pitch('FB', 0, 0, 145);
  const none = timingSpread(cu, null), afterFb = timingSpread(cu, { k: 'FB', v: 145 });
  assert.ok(afterFb > none * 1.2, `none ${none} afterFb ${afterFb}`);
  assert.ok(timingSpread(fb, { k: 'FB', v: 145 }) < timingSpread(fb, null), 'same pitch twice');
});
