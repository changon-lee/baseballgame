import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, USER_TEAM_ID, getTeam } from '../js/data/rosters.js';
const PT = ['FB','SI','SL','CU','CH','FO','CT'];

test('10 teams, samsung included', () => {
  assert.equal(TEAMS.length, 10);
  assert.equal(getTeam(USER_TEAM_ID).name, '삼성 라이온즈');
});
for (const t of TEAMS) test(`${t.id} roster is playable`, () => {
  assert.ok(t.batters.length >= 9);
  assert.ok(t.pitchers.filter(p => p.role === 'SP').length >= 2);
  assert.ok(t.pitchers.filter(p => p.role === 'RP').length >= 4);
  assert.match(t.colors.main, /^#[0-9a-fA-F]{6}$/);
  assert.match(t.colors.sub, /^#[0-9a-fA-F]{6}$/);
  const ids = [...t.batters, ...t.pitchers].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of t.batters) for (const k of ['power','contact','eye'])
    assert.ok(Number.isInteger(b[k]) && b[k] >= 1 && b[k] <= 100, `${b.name}.${k}`);
  for (const p of t.pitchers) {
    assert.ok(p.velo >= 130 && p.velo <= 165, p.name);
    for (const k of ['control','stamina']) assert.ok(p[k] >= 1 && p[k] <= 100);
    assert.ok(p.pitches.includes('FB') || p.pitches.includes('SI'));
    assert.ok(p.pitches.every(x => PT.includes(x)));
  }
});
