import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlay, practicePlay, ballAt } from '../js/ui/art/playscript.js';
import { createRng } from '../js/core/rng.js';

const EVENTS = [['OUT', true], ['OUT', false], ['SINGLE', false], ['SINGLE', true], ['DOUBLE', true], ['HR', true], ['DOUBLE_PLAY', false], ['SAC_FLY', true], ['ERROR', false]];
test('practice play: no fielders or runners, the ball never stays in a glove, and it ends soon after it lands', () => {
  for (const [event, fly] of EVENTS) for (let seed = 1; seed <= 6; seed++) {
    const sc = buildPlay({ event, fly, contact: { pull: 0.2 }, bats: 'R', bases: [true, false, false], rng: createRng(seed) });
    const p = practicePlay(sc);
    assert.deepEqual(Object.keys(p.fielders), []);
    assert.equal(p.runners.length, 0);
    assert.equal(p.watch.length, 0);
    assert.ok(!p.ball.some(s => s.type === 'hold' || s.type === 'throw'), `${event} keeps a catch/throw`);
    for (let t = 0; t < p.end; t += 0.1) { const b = ballAt(p, t); assert.ok(!b.held && b.p.every(Number.isFinite), `${event} t=${t}`); }
    assert.ok(p.decisive <= sc.decisive + 1e-9 && p.decisive > 0, `${event} decisive`);
    assert.ok(!p.sounds.some(x => x.name === 'mitt' || x.name === 'cheer'));
  }
});
