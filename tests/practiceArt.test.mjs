import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceImageRect } from '../js/ui/art/practice.js';

test('practice art: anchor point lands on the target and the image still covers the screen', () => {
  const fit = { fx: 0.5, fy: 0.472, zoom: 1.25 };
  const r = practiceImageRect(1008, 1792, 390, 694, fit, 195, 253);
  assert.ok(Math.abs(r.x + fit.fx * r.w - 195) < 0.01);
  assert.ok(Math.abs(r.y + fit.fy * r.h - 253) < 0.01);
  assert.ok(r.x <= 0 && r.y <= 0 && r.x + r.w >= 390 && r.y + r.h >= 694);
});

test('practice art: a target too close to the edge is clamped so no gap shows', () => {
  const r = practiceImageRect(1008, 1792, 390, 694, { fx: 0.5, fy: 0.9, zoom: 1 }, 195, 10);
  assert.equal(r.y, 0);
  const plain = practiceImageRect(1008, 1792, 390, 694, null, 0, 0);
  assert.ok(Math.abs(plain.x - (390 - plain.w) / 2) < 0.01);
});
