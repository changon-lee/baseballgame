// 기록 백업: 묶기 · 읽기 · 되돌리기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBackup, readBackup, restoreBackup, backupAge, markBackup, hasProgress, backupName, BACKUP_AT } from '../js/core/backup.js';

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), dump: () => Object.fromEntries(m) };
}
const raise = JSON.stringify({ v: 1, slots: [{ playerId: 'samsung-p01' }, null, { playerId: 'samsung-b01' }] });
const career = JSON.stringify({ v: 1, history: [{}, {}], season: { year: 2029 } });

test('backup holds only this game\'s keys (not the backup time)', () => {
  const s = mem({ 'baseball.raise.v1': raise, 'baseball.career.v1': career, 'bb.prefs': '{}', other: 'x', [BACKUP_AT]: '1' });
  const b = makeBackup(s, 1000);
  assert.deepEqual(Object.keys(b.data).sort(), ['baseball.career.v1', 'baseball.raise.v1', 'bb.prefs']);
  const r = readBackup(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.deepEqual(r.summary, { raise: 2, seasons: 2, season: 2029 });
});

test('foreign or broken files are refused', () => {
  assert.equal(readBackup('nope').reason, 'json');
  assert.equal(readBackup(JSON.stringify({ app: 'x', v: 1, data: {} })).reason, 'format');
  assert.equal(readBackup(JSON.stringify({ app: 'samsung-baseball', v: 1, data: { evil: 'x' } })).reason, 'format');
  assert.equal(readBackup(JSON.stringify({ app: 'samsung-baseball', v: 1, data: { 'bb.prefs': 3 } })).reason, 'format');
  assert.equal(readBackup(JSON.stringify({ app: 'samsung-baseball', v: 1, data: {} })).reason, 'empty');
});

test('restore replaces this game\'s data, keeps other sites\' keys, marks the time', () => {
  const b = makeBackup(mem({ 'baseball.raise.v1': raise }), 5);
  const s = mem({ 'baseball.career.v1': career, 'baseball.lineup.samsung': '[]', other: 'keep' });
  assert.equal(restoreBackup(s, b, 9 * 86400000), true);
  assert.deepEqual(s.dump(), { other: 'keep', 'baseball.raise.v1': raise, [BACKUP_AT]: String(9 * 86400000) });
});

test('a failed restore leaves the old data', () => {
  const s = mem({ 'baseball.career.v1': career });
  const set = s.setItem; let n = 0;
  s.setItem = (k, v) => { if (k === 'baseball.raise.v1' && n++ === 0) throw new Error('quota'); set(k, v); };
  assert.equal(restoreBackup(s, makeBackup(mem({ 'baseball.raise.v1': raise }))), false);
  assert.equal(s.getItem('baseball.career.v1'), career);
  assert.equal(s.getItem('baseball.raise.v1'), null);
});

test('backup age and progress', () => {
  const s = mem({});
  assert.equal(backupAge(s), null); assert.equal(hasProgress(s), false);
  markBackup(s, 0 + 1);
  assert.equal(backupAge(s, 3 * 86400000 + 5), 3);
  s.setItem('baseball.raise.v1', raise);
  assert.equal(hasProgress(s), true);
  assert.match(backupName(new Date(2026, 10, 19, 14, 2).getTime()), /^삼성야구-백업-20261119-1402\.json$/);
});
