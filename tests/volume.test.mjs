// 소리 크기 설정 저장/불러오기
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.window = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
const { loadPrefs, savePrefs } = await import('../js/ui/prefs.js');

test('volumes default to full', () => {
  delete store['bb.prefs'];
  const p = loadPrefs();
  assert.equal(p.sfxVol, 1); assert.equal(p.ambVol, 1);
});
test('volumes round-trip and are clamped to 0..1', () => {
  savePrefs({ ...loadPrefs(), sfxVol: 0.3, ambVol: 0 });
  assert.deepEqual([loadPrefs().sfxVol, loadPrefs().ambVol], [0.3, 0]);
  store['bb.prefs'] = JSON.stringify({ sfxVol: 7, ambVol: -2 });
  assert.deepEqual([loadPrefs().sfxVol, loadPrefs().ambVol], [1, 0]);
  store['bb.prefs'] = JSON.stringify({ sfxVol: 'abc' });
  assert.equal(loadPrefs().sfxVol, 1);
});
test('old saved prefs without volumes still load with full volume', () => {
  store['bb.prefs'] = JSON.stringify({ guide: false, level: 'hard', sfx: true, amb: false });
  const p = loadPrefs();
  assert.equal(p.sfxVol, 1); assert.equal(p.ambVol, 1); assert.equal(p.amb, false); assert.equal(p.level, 'hard');
});
