// 육성모드: 슬롯·훈련·휴식·피로·저장 (core/raise.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTeam } from '../js/data/rosters.js';
import { newSlot, loadRaise, saveRaise, slotPlayer, raiseTeam, raiseLineup, xpPerTraining, canChoose, choose, DRILLS, RAISE } from '../js/core/raise.js';

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};
const fresh = s => ({ ...s, chosen: false });

test('newSlot: real Samsung player, role from roster', () => {
  const b = newSlot('samsung-b03');
  assert.equal(b.kind, 'bat'); assert.equal(b.role, null); assert.equal(slotPlayer(b).name, '구자욱');
  assert.equal(newSlot('samsung-p01').role, 'SP');
  assert.equal(newSlot('samsung-p05').role, 'CL');
  assert.equal(b.condition, 0); assert.equal(b.fatigue, 0); assert.deepEqual(b.traits, []); assert.equal(b.chosen, false);
  assert.equal(b.season.year, 2027); assert.equal(b.season.schedule.length, 27);
  assert.throws(() => newSlot('lg-b01'));
});

test('DRILLS: three stat trainings and three trait drills per kind', () => {
  for (const kind of ['bat', 'pitch']) {
    const d = DRILLS.filter(x => x.kind === kind);
    assert.equal(d.filter(x => !x.drill).length, 3); assert.equal(d.filter(x => x.drill).length, 3);
    for (const x of d) assert.equal(x.cost, x.drill ? RAISE.drillCost : RAISE.trainCost);
  }
  assert.deepEqual(DRILLS.filter(x => x.drill).map(x => x.trait), ['clutch', 'lhpKiller', 'firstPitch', 'escape', 'lhbKiller', 'finisher']);
});

test('training raises the stat with diminishing returns and caps', () => {
  let s = newSlot('samsung-b03');                    // 구자욱 파워 72
  for (let i = 0; i < 3; i++) s = choose({ ...fresh(s), fatigue: 0 }, 'power').slot;
  assert.ok(slotPlayer(s).power >= 73, `power ${slotPlayer(s).power}`);
  assert.ok(xpPerTraining('power', 92) < xpPerTraining('power', 72));
  assert.ok(xpPerTraining('power', 99) >= RAISE.xpMin);
  assert.ok(xpPerTraining('velo', 160) < xpPerTraining('velo', 145));
  let t = { ...newSlot('samsung-b04'), growth: { xp: {}, delta: { 'samsung-b04': { power: 6 } } } };   // 디아즈 93+6 = 99
  for (let i = 0; i < 10; i++) t = choose({ ...fresh(t), fatigue: 0 }, 'power').slot;
  assert.equal(slotPlayer(t).power, 99);
});

test('fatigue blocks training but never rest; stays within 0..100', () => {
  const s = { ...newSlot('samsung-b03'), fatigue: 85 };
  assert.equal(canChoose(s, 'power').reason, 'tired');
  assert.equal(canChoose({ ...s, fatigue: 80 }, 'power').ok, true);
  assert.equal(canChoose({ ...s, fatigue: 80 }, 'drillRisp').reason, 'tired');
  assert.equal(canChoose(s, 'rest').ok, true);
  assert.throws(() => choose(s, 'power'));
  assert.equal(choose({ ...s, fatigue: 10 }, 'rest').slot.fatigue, 0);
  assert.equal(choose({ ...s, fatigue: 80 }, 'power').slot.fatigue, 100);
});

test('rest moves condition one step toward normal', () => {
  const s = newSlot('samsung-b03');
  assert.equal(choose({ ...s, condition: -2 }, 'rest').slot.condition, -1);
  assert.equal(choose({ ...s, condition: 2 }, 'rest').slot.condition, 1);
  assert.equal(choose({ ...s, condition: 0 }, 'rest').slot.condition, 0);
});

