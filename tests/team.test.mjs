import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup, isValidLineup, loadLineup, saveLineup, availableRelievers } from '../js/core/team.js';

const team = getTeam('samsung');
const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test('default lineup is valid', () => {
  const l = defaultLineup(team);
  assert.equal(l.order.length, 9); assert.ok(isValidLineup(team, l));
  assert.equal(team.pitchers.find(p => p.id === l.starterId).role, 'SP');
});
test('save then load round-trips', () => {
  const st = memStorage(), l = defaultLineup(team);
  const swapped = { order: [l.order[2], l.order[1], l.order[0], ...l.order.slice(3)], starterId: team.pitchers[1].id };
  assert.equal(saveLineup(st, team, swapped), true);
  assert.deepEqual(loadLineup(st, team), swapped);
});
test('throwing storage falls back to default', () => {
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadLineup(bad, team), defaultLineup(team));
  assert.equal(saveLineup(bad, team, defaultLineup(team)), false);
});
test('missing storage falls back to default', () => assert.deepEqual(loadLineup(null, team), defaultLineup(team)));
test('stale lineup with removed player falls back', () => {
  const st = memStorage(), l = defaultLineup(team);
  st.setItem('baseball.lineup.samsung', JSON.stringify({ ...l, order: ['gone-b99', ...l.order.slice(1)] }));
  assert.deepEqual(loadLineup(st, team), defaultLineup(team));
});
test('corrupt json falls back', () => {
  const st = memStorage(); st.setItem('baseball.lineup.samsung', '{oops');
  assert.deepEqual(loadLineup(st, team), defaultLineup(team));
});
test('duplicate batter is invalid', () => {
  const l = defaultLineup(team);
  assert.equal(isValidLineup(team, { ...l, order: [l.order[0], ...l.order.slice(0, 8)] }), false);
});
test('relief pitcher as starter is invalid', () => {
  const rp = team.pitchers.find(p => p.role === 'RP');
  assert.equal(isValidLineup(team, { ...defaultLineup(team), starterId: rp.id }), false);
});
test('used pitchers are not available again', () => {
  const cur = team.pitchers[0].id, used = new Set([team.pitchers[1].id]);
  const ids = availableRelievers(team, used, cur).map(p => p.id);
  assert.ok(!ids.includes(cur)); assert.ok(!ids.includes(team.pitchers[1].id));
  assert.equal(ids.length, team.pitchers.length - 2);
  const all = new Set(team.pitchers.map(p => p.id));
  assert.deepEqual(availableRelievers(team, all, cur), []);
});
