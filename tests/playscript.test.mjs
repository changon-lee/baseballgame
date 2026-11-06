import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlay, ballAt, trackAt, BASES, fenceAt, angOf } from '../js/ui/art/playscript.js';
import { createRng } from '../js/core/rng.js';

const near = (a, b, d = 3) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= d;
const arrive = (keys, base) => { const k = keys.find(q => near([q.x, q.y], BASES[base % 4], 1)); return k ? k.t : null; };
const finite = sc => {
  for (const keys of [...Object.values(sc.fielders), ...sc.runners.map(r => r.keys)]) {
    for (let i = 0; i < keys.length; i++) {
      assert.ok(Number.isFinite(keys[i].t) && Number.isFinite(keys[i].x) && Number.isFinite(keys[i].y), 'finite key');
      if (i) assert.ok(keys[i].t >= keys[i - 1].t, 'keys in time order');
    }
  }
  for (let t = 0; t < sc.end; t += 0.05) ballAt(sc, t).p.forEach(v => assert.ok(Number.isFinite(v), 'finite ball'));
  assert.ok(sc.decisive > 0 && sc.end >= sc.decisive && sc.endMs > 0);
};
const cases = [];
for (let seed = 1; seed <= 25; seed++) {
  for (const [event, fly, bases] of [
    ['SINGLE', false, [true, true, false]], ['SINGLE', true, [false, false, true]], ['DOUBLE', true, [true, false, false]],
    ['TRIPLE', true, [false, true, false]], ['HR', true, [true, true, true]], ['OUT', true, [true, false, false]],
    ['OUT', false, [false, false, false]], ['SAC_FLY', true, [false, false, true]], ['DOUBLE_PLAY', false, [true, false, false]],
  ]) cases.push({ seed, event, fly, bases, bats: seed % 3 === 0 ? 'L' : seed % 3 === 1 ? 'R' : 'S' });
}

test('every play script is well formed', () => {
  for (const c of cases) finite(buildPlay({ ...c, contact: { pull: (c.seed % 5 - 2) / 3 }, rng: createRng(c.seed) }));
});

test('ground out: throw beats the batter to first', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sc = buildPlay({ event: 'OUT', fly: false, bats: 'R', contact: { pull: 0.3 }, bases: [false, false, false], rng: createRng(seed) });
    const outT = sc.outs[0], b = arrive(sc.runners[0].keys, 1);
    assert.ok(b > outT, `seed ${seed}: runner ${b} after out ${outT}`);
    assert.ok(near(ballAt(sc, outT + 0.01).p, BASES[1], 6), 'ball at first when out');
  }
});

test('fly out: the fielder is under the ball when it is caught', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sc = buildPlay({ event: 'OUT', fly: true, bats: 'L', contact: { pull: 0 }, bases: [false, false, false], rng: createRng(seed) });
    const T = sc.outs[0], b = ballAt(sc, T - 0.001).p;
    const who = sc.ball[1].who, f = trackAt(sc.fielders[who], T);
    assert.ok(near(b, [f.x, f.y], 3), `seed ${seed}: ${who} at ball`);
    assert.ok(Math.hypot(b[0], b[1]) < fenceAt(angOf(b[0], b[1])), 'caught inside the park');
  }
});

test('hits: nobody catches the ball in the air and runners reach their bases', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const [event, dest] of [['SINGLE', 1], ['DOUBLE', 2], ['TRIPLE', 3]]) {
      const sc = buildPlay({ event, fly: true, bats: 'R', contact: { pull: 0.5 }, bases: [false, false, false], rng: createRng(seed) });
      const firstHold = sc.ball.find(s => s.type === 'hold');
      assert.ok(firstHold.t0 >= sc.landT, `${event} seed ${seed}: fielded after landing`);
      assert.ok(arrive(sc.runners[0].keys, dest) != null, `${event} batter reaches ${dest}`);
    }
  }
});

test('home run lands beyond the fence', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const sc = buildPlay({ event: 'HR', fly: true, bats: 'L', contact: { pull: 0.8 }, bases: [false, false, false], rng: createRng(seed) });
    const p = ballAt(sc, sc.landT + 0.5).p;
    assert.ok(Math.hypot(p[0], p[1]) > fenceAt(angOf(p[0], p[1])));
  }
});

test('sac fly: runner from third scores before the throw home', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const sc = buildPlay({ event: 'SAC_FLY', fly: true, bats: 'R', contact: { pull: 0 }, bases: [false, false, true], rng: createRng(seed) });
    const r3 = sc.runners.find(r => r.base === 3), home = arrive(r3.keys.slice(1), 0);
    const throwSeg = sc.ball.filter(s => s.type === 'throw').pop();
    assert.ok(home != null && home < throwSeg.t1 + 0.35, `seed ${seed}`);
  }
});

test('double play: lead runner beaten at second, batter beaten at first', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const sc = buildPlay({ event: 'DOUBLE_PLAY', fly: false, bats: 'R', contact: { pull: 0.4 }, bases: [true, false, false], rng: createRng(seed) });
    const [o1, o2] = sc.outs, r1 = sc.runners.find(r => r.base === 1);
    assert.ok(arrive(r1.keys, 2) > o1, `seed ${seed}: runner at 2B after ball`);
    assert.ok(arrive(sc.runners[0].keys, 1) > o2, `seed ${seed}: batter at 1B after ball`);
  }
});

