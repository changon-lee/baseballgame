import test from 'node:test';
import assert from 'node:assert/strict';
import { gameAchievements, seasonAchievements, careerAchievements, award, ACHIEVEMENTS } from '../js/core/achievements.js';

const ME = 'samsung';
const pa = (who, event, extra = {}) => ({ batterId: `${who}-b01`, pitcherId: 'x-p01', event, runs: 0, half: who === ME ? 'bottom' : 'top', bases: [false, false, false], score: { home: 0, away: 0 }, ...extra });

test('achievements: shutout, no-hitter, perfect game, 10 strikeouts', () => {
  const log = [];
  for (let i = 0; i < 27; i++) log.push(pa('lg', i < 10 ? 'STRIKEOUT' : 'OUT'));
  log.push(pa(ME, 'HR', { runs: 1 }));
  const a = gameAchievements({ home: ME, away: 'lg', hs: 1, as: 0 }, log, ME);
  for (const id of ['first_win', 'shutout', 'no_hitter', 'perfect', 'ten_k']) assert.ok(a.includes(id), id);
});
test('achievements: a walk breaks the perfect game but not the no-hitter', () => {
  const log = [pa('lg', 'WALK'), pa('lg', 'OUT'), pa(ME, 'SINGLE', { runs: 1 })];
  const a = gameAchievements({ home: ME, away: 'lg', hs: 1, as: 0 }, log, ME);
  assert.ok(a.includes('no_hitter') && !a.includes('perfect'));
});
test('achievements: cycle, three homers, grand slam, walk-off, comeback', () => {
  const log = [pa('lg', 'HR', { runs: 6, score: { home: 0, away: 6 } }),
    ...['SINGLE', 'DOUBLE', 'TRIPLE', 'HR', 'HR', 'HR'].map(e => pa(ME, e)),
    pa(ME, 'HR', { runs: 4, bases: [true, true, true], score: { home: 7, away: 6 } })];
  const a = gameAchievements({ home: ME, away: 'lg', hs: 7, as: 6 }, log, ME);
  for (const id of ['cycle', 'three_hr', 'grand_slam', 'walkoff', 'comeback']) assert.ok(a.includes(id), id);
  assert.ok(!a.includes('shutout'));
});
test('achievements: losing earns no win achievements', () => {
  const a = gameAchievements({ home: ME, away: 'lg', hs: 0, as: 3 }, [pa('lg', 'OUT')], ME);
  assert.ok(!a.includes('first_win') && !a.includes('no_hitter'));
});
test('achievements: season and career', () => {
  const s = seasonAchievements({ w: 10, l: 2, d: 0, champion: ME }, { bat: { a: { pa: 40, ab: 36, h: 12, hr: 11 } } }, ME);
  for (const id of ['winning', 'champion', 'hr10', 'avg300']) assert.ok(s.includes(id), id);
  assert.ok(!s.includes('hr30'));
  const h = Array.from({ length: 5 }, (_, i) => ({ champion: i < 3 ? ME : 'lg' }));
  assert.deepEqual(careerAchievements(h, ME).sort(), ['dynasty', 'seasons5']);
});
test('achievements: award counts repeats but reports only first-time ones as fresh', () => {
  let r = award({}, ['first_win', 'nope'], 2027);
  assert.deepEqual(r.fresh, ['first_win']);
  r = award(r.achv, ['first_win', 'shutout'], 2028);
  assert.deepEqual(r.fresh, ['shutout']);
  assert.equal(r.achv.first_win.n, 2); assert.equal(r.achv.first_win.year, 2027);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
});
