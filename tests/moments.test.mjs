// 클러치·끝내기/역전·경기 기록·개인 최고
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clutchOf, scoreSwing, highlightsOf, bestOf } from '../js/core/moments.js';

const G = o => ({ inning: 9, half: 'bottom', outs: 1, balls: 0, strikes: 0, bases: [false, false, false], score: { away: 3, home: 3 }, over: false, ...o });

test('클러치: 막판 동점 · 역전 주자가 누상', () => {
  assert.equal(clutchOf(G({ bases: [true, false, false] }), 9), true);
  assert.equal(clutchOf(G({ score: { away: 5, home: 3 }, bases: [true, false, false] }), 9), true);    // 2점 차, 주자 1명 → 동점 주자가 타석
  assert.equal(clutchOf(G({ score: { away: 6, home: 3 }, bases: [true, false, false] }), 9), false);   // 3점 차는 아니다
  assert.equal(clutchOf(G({ score: { away: 2, home: 3 }, bases: [true, true, true] }), 9), false);     // 이기고 있으면 아니다
  assert.equal(clutchOf(G({ inning: 8, bases: [false, false, false] }), 9), false);                   // 8회 주자 없음
  assert.equal(clutchOf(G({ inning: 9 }), 9), true);                                                  // 9회 동점은 주자 없어도
  assert.equal(clutchOf(G({ inning: 3, bases: [true, true, true], outs: 2 }), 9), false);
  assert.equal(clutchOf(G({ inning: 6, bases: [true, true, true], outs: 2, score: { away: 1, home: 4 } }), 9), true);   // 6회 2사 만루
  assert.equal(clutchOf(G({ inning: 6, outs: 2, balls: 3, strikes: 2, bases: [false, true, false], score: { away: 1, home: 2 } }), 9), true);
  assert.equal(clutchOf(G({ over: true }), 9), false);
  assert.equal(clutchOf(G({ inning: 1 }), 1), false);                                                 // 1이닝 경기 첫 공부터 클러치는 아니다
  assert.equal(clutchOf(G({ inning: 3, bases: [true, false, false] }), 3), true);
});

test('끝내기·역전', () => {
  const b = G({ score: { away: 3, home: 3 } });
  assert.equal(scoreSwing(b, { ...b, score: { away: 3, home: 4 }, over: true, result: 'home' }, 'home', 'bottom'), 'walkoff');
  assert.equal(scoreSwing(G({ score: { away: 3, home: 2 } }), { ...b, score: { away: 3, home: 4 } }, 'home', 'bottom'), 'comeback');
  assert.equal(scoreSwing(b, { ...b, score: { away: 3, home: 4 } }, 'home', 'bottom'), null);          // 동점에서 앞서 간 건 역전이 아니다
  assert.equal(scoreSwing(G({ score: { away: 2, home: 3 } }), { ...b, score: { away: 4, home: 3 } }, 'home', 'top'), null);   // 상대 역전은 보여 주지 않는다
});

const pa = (half, event, o = {}) => ({ half, event, batterId: 'b1', pitcherId: 'p1', pitches: [{}, {}, {}, {}], ...o });

test('우리 투수: 3구 삼진 · 연속 삼진 · 탈삼진 개수', () => {
  assert.deepEqual(highlightsOf([pa('top', 'STRIKEOUT', { pitches: [{}, {}, {}] })], 'home').map(h => h.label), ['3구 삼진!']);
  const three = [pa('top', 'STRIKEOUT'), pa('bottom', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'STRIKEOUT')];
  assert.deepEqual(highlightsOf(three, 'home').map(h => h.label), ['3타자 연속 삼진']);   // 사이에 낀 우리 공격은 건너뛴다
  const five = [pa('top', 'STRIKEOUT'), pa('top', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'WALK'), pa('top', 'STRIKEOUT'), pa('top', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'SINGLE'), pa('top', 'STRIKEOUT')];
  assert.deepEqual(highlightsOf(five, 'home').map(h => h.big), ['5K']);
  assert.deepEqual(highlightsOf([pa('top', 'OUT')], 'home'), []);
  assert.deepEqual(highlightsOf([pa('bottom', 'STRIKEOUT', { pitches: [{}, {}, {}] })], 'home'), []);   // 우리가 당한 삼진은 아니다
});

test('우리 타자: 연속 홈런 · 멀티 홈런 · 연속 안타 · 사이클', () => {
  assert.deepEqual(highlightsOf([pa('bottom', 'HR', { batterId: 'a' }), pa('bottom', 'HR', { batterId: 'b' })], 'home').map(h => h.label), ['2타자 연속 홈런']);
  assert.deepEqual(highlightsOf([pa('bottom', 'HR'), pa('bottom', 'OUT', { batterId: 'x' }), pa('bottom', 'HR')], 'home').map(h => h.label), ['오늘 2홈런']);
  const four = ['SINGLE', 'DOUBLE', 'SINGLE', 'SINGLE'].map((e, i) => pa('bottom', e, { batterId: 'b' + i }));
  assert.deepEqual(highlightsOf(four, 'home').map(h => h.label), ['4타자 연속 안타']);
  const cyc = ['TRIPLE', 'SINGLE', 'HR', 'DOUBLE'].map(e => [pa('bottom', e), pa('bottom', 'OUT', { batterId: 'x' })]).flat().slice(0, -1);
  assert.deepEqual(highlightsOf(cyc, 'home').map(h => h.label), ['사이클링 히트!']);
  assert.deepEqual(highlightsOf([...cyc, pa('bottom', 'OUT', { batterId: 'x' }), pa('bottom', 'SINGLE')], 'home').map(h => h.label), ['오늘 5안타']);   // 사이클은 한 번만
});

test('개인 최고: 처음 값은 조용히 남기고, 넘을 때만 경신', () => {
  let r = bestOf({}, 'velo', 'p', 150);
  assert.equal(r.best, null); assert.equal(r.rec.velo.p, 150);
  const same = bestOf(r.rec, 'velo', 'p', 150);
  assert.equal(same.best, null); assert.equal(same.rec, r.rec);
  r = bestOf(r.rec, 'velo', 'p', 152);
  assert.deepEqual(r.best, { kind: 'velo', value: 152, prev: 150 });
  assert.equal(bestOf(r.rec, 'hr', 'b', 0).best, null);
});