test('sac fly: the catcher holds the ball the moment the throw arrives', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const sc = buildPlay({ event: 'SAC_FLY', fly: true, bats: 'R', contact: { pull: 0 }, bases: [false, false, true], rng: createRng(seed) });
    const throws = sc.ball.filter(s => s.type === 'throw');
    const last = throws[throws.length - 1];
    const catcherHold = sc.ball.find(s => s.type === 'hold' && s.who === 'C' && s.t0 >= last.t0);
    assert.ok(catcherHold, `seed ${seed}: catcher holds the ball`);
    assert.ok(Math.abs(catcherHold.t0 - last.t1) < 1e-6, `seed ${seed}: throw ends ${last.t1} but catcher holds at ${catcherHold.t0}`);
  }
});

test('ground out / double play: runners who stay on base break off their lead and return, not frozen', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const [event, bases, staying] of [
      ['OUT', [true, false, false], [1]], ['OUT', [true, true, true], [1, 2, 3]],
      ['DOUBLE_PLAY', [true, true, true], [2, 3]], ['DOUBLE_PLAY', [true, true, false], [2]],
    ]) {
      const sc = buildPlay({ event, fly: false, bats: 'R', contact: { pull: 0 }, bases, rng: createRng(seed) });
      const occupied = bases.map((on, i) => on && i + 1);
      for (const base of staying) {
        const r = sc.runners[1 + occupied.filter(Boolean).indexOf(base)];
        const last = r.keys[r.keys.length - 1];
        assert.ok(near([last.x, last.y], BASES[base], 1), `${event} seed ${seed}: runner on ${base}B ends on the base`);
        assert.ok(r.keys.length >= 3, `${event} seed ${seed}: runner on ${base}B moves instead of freezing at the lead`);
      }
    }
  }
});

// ── 다양한 타구 장면 ──
const NEW = [
  ['INFIELD_SINGLE', false, null, [true, false, true]], ['ERROR', false, 'fumble', [true, true, false]], ['ERROR', false, 'throw', [false, false, true]],
  ['SINGLE', false, 'home_safe', [false, true, false]], ['SINGLE', true, 'home_safe', [true, true, true]], ['SINGLE_HOME_OUT', false, null, [true, true, false]],
  ['SINGLE_HOME_OUT', true, null, [false, true, true]], ['OUT', false, 'liner', [false, false, false]], ['LINE_DP', false, 'liner', [true, true, false]],
  ['LINE_DP', false, 'liner', [false, true, true]], ['OUT', true, 'dive', [true, false, false]], ['OUT', true, 'wall', [false, false, false]],
];
test('new plays are well formed', () => {
  for (let seed = 1; seed <= 30; seed++) for (const [event, fly, style, bases] of NEW)
    finite(buildPlay({ event, fly, style, bases, bats: seed % 2 ? 'L' : 'R', contact: { pull: (seed % 5 - 2) / 3 }, rng: createRng(seed) }));
});
test('infield single: batter beats the throw to first', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sc = buildPlay({ event: 'INFIELD_SINGLE', fly: false, bats: 'R', contact: { pull: 0 }, bases: [false, false, false], rng: createRng(seed) });
    const thr = sc.ball.filter(s => s.type === 'throw').pop();
    assert.ok(arrive(sc.runners[0].keys, 1) < thr.t1, `seed ${seed}`);
  }
});
test('runner from second on a single: the throw always goes home; out, close or late', () => {
  for (let seed = 1; seed <= 40; seed++) for (const [event, style] of [['SINGLE_HOME_OUT', null], ['SINGLE', 'home_safe'], ['SINGLE', null]]) {
    const sc = buildPlay({ event, style, fly: seed % 2 === 0, bats: 'L', contact: { pull: 0.3 }, bases: [false, true, false], rng: createRng(seed) });
    const r2 = sc.runners.find(r => r.base === 2), home = arrive(r2.keys.slice(1), 0);
    const thr = sc.ball.filter(s => s.type === 'throw').pop();
    assert.ok(near(thr.p1, [0, 0], 4), `${event} seed ${seed}: throw goes home`);
    if (event === 'SINGLE_HOME_OUT') assert.ok(home > thr.t1, `seed ${seed}: out at home`);
    else assert.ok(home < thr.t1, `seed ${seed}: safe at home`);
  }
});
test('line drive double play: ball reaches the base before the runner gets back', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const sc = buildPlay({ event: 'LINE_DP', style: 'liner', fly: false, bats: 'R', contact: { pull: seed % 3 - 1 }, bases: [true, false, false], rng: createRng(seed) });
    const r1 = sc.runners.find(r => r.base === 1), back = r1.keys.filter(k => near([k.x, k.y], BASES[1], 1)).map(k => k.t).filter(t => t > 0.5)[0];
    assert.equal(sc.outs.length, 2);
    assert.ok(back > sc.outs[1], `seed ${seed}: runner back ${back} after out ${sc.outs[1]}`);
  }
});
test('wall catch: caught above the fence top at the wall; dive: caught near the ground', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const w = buildPlay({ event: 'OUT', fly: true, style: 'wall', bats: 'R', contact: { pull: 0 }, bases: [false, false, false], rng: createRng(seed) });
    const p = ballAt(w, w.outs[0] - 0.001).p;
    assert.ok(p[2] > 10 && Math.hypot(p[0], p[1]) > fenceAt(angOf(p[0], p[1])) - 6, `wall seed ${seed}`);
    const d = buildPlay({ event: 'OUT', fly: true, style: 'dive', bats: 'L', contact: { pull: 0.5 }, bases: [false, false, false], rng: createRng(seed) });
    const q = ballAt(d, d.outs[0] - 0.001).p;
    assert.ok(q[2] < 3 && Math.abs(angOf(q[0], q[1])) <= 45, `dive seed ${seed}`);
  }
});
