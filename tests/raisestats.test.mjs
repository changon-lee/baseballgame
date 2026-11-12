// 육성모드 시즌 기록: 리그 전체 기록 쌓기, 내 기록과 상위 몇 %인지 (core/raisestats.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { newSlot, applyDay, nextSeason } from '../js/core/raise.js';
import { leagueAdd, seasonCard, STAT_DEFS } from '../js/core/raisestats.js';

const ev = (batterId, pitcherId, event, runs = 0, outs = 0) => ({ batterId, pitcherId, event, runs, outs, inning: 1, half: 'top', score: { home: 0, away: 0 } });

test('leagueAdd adds up every game log of the day', () => {
  let lg = leagueAdd({}, [[ev('a', 'p', 'HR', 1), ev('b', 'p', 'STRIKEOUT', 0, 1)], [ev('a', 'q', 'SINGLE')]]);
  lg = leagueAdd(lg, [[ev('a', 'p', 'OUT', 0, 1)]]);
  assert.equal(lg.bat.a.ab, 3); assert.equal(lg.bat.a.h, 2); assert.equal(lg.bat.a.hr, 1);
  assert.equal(lg.pit.p.outs, 2); assert.equal(lg.pit.p.so, 1); assert.equal(lg.pit.q.h, 1);
});

// 타자 10명: i번째는 10타수 i안타. 나는 'me'
const batLeague = myHits => {
  const bat = {};
  for (let i = 0; i < 10; i++) bat['b' + i] = { pa: 10, ab: 10, h: i, d2: 0, d3: 0, hr: i % 3, bb: 0, so: 0, rbi: i };
  bat.me = { pa: 10, ab: 10, h: myHits, d2: 0, d3: 0, hr: 2, bb: 0, so: 0, rbi: 5 };
  return { bat, pit: {} };
};
const slotWith = (id, league, round, stats = {}) => ({ ...newSlot(id), playerId: id, league, stats, season: { ...newSlot(id).season, round } });

test('batter card: rows for every stat, percentile among qualified batters', () => {
  const s = { ...slotWith('samsung-b03', batLeague(10), 4), playerId: 'me', kind: 'bat' };
  const c = seasonCard(s);
  assert.deepEqual(c.rows.map(r => r.key), STAT_DEFS.bat.map(d => d.key));
  const avg = c.rows.find(r => r.key === 'avg');
  assert.equal(avg.text, '1.000'); assert.equal(avg.pct, 10);          // 11명 중 1등 → 상위 10%(올림)
  assert.ok(avg.info.length > 5);
  const worst = seasonCard({ ...s, league: batLeague(0) }).rows.find(r => r.key === 'avg');
  assert.ok(worst.pct >= 90);
  assert.equal(c.qualified, true);
});

test('ties share the middle: no homers when most have none is not a top rank', () => {
  const lg = batLeague(5);
  for (let i = 0; i < 10; i++) lg.bat['b' + i].hr = i < 8 ? 0 : 3;   // 10명 중 8명 0홈런
  lg.bat.me.hr = 0;
  const hr = seasonCard({ ...slotWith('samsung-b03', lg, 4), playerId: 'me', kind: 'bat' }).rows.find(r => r.key === 'hr');
  // 2명이 더 잘하고 8명과 같다 → (2 + 1 + 8/2) / 11 = 63.6 → 상위 64%
  assert.equal(hr.pct, 64);
});

test('batter below the plate-appearance bar gets no percentile', () => {
  const lg = batLeague(5); lg.bat.me = { ...lg.bat.me, pa: 3, ab: 3, h: 3 };
  const c = seasonCard({ ...slotWith('samsung-b03', lg, 4), playerId: 'me', kind: 'bat' });
  assert.equal(c.qualified, false);
  assert.ok(c.rows.every(r => r.pct == null));
  assert.equal(c.rows.find(r => r.key === 'avg').text, '1.000');
});

test('pitcher card: lower ERA is better, starters are compared with starters', () => {
  const pit = {};
  // 삼성·LG 선발들(로스터 역할 SP)과 불펜(역할 RP·CL)
  const sps = ['lg-p01', 'lg-p02', 'kt-p01', 'kt-p02', 'kia-p01', 'kia-p02'];
  sps.forEach((id, i) => { pit[id] = { bf: 60, outs: 45, h: 12, hr: 1, bb: 4, so: 10, r: 2 + i * 2 }; });
  pit['samsung-p01'] = { bf: 60, outs: 45, h: 10, hr: 0, bb: 3, so: 15, r: 1 };
  pit['lg-p06'] = { bf: 10, outs: 45, h: 0, hr: 0, bb: 0, so: 20, r: 0 };   // 불펜은 선발 비교에 안 들어간다
  const s = slotWith('samsung-p01', { bat: {}, pit }, 10, { w: 3, l: 1, sv: 0 });
  const c = seasonCard(s);
  const era = c.rows.find(r => r.key === 'era');
  assert.equal(era.text, '0.60'); assert.equal(era.pct, 15);           // 7명 중 1등 → 1/7 = 14.3 → 15
  assert.equal(c.pool, 7);
  assert.match(c.extra, /3승 1패/);
});

test('applyDay keeps the whole league, nextSeason starts it over', () => {
  const rng = createRng(4);
  let s = newSlot('samsung-b03');
  s = applyDay(s, null, rng).slot;
  const ids = Object.keys(s.league.bat);
  assert.ok(ids.some(id => id.startsWith('lg-') || id.startsWith('kt-')), 'other teams are recorded');
  assert.ok(ids.length >= 80, `${ids.length} batters`);
  assert.ok(Object.keys(s.league.pit).length >= 10);
  assert.deepEqual(nextSeason(s).league, { bat: {}, pit: {} });
});
