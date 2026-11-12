// 이닝별 점수표 · 오늘 성적 · MVP
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineScore, todayText, gameMvp } from '../js/core/boxscore.js';

const e = (batterId, event, inning, half, runs = 0, pitcherId = half === 'top' ? 'h-p1' : 'a-p1') => ({ batterId, pitcherId, event, inning, half, runs, outs: ['OUT', 'STRIKEOUT'].includes(event) ? 1 : 0 });
const game = o => ({ innings: 9, inning: 1, half: 'top', score: { away: 0, home: 0 }, over: false, ...o });

test('line score fills played half-innings, leaves the rest blank and adds runs and hits', () => {
  const log = [e('a-1', 'HR', 1, 'top', 1), e('a-2', 'OUT', 1, 'top'), e('h-1', 'SINGLE', 1, 'bottom'), e('h-2', 'DOUBLE', 1, 'bottom', 1), e('a-3', 'OUT', 2, 'top')];
  const ls = lineScore(log, game({ inning: 2, half: 'top', score: { away: 1, home: 1 } }));
  assert.equal(ls.n, 9);
  assert.deepEqual(ls.away.slice(0, 3), [1, 0, null]);
  assert.deepEqual(ls.home.slice(0, 3), [1, null, null]);
  assert.deepEqual(ls.H, { away: 1, home: 2 }); assert.deepEqual(ls.R, { away: 1, home: 1 });
});

test('home team that did not need the last bottom half gets an X; extra innings widen the table', () => {
  const won = lineScore([], game({ inning: 9, half: 'top', over: true, result: 'home', score: { away: 1, home: 3 } }));
  assert.equal(won.home[8], 'X'); assert.equal(won.away[8], 0);
  assert.equal(lineScore([], game({ inning: 11, half: 'bottom' })).n, 11);
});

test('today line', () => {
  const log = [e('x', 'SINGLE', 1, 'bottom'), e('x', 'WALK', 3, 'bottom'), e('x', 'HR', 5, 'bottom', 2), e('y', 'OUT', 1, 'bottom')];
  assert.equal(todayText(log, 'x'), '2타수 2안타 1홈런 2타점 1볼넷');
  assert.equal(todayText(log, 'y'), '1타수 0안타');
  assert.equal(todayText(log, 'z'), '오늘 첫 타석');
});

test('MVP comes from the winning side', () => {
  const log = [e('h-1', 'HR', 1, 'bottom', 3), e('h-2', 'SINGLE', 1, 'bottom'), e('a-1', 'DOUBLE', 2, 'top'), e('a-1', 'TRIPLE', 3, 'top'), e('a-1', 'HR', 4, 'top', 1)];
  const mine = id => id.startsWith('h-');
  assert.equal(gameMvp(log, { mine, userSide: 'home', result: 'home' }).id, 'h-1');
  assert.equal(gameMvp(log, { mine, userSide: 'home', result: 'away' }).id, 'a-1');
  // 타자가 못 쳤고 투수가 잘 던졌으면 투수
  const pit = Array.from({ length: 27 }, (_, i) => e(`a-${i % 9}`, i % 3 ? 'OUT' : 'STRIKEOUT', 1 + Math.floor(i / 3), 'top', 0, 'h-p1'));
  const m = gameMvp(pit, { mine, userSide: 'home', result: 'home' });
  assert.equal(m.id, 'h-p1'); assert.equal(m.kind, 'pit'); assert.match(m.text, /9이닝 9삼진 0실점/);
});
