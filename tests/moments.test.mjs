// 클러치·끝내기/역전·경기 기록·개인 최고
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clutchOf, scoreSwing, highlightsOf, bestOf, qualityStart, seasonMilestones } from '../js/core/moments.js';

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
  assert.deepEqual(highlightsOf([pa('top', 'STRIKEOUT', { pitches: [{}, {}, {}] })], 'home').map(h => h.label), ['3구 삼진']);
  const three = [pa('top', 'STRIKEOUT'), pa('bottom', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'STRIKEOUT')];
  assert.deepEqual(highlightsOf(three, 'home').map(h => h.label), ['3타자 연속 삼진']);   // 사이에 낀 우리 공격은 건너뛴다
  const five = [pa('top', 'STRIKEOUT'), pa('top', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'WALK'), pa('top', 'STRIKEOUT'), pa('top', 'OUT'), pa('top', 'STRIKEOUT'), pa('top', 'SINGLE'), pa('top', 'STRIKEOUT')];
  assert.deepEqual(highlightsOf(five, 'home').map(h => h.big + h.unit), ['5K']);
  assert.deepEqual(highlightsOf([pa('top', 'OUT')], 'home'), []);
  assert.deepEqual(highlightsOf([pa('bottom', 'STRIKEOUT', { pitches: [{}, {}, {}] })], 'home'), []);   // 우리가 당한 삼진은 아니다
});

test('우리 타자: 연속 홈런 · 멀티 홈런 · 연속 안타 · 사이클', () => {
  assert.deepEqual(highlightsOf([pa('bottom', 'HR', { batterId: 'a' }), pa('bottom', 'HR', { batterId: 'b' })], 'home').map(h => h.label), ['2타자 연속 홈런']);
  assert.deepEqual(highlightsOf([pa('bottom', 'HR'), pa('bottom', 'OUT', { batterId: 'x' }), pa('bottom', 'HR')], 'home').map(h => h.label), ['오늘 2홈런']);
  const four = ['SINGLE', 'DOUBLE', 'SINGLE', 'SINGLE'].map((e, i) => pa('bottom', e, { batterId: 'b' + i }));
  assert.deepEqual(highlightsOf(four, 'home').map(h => h.label), ['4타자 연속 안타']);
  const cyc = ['TRIPLE', 'SINGLE', 'HR', 'DOUBLE'].map(e => [pa('bottom', e), pa('bottom', 'OUT', { batterId: 'x' })]).flat().slice(0, -1);
  assert.deepEqual(highlightsOf(cyc, 'home').map(h => h.label), ['사이클링 히트']);
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

test('무결점 이닝: 한 이닝을 공 9개 삼진 3개로 끝내면(같은 투수)', () => {
  const k3 = (o = {}) => pa('top', 'STRIKEOUT', { inning: 2, pitches: [{}, {}, {}], ...o });
  assert.deepEqual(highlightsOf([pa('top', 'OUT', { inning: 1 }), k3(), k3(), k3()], 'home').map(h => h.label), ['무결점 이닝']);
  assert.deepEqual(highlightsOf([k3(), k3({ pitches: [{}, {}, {}, {}] }), k3()], 'home').map(h => h.label), ['3타자 연속 삼진']);   // 10구면 아니다
  assert.deepEqual(highlightsOf([k3(), k3({ pitcherId: 'p2' }), k3()], 'home').map(h => h.label), ['3타자 연속 삼진']);              // 투수가 바뀌었으면 아니다
});

test('퀄리티스타트: 선발이 6회 수비를 3실점 이하로 마친 그 공에서만', () => {
  const log = [pa('top', 'OUT', { inning: 1 }), pa('top', 'HR', { inning: 3, runs: 2 }), pa('bottom', 'OUT', { inning: 5, pitcherId: 'x' }), pa('top', 'STRIKEOUT', { inning: 6 })];
  const g = (inning, half) => ({ inning, half, over: false });
  const qs = qualityStart(log, 'home', g(6, 'top'), g(6, 'bottom'), 9);
  assert.equal(qs.label, '퀄리티스타트 달성'); assert.equal(qs.who, 'p1'); assert.match(qs.sub, /6이닝 2실점/);
  assert.equal(qualityStart(log, 'home', g(6, 'top'), g(6, 'top'), 9), null);              // 아직 6회초 수비 중
  assert.equal(qualityStart(log, 'home', g(5, 'top'), g(5, 'bottom'), 9), null);            // 5회
  assert.equal(qualityStart(log, 'home', g(6, 'top'), g(6, 'bottom'), 3), null);            // 짧은 경기
  assert.equal(qualityStart([...log, pa('top', 'HR', { inning: 6, runs: 2 })], 'home', g(6, 'top'), g(6, 'bottom'), 9), null);   // 4실점
  assert.equal(qualityStart([...log, pa('top', 'OUT', { inning: 6, pitcherId: 'p9' })], 'home', g(6, 'top'), g(6, 'bottom'), 9), null);   // 선발이 내려갔다
});

test('시즌 이정표: 시즌 기록 + 오늘 기록이 방금 넘었을 때', () => {
  const season = { bat: { hr: 19, h: 99, rbi: 40 }, pit: { so: 98 }, year: 2027, game: 12 };
  const hr = seasonMilestones([pa('bottom', 'HR', { batterId: 'me', runs: 1 })], 'me', season);
  assert.deepEqual(hr.map(m => m.label), ['시즌 20홈런', '시즌 100안타']);
  assert.equal(hr[0].big + hr[0].unit, '20호'); assert.equal(hr[0].sub, '2027 시즌 12경기째');
  assert.deepEqual(seasonMilestones([pa('bottom', 'SINGLE', { batterId: 'x' })], 'me', season), []);   // 다른 선수
  const ks = [pa('top', 'STRIKEOUT', { pitcherId: 'me' }), pa('top', 'STRIKEOUT', { pitcherId: 'me' })];
  assert.deepEqual(seasonMilestones(ks.slice(0, 1), 'me', season), []);
  assert.deepEqual(seasonMilestones(ks, 'me', season).map(m => m.label), ['시즌 100탈삼진']);
  assert.deepEqual(seasonMilestones(ks, 'me', null), []);
});
