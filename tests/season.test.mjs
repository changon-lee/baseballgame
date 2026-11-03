import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { TEAMS, USER_TEAM_ID, getTeam } from '../js/data/rosters.js';
import { createMatch, playUserPitch, matchup } from '../js/core/match.js';
import { defaultLineup } from '../js/core/team.js';
import { cpuChoosePitch } from '../js/core/ai.js';
import { simulateGame } from '../js/core/sim.js';
import {
  createSeason, nextUserGame, standings, recordRound, nextPostGame, recordPostGame,
  seasonOver, nextStarter,
} from '../js/core/season.js';
import { createGrowth, gainFromLog, applyGrowth, playerLine } from '../js/core/growth.js';

const ids = TEAMS.map(t => t.id);

test('match log records each finished plate appearance with batter and pitcher', () => {
  const sam = getTeam('samsung'), lg = getTeam('lg'), rng = createRng(3);
  let m = createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings: 1, rng });
  let pa = 0;
  for (let i = 0; i < 400 && m.game.half === 'top' && !m.game.over; i++) {
    const mu = matchup(m);
    const r = playUserPitch(m, cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng }), rng);
    m = r.match; if (r.paEnded) pa++;
  }
  assert.equal(m.log.length, pa);
  assert.ok(m.log.every(e => e.batterId.startsWith('lg-b') && e.pitcherId.startsWith('samsung-p')));
});

test('simulateGame plays a full game deterministically', () => {
  const a = simulateGame({ home: getTeam('kia'), away: getTeam('lg'), innings: 9, rng: createRng(7) });
  const b = simulateGame({ home: getTeam('kia'), away: getTeam('lg'), innings: 9, rng: createRng(7) });
  assert.ok(['home', 'away', 'draw'].includes(a.result));
  assert.deepEqual(a.score, b.score);
  assert.ok(a.log.length >= 50);
});

test('schedule: every team meets every other team once per cycle, samsung plays every round', () => {
  const s = createSeason({ cycles: 2, innings: 9, year: 2027 });
  assert.equal(s.schedule.length, 18);
  for (const round of s.schedule) {
    assert.equal(round.length, 5);
    assert.equal(new Set(round.flat()).size, 10);
    assert.ok(round.some(g => g.includes(USER_TEAM_ID)));
  }
  const meet = {};
  for (const round of s.schedule) for (const [h, a] of round) { const k = [h, a].sort().join(); meet[k] = (meet[k] || 0) + 1; }
  assert.equal(Object.keys(meet).length, 45);
  assert.ok(Object.values(meet).every(n => n === 2));
});

test('samsung is home in its own games (the game screen needs it)', () => {
  const s = createSeason({ cycles: 1, innings: 9, year: 2027 });
  for (const round of s.schedule) assert.equal(round.find(g => g.includes(USER_TEAM_ID))[0], USER_TEAM_ID);
});

test('recordRound stores user result, sims the other games and advances', () => {
  let s = createSeason({ cycles: 1, innings: 3, year: 2027 });
  const g = nextUserGame(s);
  s = recordRound(s, { home: 5, away: 2 }, createRng(1)).season;
  assert.equal(s.round, 1);
  assert.equal(s.results.length, 5);
  const mine = s.results.find(r => r.home === USER_TEAM_ID);
  assert.equal(mine.away, g.opponentId);
  assert.deepEqual([mine.hs, mine.as], [5, 2]);
  const st = standings(s);
  assert.equal(st.find(t => t.id === USER_TEAM_ID).w, 1);
});

test('standings: pct ignores draws, sorted, games behind', () => {
  const s = { results: [
    { home: 'samsung', away: 'lg', hs: 3, as: 1 }, { home: 'kia', away: 'kt', hs: 2, as: 2 },
    { home: 'samsung', away: 'kia', hs: 0, as: 4 }, { home: 'lg', away: 'kt', hs: 5, as: 1 },
  ] };
  const st = standings(s);
  const sam = st.find(t => t.id === 'samsung'), kia = st.find(t => t.id === 'kia');
  assert.equal(sam.w, 1); assert.equal(sam.l, 1); assert.equal(sam.pct, 0.5);
  assert.equal(kia.d, 1); assert.equal(kia.pct, 1);
  assert.equal(st[0].id, 'kia'); assert.equal(st[0].gb, 0);
  assert.equal(st.length, 10);
});

