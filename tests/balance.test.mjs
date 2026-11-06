import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { computePitch } from '../js/core/pitch.js';
import { swingResult } from '../js/core/batting.js';
import { battedBall } from '../js/core/outcome.js';
import { cpuChoosePitch, cpuSwing } from '../js/core/ai.js';

const pitcher = { throws: 'R', role: 'SP', velo: 145, control: 50, stamina: 999, pitches: ['FB', 'SL', 'CH'] };

function plateAppearance(batter, rng) {
  let balls = 0, strikes = 0;
  for (;;) {
    const c = cpuChoosePitch({ pitcher, balls, strikes, rng });
    const p = computePitch({ pitcher, ...c, pitchCount: 0, rng });
    const s = cpuSwing({ batter, pitch: p, balls, strikes, rng });
    if (!s.swing) { if (p.isStrike) strikes++; else balls++; }
    else {
      const r = swingResult({ timingDiffMs: s.timingDiffMs, batter, pitch: p, rng });
      if (r.kind === 'MISS') strikes++;
      else if (r.kind === 'FOUL') { if (strikes < 2) strikes++; }
      else return battedBall({ quality: r.quality, pull: r.pull, power: batter.power, outs: 0, runnerOnFirst: false, runnerOnThird: false, rng });
    }
    if (balls >= 4) return 'BB';
    if (strikes >= 3) return 'K';
  }
}
function sim(batter, n, seed) {
  const rng = createRng(seed), c = {};
  for (let i = 0; i < n; i++) { const e = plateAppearance(batter, rng); c[e] = (c[e] || 0) + 1; }
  const hits = (c.SINGLE || 0) + (c.INFIELD_SINGLE || 0) + (c.DOUBLE || 0) + (c.TRIPLE || 0) + (c.HR || 0);
  return { avg: hits / (n - (c.BB || 0)), hr: (c.HR || 0) / n, k: (c.K || 0) / n, bb: (c.BB || 0) / n };
}

const avg = sim({ power: 50, contact: 50, eye: 50 }, 3000, 11);
test(`batting average in range (${avg.avg.toFixed(3)})`, () => assert.ok(avg.avg >= 0.22 && avg.avg <= 0.31));
test(`home run rate in range (${avg.hr.toFixed(3)})`, () => assert.ok(avg.hr >= 0.01 && avg.hr <= 0.05));
test(`strikeout rate in range (${avg.k.toFixed(3)})`, () => assert.ok(avg.k >= 0.12 && avg.k <= 0.28));
test(`walk rate in range (${avg.bb.toFixed(3)})`, () => assert.ok(avg.bb >= 0.05 && avg.bb <= 0.14));
test('power hitters hit more home runs', () => {
  const hi = sim({ power: 90, contact: 50, eye: 50 }, 3000, 12).hr, lo = sim({ power: 30, contact: 50, eye: 50 }, 3000, 13).hr;
  assert.ok(hi >= lo * 2, `hi ${hi} lo ${lo}`);
});
