import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { newCareer, loadCareer, saveCareer, startSeason, applyUserGame, applyAutoGame, finishSeason, userTeamNow } from '../js/core/career.js';

const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('new career has no season; save/load round trip', () => {
  const st = memStore();
  let c = startSeason(newCareer(), { cycles: 1, innings: 3 });
  assert.equal(c.season.year, 2027);
  assert.ok(saveCareer(st, c));
  const back = loadCareer(st);
  assert.deepEqual(back.season.schedule, c.season.schedule);
});

test('blocked or broken storage falls back to a new career', () => {
  const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
  assert.equal(loadCareer(bad).season, null);
  assert.equal(saveCareer(bad, newCareer()), false);
  const st = memStore(); st.setItem('baseball.career.v1', '{nope');
  assert.equal(loadCareer(st).season, null);
  assert.equal(loadCareer(null).season, null);
});

test('user game result advances the round, accumulates stats and growth', () => {
  let c = startSeason(newCareer(), { cycles: 1, innings: 3 });
  const log = Array.from({ length: 30 }, () => ({ batterId: 'samsung-b04', pitcherId: 'lg-p01', event: 'HR', runs: 1, outs: 0 }));
  const r = applyUserGame(c, { home: 30, away: 0, log }, createRng(1));
  c = r.career;
  assert.equal(c.season.round, 1);
  assert.equal(c.stats.bat['samsung-b04'].hr, 30);
  assert.ok(r.ups.some(u => u.id === 'samsung-b04' && u.stat === 'power'));
  assert.ok(userTeamNow(c).batters.find(b => b.id === 'samsung-b04').power > 93);
});

test('auto-playing through the whole season reaches a champion and archives history', () => {
  let c = startSeason(newCareer(), { cycles: 1, innings: 3 });
  const rng = createRng(4);
  for (let i = 0; i < 80 && c.season.phase !== 'done'; i++) c = applyAutoGame(c, rng).career;
  assert.equal(c.season.phase, 'done');
  c = finishSeason(c);
  assert.equal(c.history.length, 1);
  assert.equal(c.history[0].year, 2027);
  assert.equal(c.season, null);
  assert.equal(startSeason(c, { cycles: 1, innings: 3 }).season.year, 2028);
});
