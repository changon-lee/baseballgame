// 포구 실패: 몸에 맞는 공(사구)과 폭투
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, applyEvent } from '../js/core/rules.js';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { pitchMiss } from '../js/core/pitch.js';
import { createMatch, matchup, cpuPitchToUser, resolveUserSwing } from '../js/core/match.js';

const setup = (o = {}) => ({ ...createGameState({ innings: 3 }), ...o });
const run = (s, events) => { let runs = 0; for (const e of events) { const r = applyEvent(s, e); s = r.state; runs += r.runs; } return { s, runs }; };

test('HBP puts the batter on first and pushes only forced runners', () => {
  const { s, runs } = run(setup({ bases: [true, false, true] }), ['HBP']);
  assert.deepEqual(s.bases, [true, true, true]); assert.equal(runs, 0); assert.equal(s.battingIndex.away, 1);
  assert.equal(run(setup({ bases: [true, true, true] }), ['HBP']).runs, 1);
});
test('wild pitch: runners move up one base, count gets a ball, PA continues', () => {
  const { s, runs } = run(setup({ bases: [true, false, true] }), ['WILD']);
  assert.deepEqual(s.bases, [false, true, false]); assert.equal(runs, 1); assert.equal(s.balls, 1);
  assert.equal(s.battingIndex.away, 0);
});

test('pitchMiss: inside to the batter = HBP, very far = WILD, normal ball = null', () => {
  assert.equal(pitchMiss({ x: -1.75, y: 0 }, 'R', 'R'), 'HBP');     // 우타자는 x<0 쪽
  assert.equal(pitchMiss({ x: 1.5, y: 0 }, 'R', 'R'), null);
  assert.equal(pitchMiss({ x: 1.75, y: 0 }, 'L', 'R'), 'HBP');
  assert.equal(pitchMiss({ x: 1.5, y: 0 }, 'S', 'L'), null);       // 양타자 vs 좌투수 = 우타석
  assert.equal(pitchMiss({ x: 0, y: -1.8 }, 'R', 'R'), 'WILD');
  assert.equal(pitchMiss({ x: 1.2, y: 1.2 }, 'R', 'R'), null);
});

const sam = getTeam('samsung'), lg = getTeam('lg');
const N = 600;
// 안 친 공 N번의 결과 분포. plate.x는 '타자 쪽 +'로 적고 타자 손에 맞춰 뒤집는다
function takeMany(plate, bases, balls = 0) {
  const out = {};
  for (let i = 1; i <= N; i++) {
    const base = createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings: 9, rng: createRng(i) });
    const m = { ...base, game: { ...base.game, half: 'bottom', bases, balls } };
    const b = matchup(m).batter, side = b.bats === 'L' ? 1 : b.bats === 'R' ? -1 : 1;
    const pitch = { ...cpuPitchToUser(m, createRng(i)), plate: { x: plate.x * side, y: plate.y }, isStrike: false };
    const e = resolveUserSwing(m, pitch, null, createRng(i + 7)).event;
    out[e] = (out[e] || 0) + 1;
  }
  return out;
}
test('ball tight on the body is HBP about half the time', () => {
  const r = takeMany({ x: 1.75, y: 0 }, [false, false, false]);
  assert.ok(r.HBP > N * 0.35 && r.HBP < N * 0.65, JSON.stringify(r));
  assert.equal((r.HBP || 0) + (r.BALL || 0), N);
});
test('far-off ball gets past the catcher sometimes, only with runners on and not on ball four', () => {
  const far = { x: 0, y: -1.9 };
  const on = takeMany(far, [true, false, false]);
  assert.ok(on.WILD > N * 0.2 && on.WILD < N * 0.5, JSON.stringify(on));
  assert.equal(takeMany(far, [false, false, false]).WILD, undefined);
  assert.equal(takeMany(far, [true, false, false], 3).WILD, undefined);
});
