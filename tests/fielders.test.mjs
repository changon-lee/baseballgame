// 수비수 움직임: 안타 뜬공은 아무도 못 닿는 곳에 떨어지고, 가까운 수비수는 공 쪽으로 달려간다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { buildPlay, SPOTS, reachBy } from '../js/ui/art/playscript.js';

const all = ['1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const hyp = (a, b, c, d) => Math.hypot(c - a, d - b);
const fly = sc => sc.ball.find(q => q.type === 'fly');

test('fly singles and doubles drop where no fielder could have reached them', () => {
  for (const event of ['SINGLE', 'DOUBLE']) {
    let ok = 0, n = 0;
    for (let s = 1; s <= 200; s++) {
      const sc = buildPlay({ event, fly: true, contact: { pull: (s % 7 - 3) / 3, quality: 0.7 }, bats: s % 2 ? 'R' : 'L', bases: [false, false, false], rng: createRng(s) });
      const f = fly(sc);
      if (!f) continue;
      n++;
      const T = f.t1 - f.t0, [x, y] = f.p1;
      if (all.every(p => hyp(...SPOTS[p], x, y) > reachBy(p, T))) ok++;
    }
    assert.ok(n > 150, `${event} fly scenes ${n}`);
    assert.ok(ok / n > 0.95, `${event} catchable drops: ${n - ok}/${n}`);
  }
});

test('an infielder near a fly ball runs toward it instead of standing still', () => {
  let checked = 0;
  for (let s = 1; s <= 300; s++) {
    const sc = buildPlay({ event: 'SINGLE', fly: true, contact: { pull: 0, quality: 0.7 }, bats: 'R', bases: [false, false, false], rng: createRng(s) });
    const f = fly(sc);
    if (!f) continue;
    const [x, y] = f.p1;
    for (const p of ['2B', 'SS']) {
      const d0 = hyp(...SPOTS[p], x, y);
      if (d0 > 100 || d0 < 30) continue;
      const k = sc.fielders[p], last = k[k.length - 1];
      if (k.some(q => ['cover', 'receive', 'dive'].includes(q.act))) continue;   // 베이스 커버·중계 등 다른 일을 맡았으면 건너뛴다
      checked++;
      assert.ok(hyp(last.x, last.y, x, y) < d0 - 15, `${p} seed ${s}: ${d0.toFixed(0)} → ${hyp(last.x, last.y, x, y).toFixed(0)}`);
    }
  }
  assert.ok(checked > 20, `checked ${checked}`);
});
