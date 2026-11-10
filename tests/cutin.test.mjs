// 컷인: 어떤 결과에 어떤 연출을 보여 줄까
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutinFor, CUT_MS, HR_NAME } from '../js/ui/cutin.js';

const prev = (strikes = 0) => ({ strikes, balls: 0 });

test('my home run = celebration, a home run I give up = groan', () => {
  assert.equal(cutinFor({ event: 'HR', runs: 1 }, prev(), false), 'homerun');
  assert.equal(cutinFor({ event: 'HR', runs: 2 }, prev(), true), 'homerun_bad');
});
test('strikeout cut-in only when I am pitching and it is strike three', () => {
  assert.equal(cutinFor({ event: 'STRIKE' }, prev(2), true), 'strikeout');
  assert.equal(cutinFor({ event: 'STRIKE' }, prev(1), true), null);     // 삼진이 아니다
  assert.equal(cutinFor({ event: 'STRIKE' }, prev(2), false), null);    // 내가 삼진당한 건 조용히
});
test('other results have no cut-in', () => {
  for (const event of ['BALL', 'FOUL', 'SINGLE', 'DOUBLE', 'OUT', 'HBP', 'WILD', 'DOUBLE_PLAY']) {
    assert.equal(cutinFor({ event }, prev(2), true), null, event);
    assert.equal(cutinFor({ event }, prev(2), false), null, event);
  }
});
test('every cut-in has a length, and home runs are named by runs scored', () => {
  for (const k of ['homerun', 'homerun_bad', 'strikeout', 'win']) assert.ok(CUT_MS[k] > 1000, k);
  assert.deepEqual([1, 2, 3, 4].map(n => HR_NAME[n]), ['솔로 홈런', '투런 홈런', '쓰리런 홈런', '만루 홈런']);
});
