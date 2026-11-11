// 작전: 번트·도루
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { getTeam } from '../js/data/rosters.js';
import { defaultLineup } from '../js/core/team.js';
import { createGameState, applyEvent, buntLead, stealRunners } from '../js/core/rules.js';
import { buntResult, stealChance } from '../js/core/bunt.js';
import { createMatch, resolveUserSwing } from '../js/core/match.js';
import { playerLine } from '../js/core/growth.js';
import { buildPlay } from '../js/ui/art/playscript.js';

const st = (bases, extra = {}) => ({ ...createGameState({ innings: 9 }), half: 'bottom', bases, ...extra });
const sam = getTeam('samsung'), lg = getTeam('lg');
const batting = (bases, extra = {}) => {
  const m = createMatch({ userTeam: sam, cpuTeam: lg, userLineup: defaultLineup(sam), innings: 9, rng: createRng(1) });
  return { ...m, game: { ...m.game, half: 'bottom', bases, ...extra } };
};
const pitch = (o = {}) => ({ type: 'FB', speedKmh: 145, plate: { x: 0, y: 0 }, breakX: 0, breakY: 0, isStrike: true, throws: 'R', travelMs: 400, ...o });

test('sacrifice bunt: batter out, every runner moves up one, runner on third scores', () => {
  const r = applyEvent(st([true, true, true]), 'SAC_BUNT');
  assert.equal(r.state.outs, 1); assert.equal(r.runs, 1); assert.deepEqual(r.state.bases, [false, true, true]); assert.ok(r.paEnded);
});
test('bunt single: batter safe at first and runners move up one', () => {
  const r = applyEvent(st([true, false, false]), 'BUNT_SINGLE');
  assert.deepEqual(r.state.bases, [true, true, false]); assert.equal(r.state.outs, 0);
});
test('bunt fielder choice gets the lead forced runner', () => {
  assert.equal(buntLead([true, false, false]), 0);
  assert.equal(buntLead([true, true, false]), 1);
  assert.equal(buntLead([false, true, false]), 1);
  assert.equal(buntLead([true, false, true]), 0);       // 3루 주자는 포스가 아니다
  const r = applyEvent(st([true, true, false]), 'BUNT_FC');
  assert.equal(r.state.outs, 1); assert.deepEqual(r.state.bases, [true, true, false]);   // 2루 주자 3루에서 아웃, 1루 주자 2루, 타자 1루
});
test('two-strike bunt foul is a strikeout', () => {
  const a = applyEvent(st([false, false, false], { strikes: 1 }), 'BUNT_FOUL');
  assert.equal(a.state.strikes, 2); assert.ok(!a.paEnded);
  const b = applyEvent(st([false, false, false], { strikes: 2 }), 'BUNT_FOUL');
  assert.equal(b.state.outs, 1); assert.ok(b.paEnded);
});
test('steal: who can run', () => {
  assert.deepEqual(stealRunners([true, false, false]), { lead: 0, trail: null });
  assert.deepEqual(stealRunners([false, true, false]), { lead: 1, trail: null });
  assert.deepEqual(stealRunners([true, true, false]), { lead: 1, trail: 0 });      // 더블 스틸
  assert.deepEqual(stealRunners([true, false, true]), { lead: 0, trail: null });
  assert.equal(stealRunners([false, false, true]), null);
  assert.equal(stealRunners([true, true, true]), null);
});
test('steal and caught stealing move the right runners; third out ends the half', () => {
  assert.deepEqual(applyEvent(st([true, true, false]), 'STEAL').state.bases, [false, true, true]);
  const cs = applyEvent(st([true, true, false]), 'CAUGHT_STEALING').state;
  assert.equal(cs.outs, 1); assert.deepEqual(cs.bases, [false, true, false]);
  const end = applyEvent(st([true, false, false], { outs: 2, inning: 3 }), 'CAUGHT_STEALING').state;
  assert.equal(end.inning, 4); assert.equal(end.half, 'top'); assert.deepEqual(end.bases, [false, false, false]);
});
test('steal chance: slow pitches and balls in the dirt help the runner', () => {
  const b = [true, false, false];
  assert.ok(stealChance(b, pitch({ speedKmh: 120 })) > stealChance(b, pitch({ speedKmh: 150 })));
  assert.ok(stealChance(b, pitch({ plate: { x: 0, y: -1.2 } })) > stealChance(b, pitch()));
  assert.equal(stealChance([false, false, true], pitch()), 0);
});
test('a well-placed bunt with a runner on is usually a sacrifice; a bat far from the ball misses', () => {
  const rng = createRng(3), n = {};
  for (let i = 0; i < 2000; i++) {
    const r = buntResult({ timingDiffMs: 40, batter: { contact: 60 }, pitch: pitch(), bat: { x: 0, y: 0, level: 'normal' }, bases: [true, false, false], rng });
    n[r.event] = (n[r.event] || 0) + 1;
  }
  assert.ok(n.SAC_BUNT / 2000 > 0.55, JSON.stringify(n));
  assert.ok((n.BUNT_SINGLE || 0) > 0 && (n.BUNT_FC || 0) > 0 && (n.BUNT_FOUL || 0) > 0);
  const far = buntResult({ timingDiffMs: 0, batter: { contact: 60 }, pitch: pitch({ plate: { x: 0.9, y: -0.9 } }), bat: { x: -0.9, y: 0.9, level: 'normal' }, bases: [true, false, false], rng });
  assert.equal(far.event, 'STRIKE');
});
test('user bunt goes through the match; steal resolves on a taken pitch but not on a foul', () => {
  const m = batting([true, false, false]);
  const b = resolveUserSwing(m, pitch(), 30, createRng(5), { x: 0, y: 0, level: 'easy' }, { bunt: true });
  assert.ok(b.contact.bunt);
  const t = resolveUserSwing(m, pitch({ isStrike: false, plate: { x: 1.3, y: 0 } }), null, createRng(5), null, { steal: true });
  assert.ok(t.steal); assert.equal(t.event, 'BALL');
  assert.deepEqual(t.match.game.bases, t.steal.ok ? [false, true, false] : [false, false, false]);
  assert.equal(t.match.game.outs, t.steal.ok ? 0 : 1);
  // 친 공(파울 등)이면 도루는 없던 일
  for (let s = 0; s < 30; s++) {
    const f = resolveUserSwing(m, pitch(), 0, createRng(s), { x: 0, y: 0, level: 'easy' }, { steal: true });
    if (f.event === 'FOUL' || f.contact.kind === 'INPLAY') assert.equal(f.steal, undefined);
  }
});
test('a sacrifice bunt is not an at-bat', () => {
  const line = playerLine({}, [{ batterId: 'x', pitcherId: 'y', event: 'SAC_BUNT', runs: 0, outs: 1 }]);
  assert.equal(line.bat.x.pa, 1); assert.equal(line.bat.x.ab, 0); assert.equal(line.pit.y.outs, 1);
});
test('bunt scenes build: the out (if any) is thrown, runners move up', () => {
  const cases = [['SAC_BUNT', [true, false, false], 1], ['BUNT_SINGLE', [false, true, false], 0], ['BUNT_FC', [true, true, false], 1], ['OUT', [false, false, false], 1]];
  for (const [event, bases, outs] of cases) for (let s = 1; s < 8; s++) {
    const sc = buildPlay({ event, fly: false, style: event === 'OUT' ? 'bunt' : null, contact: { pull: 0, quality: 0.15 }, bats: 'R', bases, rng: createRng(s) });
    assert.equal(sc.outs.length, outs, event);
    assert.ok(sc.end > sc.decisive && sc.decisive > 1 && sc.end < 12, `${event} ${sc.decisive} ${sc.end}`);
  }
});
test('steal scene: catcher throws to the base, runner slides in; safe has no out, caught has one', () => {
  const last = keys => keys[keys.length - 1];
  for (let s = 1; s < 8; s++) {
    const safe = buildPlay({ event: 'STEAL', steal: { lead: 0, trail: null }, bats: 'R', bases: [true, false, false], rng: createRng(s) });
    assert.equal(safe.outs.length, 0);
    const r = safe.runners.find(q => q.base === 1), k = last(r.keys);
    assert.ok(Math.hypot(k.x - 0, k.y - 127.3) < 1, 'runner ends on second');
    assert.ok(safe.ball.some(b => b.type === 'throw'));
    const out = buildPlay({ event: 'CAUGHT_STEALING', steal: { lead: 1, trail: 0 }, bats: 'L', bases: [true, true, false], rng: createRng(s) });
    assert.equal(out.outs.length, 1);
    const tr = last(out.runners.find(q => q.base === 1).keys);
    assert.ok(Math.hypot(tr.x - 0, tr.y - 127.3) < 1, 'trailing runner takes second');
    assert.ok(out.end > out.decisive && out.decisive < 5);
  }
});
