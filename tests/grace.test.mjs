// 정타 여유(ms): 쉬움 60, 보통 42, 어려움 30. 이 안의 타이밍 차이는 완벽한 타이밍과 같은 타구질
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { swingResult, graceMs, GRACE_MS } from '../js/core/batting.js';

const batter = { contact: 50, power: 50, eye: 50 };
const pitch = { plate: { x: 0, y: 0 }, breakX: 0, breakY: 0, speedKmh: 145, isStrike: true };
const q = (level, diff) => swingResult({ timingDiffMs: diff, batter, pitch, rng: createRng(1), bat: { x: 0, y: 0, level } }).quality;

test('grace window: easy 60ms > normal 42ms > hard 30ms', () => {
  assert.deepEqual(GRACE_MS, { easy: 60, normal: 42, hard: 30 });
  assert.ok(graceMs('easy') > graceMs('normal') && graceMs('normal') > graceMs('hard'));
  assert.equal(graceMs(undefined), 30);                     // 난이도를 모르면 예전처럼 30
});
test('timing inside the grace window scores like perfect timing; outside it is worse', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const g = graceMs(level);
    assert.equal(q(level, g), q(level, 0), `${level}: ±${g}ms 안은 정타`);
    assert.equal(q(level, -g), q(level, 0), `${level}: 빠른 쪽도 같다`);
    assert.ok(q(level, g + 60) < q(level, 0), `${level}: 여유를 한참 넘으면 떨어진다`);
  }
});
test('a 40ms miss is clean contact on normal and easy but not on hard', () => {
  assert.equal(q('normal', 40), q('normal', 0));
  assert.equal(q('easy', 40), q('easy', 0));
  assert.ok(q('hard', 40) < q('hard', 0));
});
