// 육성모드 커스텀 선수(core/raisecustom.js): 직접 만든 선수가 삼성에 들어와 똑같이 훈련·경기·저장된다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, slotPlayer, raiseLineup, raiseTeam, applyDay, choose, dayInfo, matchSetup, loadRaise, saveRaise, nextSeason } from '../js/core/raise.js';
import { CUSTOM, CUSTOM_ID, defaultCustom, validCustom, usedPoints, customPlayer } from '../js/core/raisecustom.js';
import { leaderboard } from '../js/core/raisestats.js';
import { PAY } from '../js/core/raisepay.js';
import { createRng } from '../js/core/rng.js';

const myBat = { ...defaultCustom('bat'), name: '홍길동', face: 3, pos: 'SS', bats: 'L', power: 85, contact: 70, eye: 50, speed: 45 };
const mySp = { ...defaultCustom('pitch', 'SP'), name: '김에이스', throws: 'L', control: 75, stamina: 90 };
const myCl = { ...defaultCustom('pitch', 'CL'), name: '박마무리' };

test('the defaults leave points to spend and are valid; anything over budget or out of range is not', () => {
  for (const [c, g] of [[defaultCustom('bat'), 'bat'], [defaultCustom('pitch', 'SP'), 'SP'], [defaultCustom('pitch', 'CL'), 'CL']]) {
    assert.equal(validCustom({ ...c, name: '테스트' }), true, g);
    assert.ok(usedPoints(c) < CUSTOM[g].budget && usedPoints(c) >= CUSTOM[g].budget - 60, `${g} ${usedPoints(c)}`);   // 포인트를 남겨 두고 시작
  }
  assert.equal(validCustom(myBat), true);
  assert.equal(validCustom({ ...myBat, eye: 85 }), false);                  // 포인트 초과
  assert.equal(validCustom({ ...myBat, name: '  ' }), false);
  assert.equal(validCustom({ ...myBat, name: '아주아주긴이름입니다' }), false);
  assert.equal(validCustom({ ...myBat, pos: 'P' }), false);
  assert.equal(validCustom({ ...mySp, velo: 170 }), false);
  assert.equal(validCustom({ ...myCl, stamina: 80 }), false);              // 마무리는 체력 상한이 낮다
});

test('a custom batter joins Samsung, bats in the lineup, starts at the minimum salary', () => {
  const s = newSlot(null, { custom: { ...myBat, name: ' 홍길동 ' } });
  assert.equal(s.playerId, CUSTOM_ID.bat); assert.equal(s.kind, 'bat'); assert.equal(s.custom.name, '홍길동');
  assert.equal(s.salary, PAY.min);
  const p = slotPlayer(s);
  assert.equal(p.name, '홍길동'); assert.equal(p.power, 85); assert.equal(p.speed, 45); assert.equal(p.pos, 'SS'); assert.equal(p.face, 3);
  assert.ok(raiseLineup(s, raiseTeam(s)).order.includes(s.playerId));
  assert.ok(matchSetup(s).userTeam.batters.some(b => b.id === s.playerId));
  assert.throws(() => newSlot(null, { custom: { ...myBat, power: 99 } }));
});

test('custom players train, play a whole season and survive a save', () => {
  const rng = createRng(11);
  let s = newSlot(null, { custom: myBat });
  s = choose(s, 'contact').slot;
  assert.ok(slotPlayer(s).contact >= 70);
  let pa = 0;
  while (s.season.phase === 'regular') { s = applyDay(s, null, rng).slot; }
  pa = s.stats.bat.pa;
  assert.ok(pa > 50, `pa ${pa}`);
  const lb = leaderboard(s, 'avg');
  assert.equal(lb.rows.find(r => r.me).name, '홍길동');
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  saveRaise(storage, { slots: [s, null, null] });
  const back = loadRaise(storage);
  assert.deepEqual(back.slots[0], s); assert.deepEqual(back.broken, []);
  // 손대서 포인트를 넘긴 저장은 손상으로 본다
  saveRaise(storage, { slots: [{ ...s, custom: { ...s.custom, power: 85, contact: 85, eye: 85 } }, null, null] });
  assert.deepEqual(loadRaise(storage).broken, [0]);
  while (s.season.phase !== 'done') s = applyDay(s, null, rng).slot;
  const n = nextSeason(s);
  assert.equal(slotPlayer(n).name, '홍길동'); assert.deepEqual(n.custom, s.custom);
});

test('a custom starter takes his turn in the rotation; a custom closer is a reliever', () => {
  const rng = createRng(5);
  let s = newSlot(null, { custom: mySp });
  assert.equal(s.role, 'SP'); assert.equal(customPlayer(mySp).role, 'SP');
  assert.equal(dayInfo(s).myStart, true);
  assert.equal(matchSetup(s).lineup.starterId, CUSTOM_ID.pitch);
  s = applyDay(s, null, rng).slot;
  assert.ok(s.stats.pit && s.stats.pit.outs > 0, 'pitched in his start');
  const c = newSlot(null, { custom: myCl });
  assert.equal(c.role, 'CL'); assert.equal(slotPlayer(c).role, 'RP');
});
