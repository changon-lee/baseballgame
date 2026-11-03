import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampDt } from '../js/ui/loop.js';
test('clampDt bounds frame gaps', () => {
  assert.equal(clampDt(5000), 50); assert.equal(clampDt(-3), 0); assert.equal(clampDt(16), 16);
});