test('one choice per day, and only the drills of my kind', () => {
  const s = choose(newSlot('samsung-b03'), 'contact').slot;
  assert.equal(s.chosen, true);
  assert.equal(canChoose(s, 'rest').reason, 'done');
  assert.equal(canChoose(newSlot('samsung-b03'), 'velo').reason, 'kind');
  assert.equal(canChoose(newSlot('samsung-p01'), 'power').reason, 'kind');
  assert.equal(canChoose(newSlot('samsung-p01'), 'velo').ok, true);
});

test('drill 4 times grants its trait once', () => {
  let s = newSlot('samsung-b03'), got = [];
  for (let i = 0; i < 5; i++) {
    const r = choose({ ...fresh(s), fatigue: 0 }, 'drillRisp');
    s = r.slot; got.push(r.trait);
  }
  assert.deepEqual(got, [null, null, null, 'clutch', null]);
  assert.deepEqual(s.traits, ['clutch']);
  assert.equal(s.progress.train.drillRisp, 5);
});

test('save/load round trip; a broken slot does not spoil others or the career key', () => {
  const career = '{"v":1,"history":[]}';
  const st = memStore({ 'baseball.career.v1': career });
  const r0 = loadRaise(st);
  assert.deepEqual(r0.slots, [null, null, null]); assert.deepEqual(r0.broken, []);
  const a = newSlot('samsung-b03'), b = newSlot('samsung-p01');
  assert.equal(saveRaise(st, { v: 1, slots: [a, b, null] }), true);
  const r1 = loadRaise(st);
  assert.deepEqual(r1.slots[0], a); assert.deepEqual(r1.slots[1], b); assert.equal(r1.slots[2], null);
  // 1번 칸만 망가뜨린다
  const raw = JSON.parse(st.getItem('baseball.raise.v1')); raw.slots[1] = { playerId: 1 };
  st.setItem('baseball.raise.v1', JSON.stringify(raw));
  const r2 = loadRaise(st);
  assert.deepEqual(r2.slots[0], a); assert.equal(r2.slots[1], null); assert.deepEqual(r2.broken, [1]);
  // 통째로 깨진 JSON / 다른 버전
  st.setItem('baseball.raise.v1', '{oops');
  assert.deepEqual(loadRaise(st).slots, [null, null, null]);
  st.setItem('baseball.raise.v1', JSON.stringify({ v: 9, slots: [a] }));
  assert.deepEqual(loadRaise(st).slots, [null, null, null]);
  assert.equal(st.getItem('baseball.career.v1'), career);
  assert.deepEqual([...st.map.keys()].sort(), ['baseball.career.v1', 'baseball.raise.v1']);
  // 저장소가 막혀 있어도 죽지 않는다
  assert.equal(saveRaise({ setItem() { throw new Error('quota'); } }, { v: 1, slots: [] }), false);
  assert.deepEqual(loadRaise(null).slots, [null, null, null]);
});

test('raiseTeam applies my growth only; benchMe drops my pitcher', () => {
  const s = { ...newSlot('samsung-p01'), growth: { xp: {}, delta: { 'samsung-p01': { control: 3 } } } };
  const t = raiseTeam(s);
  assert.equal(t.pitchers.find(p => p.id === 'samsung-p01').control, getTeam('samsung').pitchers[0].control + 3);
  assert.equal(t.pitchers.find(p => p.id === 'samsung-p02').control, getTeam('samsung').pitchers[1].control);
  assert.equal(raiseTeam(s, { benchMe: true }).pitchers.some(p => p.id === 'samsung-p01'), false);
});

test('raiseLineup puts bench batter in the DH spot', () => {
  const s = newSlot('samsung-b10');                  // 이성규(벤치)
  const l = raiseLineup(s, raiseTeam(s));
  assert.equal(l.order.length, 9); assert.equal(new Set(l.order).size, 9);
  assert.equal(l.order[4], 'samsung-b10');           // 최형우(DH) 자리
  assert.ok(!l.order.includes('samsung-b05'));
  const k = newSlot('samsung-b03');
  assert.deepEqual(raiseLineup(k, raiseTeam(k)).order, getTeam('samsung').batters.slice(0, 9).map(b => b.id));
});
