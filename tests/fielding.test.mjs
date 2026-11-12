// 수비 조작: 찬스 고르기, 터치 판정, 짝 장면(성공/실패)이 터치 순간까지 똑같은지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { fieldChance, judgeTap, FIELD_WIN } from '../js/core/fielding.js';
import { buildPlay, trackAt, ballAt } from '../js/ui/art/playscript.js';
import { applyEvent } from '../js/core/rules.js';
import { createGameState } from '../js/core/rules.js';

const inplay = { kind: 'INPLAY', pull: 0.2, quality: 0.6 };

test('fieldChance picks only the close plays', () => {
  const E = [false, false, false], R2 = [false, true, false];
  assert.equal(fieldChance({ event: 'OUT', fly: true, style: 'dive', contact: inplay }, E).kind, 'dive');
  assert.equal(fieldChance({ event: 'SINGLE', fly: true, style: 'bloop', contact: inplay }, E).kind, 'dive');
  assert.equal(fieldChance({ event: 'INFIELD_SINGLE', fly: false, contact: inplay }, E).kind, 'throw');
  assert.equal(fieldChance({ event: 'SINGLE_HOME_OUT', fly: false, contact: inplay }, R2).kind, 'home');
  assert.equal(fieldChance({ event: 'SINGLE', fly: true, style: 'home_safe', contact: inplay }, R2).kind, 'home');
  for (const r of [{ event: 'OUT', fly: true, style: null }, { event: 'SINGLE', fly: false }, { event: 'HR', fly: true }, { event: 'OUT', fly: true, style: 'wall' }, { event: 'DOUBLE', fly: true }])
    assert.equal(fieldChance({ ...r, contact: inplay }, E), null, JSON.stringify(r));
  assert.equal(fieldChance({ event: 'BALL', contact: null }, E), null);
});

test('judgeTap: inside the window is a catch, closer is perfect, no tap is a miss', () => {
  const w = FIELD_WIN.normal;
  assert.equal(judgeTap(0), 'perfect');
  assert.equal(judgeTap(-w * 0.3), 'perfect');
  assert.equal(judgeTap(w * 0.9), 'good');
  assert.equal(judgeTap(-w - 1), 'miss');
  assert.equal(judgeTap(null), 'miss');
  assert.equal(judgeTap(150, 'easy'), 'good');
  assert.equal(judgeTap(150, 'hard'), 'miss');
  // 다이빙 캐치는 더 빡빡하다
  assert.equal(judgeTap(80, 'normal', 'dive'), 'miss');
  assert.equal(judgeTap(50, 'normal', 'dive'), 'good');
  assert.equal(judgeTap(80, 'normal', 'throw'), 'good');
});

test('good and bad outcomes differ the way the rules expect', () => {
  const g = { ...createGameState({ innings: 9 }), bases: [true, true, false] };
  const run = o => applyEvent(g, o.event, { ground: o.event === 'OUT' && !o.fly && o.style !== 'liner' }).state;
  const dive = fieldChance({ event: 'OUT', fly: true, style: 'dive', contact: inplay }, g.bases);
  assert.equal(run(dive.good).outs, 1); assert.equal(run(dive.bad).outs, 0);
  const home = fieldChance({ event: 'SINGLE_HOME_OUT', fly: false, contact: inplay }, g.bases);
  assert.equal(run(home.good).outs, 1); assert.equal(run(home.bad).score.away + run(home.bad).score.home, 1);
});

// 두 장면을 같은 씨앗으로 만들면 갈라지는 순간(until) 전까지 공·수비수·주자가 모두 같은 자리에 있어야 바꿔 끼워도 안 튄다
test('paired scenes are identical up to the decision moment', () => {
  const kinds = [
    [{ event: 'OUT', fly: true, style: 'dive' }, { event: 'SINGLE', fly: true, style: 'dive_miss' }],
    [{ event: 'OUT', fly: false, style: 'bang' }, { event: 'INFIELD_SINGLE', fly: false, style: null }],
    [{ event: 'SINGLE_HOME_OUT', fly: false, style: null }, { event: 'SINGLE', fly: false, style: 'home_safe' }],
    [{ event: 'SINGLE_HOME_OUT', fly: true, style: null }, { event: 'SINGLE', fly: true, style: 'home_safe' }],
  ];
  for (const [good, bad] of kinds) {
    let ok = 0, n = 0;
    for (let s = 1; s <= 80; s++) {
      const bases = good.event === 'SINGLE_HOME_OUT' ? [s % 2 === 0, true, s % 3 === 0] : [s % 2 === 0, s % 3 === 0, s % 5 === 0];
      const mk = o => buildPlay({ ...o, contact: { pull: (s % 7 - 3) / 3, quality: 0.6 }, bats: s % 2 ? 'R' : 'L', bases, rng: createRng(s * 7919) });
      const A = mk(good), B = mk(bad);
      n++;
      if (!A.chance || !B.chance) continue;
      assert.equal(A.chance.t, B.chance.t, `${good.event} seed ${s}`);
      const until = Math.min(A.chance.until, B.chance.until);
      if (until - A.chance.t < 0.12) continue;
      ok++;
      for (let t = 0; t <= until - 0.01; t += 0.05) {
        const pa = ballAt(A, t).p, pb = ballAt(B, t).p;
        assert.ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]) < 0.01, `${good.event} seed ${s} ball t=${t.toFixed(2)}`);
        for (const f of Object.keys(A.fielders)) {
          const a = trackAt(A.fielders[f], t), b = trackAt(B.fielders[f], t);
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.01 && a.act === b.act, `${good.event} seed ${s} ${f} t=${t.toFixed(2)}`);
        }
        A.runners.forEach((r, i) => {
          const a = trackAt(r.keys, t), b = trackAt(B.runners[i].keys, t);
          assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.01, `${good.event} seed ${s} runner ${i} t=${t.toFixed(2)}`);
        });
      }
      // 결과는 달라야 한다: 성공 장면엔 아웃, 실패 장면엔 (그 플레이의) 아웃이 없다
      assert.ok(A.outs.length > B.outs.length, `${good.event} seed ${s} outs ${A.outs.length}/${B.outs.length}`);
    }
    assert.ok(ok / n > 0.6, `${good.event}/${good.fly}: usable chances ${ok}/${n}`);
  }
});
