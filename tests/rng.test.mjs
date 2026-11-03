import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randNormal } from '../js/core/rng.js';

test('same seed gives same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
test('values are in [0,1)', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
test('randNormal has mean near 0', () => {
  const r = createRng(7); let s = 0;
  for (let i = 0; i < 5000; i++) s += randNormal(r);
  assert.ok(Math.abs(s / 5000) < 0.05);
});
