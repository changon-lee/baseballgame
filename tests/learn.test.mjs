// 육성모드 · 구종 배우기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, choose, canChoose, learnable, learnLeft, slotPlayer, raiseTeam, LEARN, RAISE } from '../js/core/raise.js';

const pitcher = () => ({ ...newSlot('samsung-p01'), chosen: false });

test('a pitcher can learn a pitch he does not have; batters cannot', () => {
  const s = pitcher(), has = slotPlayer(s).pitches;
  assert.ok(learnable(s).length > 0);
  for (const k of learnable(s)) assert.ok(!has.includes(k));
  assert.equal(canChoose(s, `learn:${has[0]}`).ok, false);
  assert.deepEqual(learnable({ ...newSlot('samsung-b01'), chosen: false }), []);
  assert.equal(canChoose({ ...newSlot('samsung-b01'), chosen: false }, 'learn:CT').ok, false);
});

test('practice points fill mastery; at LEARN.need the pitch joins the repertoire', () => {
  let s = pitcher();
  const k = learnable(s)[0], ref = RAISE.practiceRef.pitch;
  for (let i = 1; i < LEARN.need; i++) {
    const r = choose(s, `learn:${k}`, ref);
    assert.equal(r.learned, null); assert.equal(learnLeft(r.slot, k), LEARN.need - i);
    assert.ok(r.slot.fatigue > s.fatigue);
    s = { ...r.slot, chosen: false };
  }
  const r = choose(s, `learn:${k}`, ref);
  assert.equal(r.learned, k);
  s = { ...r.slot, chosen: false };
  assert.ok(slotPlayer(s).pitches.includes(k));
  assert.ok(raiseTeam(s).pitchers.find(p => p.id === s.playerId).pitches.includes(k));
  assert.ok(!learnable(s).includes(k));
  // 아주 잘 던지면 더 빨리(1.5배)
  const fast = choose(pitcher(), `learn:${k}`, ref * 3);
  assert.equal(learnLeft(fast.slot, k), LEARN.need - RAISE.practiceMax);
});

test('no more than LEARN.max pitches', () => {
  let s = pitcher();
  while (learnable(s).length) s = { ...s, learned: [...(s.learned || []), learnable(s)[0]] };
  assert.equal(slotPlayer(s).pitches.length, LEARN.max);
});
