import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { createMatch, autoPitch, simulateHalf, simulateInning, simulateRest } from '../js/core/match.js';

const sam = getTeam('samsung'), lg = getTeam('lg');
const mk = (innings = 9, seed = 1) => createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings, rng: createRng(seed) });

test('auto pitch throws one pitch and records it in the current plate appearance', () => {
  const m = mk(), r = autoPitch(m, createRng(2));
  assert.equal(r.match.pitchCount.away + r.match.pitchCount.home, 1);
  assert.ok(r.paEnded ? r.match.log.length === 1 : r.match.pa.length === 1);
});

test('skip inning: ends in the next inning (or game over) and logs every plate appearance', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = mk(9, seed), x = simulateInning(m, createRng(seed));
    assert.ok(x.game.over || (x.game.inning === 2 && x.game.half === 'top' && x.game.outs === 0), `seed ${seed}`);
    const outs = x.log.reduce((a, l) => a + l.outs, 0);
    assert.equal(outs, 6, `seed ${seed}: six outs in a full inning`);
    for (const l of x.log) { assert.equal(l.inning, 1); assert.ok(l.pitches.length >= 1); }
    const runs = x.log.reduce((a, l) => a + l.runs, 0);
    assert.equal(runs, x.game.score.home + x.game.score.away);
  }
});

test('skip half: ends when the half-inning changes (or game over), three outs logged', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = mk(9, seed), x = simulateHalf(m, createRng(seed));
    assert.ok(x.game.over || (x.game.inning === 1 && x.game.half === 'bottom' && x.game.outs === 0), `seed ${seed}`);
    assert.equal(x.log.reduce((a, l) => a + l.outs, 0), 3, `seed ${seed}`);
    for (const l of x.log) assert.equal(l.half, 'top');
  }
});

test('skip game: plays to the end with a consistent score and log', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const x = simulateRest(mk(9, seed), createRng(seed));
    assert.ok(x.game.over && x.game.result, `seed ${seed}`);
    const runs = s => x.log.filter(l => (l.half === 'top') === (s === 'away')).reduce((a, l) => a + l.runs, 0);
    assert.equal(runs('away'), x.game.score.away);
    assert.equal(runs('home'), x.game.score.home);
    assert.deepEqual(x.log[x.log.length - 1].score, x.game.score);
  }
});
