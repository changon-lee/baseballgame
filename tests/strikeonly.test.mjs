// 타격 연습: 컴퓨터 투수는 무조건 스트라이크를 던진다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { createMatch, cpuPitchToUser } from '../js/core/match.js';

const sam = getTeam('samsung'), lg = getTeam('lg');
const mk = seed => {
  const m = createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings: 9, rng: createRng(seed) });
  return { ...m, game: { ...m.game, half: 'bottom' } };
};

test('strikeOnly: every pitch is a strike, even for wild pitchers and 3-ball counts', () => {
  for (let i = 1; i <= 400; i++) {
    const m = mk(i), balls = i % 4;
    const p = cpuPitchToUser({ ...m, game: { ...m.game, balls } }, createRng(i), { strikeOnly: true });
    assert.equal(p.isStrike, true, `seed ${i}`);
    assert.ok(Math.abs(p.plate.x) <= 1.02 && Math.abs(p.plate.y) <= 1.02, `seed ${i} plate ${JSON.stringify(p.plate)}`);
  }
});

test('without strikeOnly the cpu still throws balls', () => {
  let balls = 0;
  for (let i = 1; i <= 200; i++) if (!cpuPitchToUser(mk(i), createRng(i)).isStrike) balls++;
  assert.ok(balls > 30);
});
