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

// ── 순위표 ──
test('leaderboard: top rows in order, my rank, ties share a rank', async () => {
  const { leaderboard } = await import('../js/core/raisestats.js');
  const lg = batLeague(5);                      // b0..b9: 0~9안타, me: 5안타
  lg.bat['samsung-b03'] = lg.bat.me; delete lg.bat.me;
  const s = slotWith('samsung-b03', lg, 4);
  const b = leaderboard(s, 'avg');
  assert.equal(b.name, '타율');
  assert.equal(b.pool, 11);
  assert.deepEqual(b.rows.slice(0, 3).map(r => r.text), ['.900', '.800', '.700']);
  assert.equal(b.rows[0].rank, 1);
  const me = b.rows.find(r => r.me);
  assert.equal(me.rank, 5); assert.equal(me.tie, true);          // b5와 똑같이 .500 → 공동 5위
  assert.equal(b.rows.find(r => r.id === 'b5').rank, 5);
  assert.equal(b.rows.find(r => r.id === 'b4').rank, 7);         // 공동 둘 다음은 7위
  assert.equal(b.myRank, 5);
  assert.ok(me.name.length > 0 && me.team);
});

test('leaderboard: only the top 10 plus me when I am further down', async () => {
  const { leaderboard } = await import('../js/core/raisestats.js');
  const bat = {};
  for (let i = 0; i < 20; i++) bat['b' + i] = { pa: 10, ab: 10, h: 2 + (i % 8), d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: i + 1 };
  bat['samsung-b03'] = { pa: 10, ab: 10, h: 1, d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: 0 };
  const b = leaderboard(slotWith('samsung-b03', { bat, pit: {} }, 4), 'rbi', 10);
  assert.equal(b.rows.length, 11);
  assert.equal(b.rows[10].me, true); assert.equal(b.rows[10].rank, 21); assert.equal(b.rows[10].gap, true);
  assert.equal(b.rows[0].text, '20');
});

test('leaderboard: below the bar I am listed without a rank; ERA ranks low first among starters', async () => {
  const { leaderboard } = await import('../js/core/raisestats.js');
  const lg = batLeague(5); lg.bat['samsung-b03'] = { ...lg.bat.me, pa: 2, ab: 2 }; delete lg.bat.me;
  const b = leaderboard(slotWith('samsung-b03', lg, 4), 'avg');
  const me = b.rows.find(r => r.me);
  assert.equal(me.rank, null); assert.equal(b.myRank, null); assert.equal(b.pool, 10);
  const pit = {};
  ['lg-p01', 'lg-p02', 'kt-p01', 'kt-p02', 'kia-p01'].forEach((id, i) => { pit[id] = { bf: 60, outs: 45, h: 12, hr: 1, bb: 4, so: 10, r: 2 + i }; });
  pit['lg-p06'] = { bf: 10, outs: 45, h: 0, hr: 0, bb: 0, so: 0, r: 0 };            // 불펜은 선발 순위표에 없다
  pit['samsung-p01'] = { bf: 60, outs: 45, h: 10, hr: 0, bb: 3, so: 15, r: 3 };
  const e = leaderboard(slotWith('samsung-p01', { bat: {}, pit }, 10), 'era');
  assert.deepEqual(e.rows.map(r => r.id), ['lg-p01', 'lg-p02', 'samsung-p01', 'kt-p01', 'kt-p02', 'kia-p01']);
  assert.equal(e.rows[2].rank, 2); assert.equal(e.rows[2].tie, true);
  assert.ok(!e.rows.some(r => r.id === 'lg-p06'));
});

test('season card rows carry my rank too', () => {
  const lg = batLeague(10); lg.bat['samsung-b03'] = lg.bat.me; delete lg.bat.me;
  const c = seasonCard(slotWith('samsung-b03', lg, 4));
  assert.equal(c.rows.find(r => r.key === 'avg').rank, 1);
});

test('leaderboard shows the top 50 by default', async () => {
  const { leaderboard, BOARD_TOP } = await import('../js/core/raisestats.js');
  assert.equal(BOARD_TOP, 50);
  const bat = {};
  for (let i = 0; i < 80; i++) bat['b' + i] = { pa: 10, ab: 10, h: i % 10, d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: i };
  bat['samsung-b03'] = { pa: 10, ab: 10, h: 1, d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: 0 };
  const b = leaderboard(slotWith('samsung-b03', { bat, pit: {} }, 4), 'rbi');
  assert.equal(b.rows.filter(r => !r.gap).length, 50);
  assert.equal(b.rows.length, 51);
  assert.equal(b.rows[50].me, true);
});

test('raise league plays with the real-KBO batting environment', async () => {
  const { RAISE } = await import('../js/core/raise.js');
  assert.ok(RAISE.bat.k > 1.2 && RAISE.bat.k < 1.4);
});

test('league batting environment widens CPU batter timing; createMatch keeps it', async () => {
  const { cpuSwing } = await import('../js/core/ai.js');
  const { createMatch } = await import('../js/core/match.js');
  const { getTeam } = await import('../js/data/rosters.js');
  const { defaultLineup } = await import('../js/core/team.js');
  const pitch = { plate: { x: 0, y: 0 }, isStrike: true, breakX: 0, breakY: 0, speedKmh: 145, type: 'FB' };
  const batter = { contact: 70, eye: 60, power: 60 };
  const a = cpuSwing({ batter, pitch, balls: 0, strikes: 0, rng: createRng(9) });
  const b = cpuSwing({ batter, pitch, balls: 0, strikes: 0, rng: createRng(9), k: 2 });
  assert.equal(a.swing, true);
  assert.ok(Math.abs(b.timingDiffMs - 2 * a.timingDiffMs) < 1e-9);
  const t = getTeam('samsung'), m = createMatch({ userTeam: t, cpuTeam: getTeam('lg'), userLineup: { ...defaultLineup(t), starterId: t.pitchers[0].id }, innings: 9, rng: createRng(1), bat: { k: 1.3 } });
  assert.equal(m.bat.k, 1.3);
  assert.equal(createMatch({ userTeam: t, cpuTeam: getTeam('lg'), userLineup: { ...defaultLineup(t), starterId: t.pitchers[0].id }, innings: 9, rng: createRng(1) }).bat, undefined);
});
