import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeOfDay, setTimeOfDay, isNight, duskLevel } from '../js/ui/art/stadium.js';

test('9 innings: 1-3 day, 4-6 dusk getting deeper, 7+ (and extras) night', () => {
  const ph = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map(i => timeOfDay(i, 9).phase);
  assert.deepEqual(ph, ['day', 'day', 'day', 'dusk', 'dusk', 'dusk', 'night', 'night', 'night', 'night', 'night']);
  const k = [4, 5, 6].map(i => timeOfDay(i, 9).k);
  assert.ok(k[0] > 0 && k[0] < k[1] && k[1] < k[2] && k[2] === 1);
});
test('short games split the same way', () => {
  assert.deepEqual([1, 2, 3].map(i => timeOfDay(i, 3).phase), ['day', 'dusk', 'night']);
  assert.equal(timeOfDay(1, 1).phase, 'day');
});
test('setTimeOfDay reports a change only when the look changes', () => {
  setTimeOfDay({ phase: 'day', k: 0 });
  assert.equal(setTimeOfDay({ phase: 'day', k: 0 }), false);
  assert.equal(setTimeOfDay(timeOfDay(5, 9)), true); assert.ok(duskLevel() > 0); assert.equal(isNight(), false);
  assert.equal(setTimeOfDay(timeOfDay(8, 9)), true); assert.equal(isNight(), true); assert.equal(duskLevel(), 0);
  setTimeOfDay({ phase: 'day', k: 0 });
});