test('nextStarter rotates through starting pitchers', () => {
  const s = createSeason({ cycles: 1, innings: 9, year: 2027 });
  const sps = getTeam('samsung').pitchers.filter(p => p.role === 'SP').map(p => p.id);
  assert.equal(nextStarter(s, 'samsung'), sps[0]);
  const s2 = recordRound(s, { home: 1, away: 0 }, createRng(2)).season;
  assert.equal(nextStarter(s2, 'samsung'), sps[1]);
  const s3 = recordRound(s2, { home: 1, away: 0, starterId: sps[3] }, createRng(2)).season;
  assert.equal(nextStarter(s3, 'samsung'), sps[0]);   // 4번 다음은 다시 1번
});

test('postseason ladder: 5v4 wildcard (4th starts 1-0), then 3rd, 2nd, 1st in the Korean Series', () => {
  let s = createSeason({ cycles: 1, innings: 3, year: 2027 });
  const rng = createRng(5);
  while (s.phase === 'regular') s = recordRound(s, null, rng).season;
  assert.equal(s.phase, 'post');
  const seeds = s.post.seeds;
  assert.equal(seeds.length, 5);
  assert.deepEqual(s.post.series[0].wins, [1, 0]);           // 4위 1승 안고 시작
  assert.deepEqual(s.post.series[0].teams, [seeds[3], seeds[4]]);
  let guard = 0;
  while (!seasonOver(s) && guard++ < 100) {
    const g = nextPostGame(s);
    s = recordPostGame(s, null, rng).season;
    assert.ok(g.home && g.away);
  }
  assert.ok(seasonOver(s));
  const ks = s.post.series[3];
  assert.equal(ks.name, '한국시리즈');
  assert.ok(ks.teams.includes(seeds[0]));
  assert.ok(ks.wins.includes(4));
  assert.equal(s.champion, ks.teams[ks.wins.indexOf(4)]);
});

test('postseason draw is replayed (does not count)', () => {
  let s = createSeason({ cycles: 1, innings: 3, year: 2027 });
  const rng = createRng(9);
  while (s.phase === 'regular') s = recordRound(s, null, rng).season;
  const before = s.post.series[s.post.current].wins.slice();
  const cur = s.post.current;
  s = recordPostGame(s, { home: 2, away: 2 }, rng).season;
  assert.equal(s.post.current, cur);
  assert.deepEqual(s.post.series[cur].wins, before);
});

test('growth: good games raise ratings, capped at 99', () => {
  let gr = createGrowth();
  const log = [];
  for (let i = 0; i < 20; i++) log.push({ batterId: 'samsung-b04', pitcherId: 'lg-p01', event: 'HR', runs: 1 });
  for (let i = 0; i < 30; i++) log.push({ batterId: 'lg-b01', pitcherId: 'samsung-p01', event: 'STRIKEOUT', runs: 0 });
  const r = gainFromLog(gr, log, 'samsung');
  assert.ok(r.ups.length > 0);
  const team = applyGrowth(getTeam('samsung'), r.growth);
  const diaz = team.batters.find(b => b.id === 'samsung-b04');
  assert.ok(diaz.power > 93 || diaz.contact > 68 || diaz.eye > 55);
  assert.ok(diaz.power <= 99);
  const won = team.pitchers.find(p => p.id === 'samsung-p01');
  const base = getTeam('samsung').pitchers[0];
  assert.ok(won.control + won.stamina + won.velo > base.control + base.stamina + base.velo);
  assert.ok(!r.ups.some(u => u.id.startsWith('lg-')));   // 상대 팀은 성장 안 함
});

test('playerLine aggregates batting and pitching numbers', () => {
  const log = [
    { batterId: 'samsung-b01', pitcherId: 'lg-p01', event: 'SINGLE', runs: 0 },
    { batterId: 'samsung-b01', pitcherId: 'lg-p01', event: 'WALK', runs: 0 },
    { batterId: 'samsung-b01', pitcherId: 'lg-p01', event: 'STRIKEOUT', runs: 0 },
    { batterId: 'samsung-b01', pitcherId: 'lg-p01', event: 'HR', runs: 2 },
  ];
  const b = playerLine({}, log).bat['samsung-b01'];
  assert.deepEqual([b.pa, b.ab, b.h, b.hr, b.bb, b.so, b.rbi], [4, 3, 2, 1, 1, 1, 2]);
  const p = playerLine({}, log).pit['lg-p01'];
  assert.equal(p.outs, 1); assert.equal(p.so, 1); assert.equal(p.r, 2);
});
