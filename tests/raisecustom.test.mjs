// 육성모드 커스텀 선수(core/raisecustom.js): 직접 만든 선수가 삼성에 들어와 똑같이 훈련·경기·저장된다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, slotPlayer, raiseLineup, raiseTeam, applyDay, choose, dayInfo, matchSetup, loadRaise, saveRaise, nextSeason, benchPlan, RAISE } from '../js/core/raise.js';
import { createMatch, simulateUntil } from '../js/core/match.js';
import { raiseStep, raiseSteal, PINCH_IN } from '../js/core/raisematch.js';
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
  assert.equal(validCustom({ ...myBat, face: 17 }), true);                  // 여성 얼굴(9~17)
  assert.equal(validCustom({ ...myBat, face: 18 }), false);
  assert.equal(validCustom({ ...mySp, velo: 170 }), false);
  assert.equal(validCustom({ ...myCl, stamina: 80 }), false);              // 마무리는 체력 상한이 낮다
});

test('a custom batter joins Samsung, bats in the lineup, starts at the minimum salary', () => {
  const s = newSlot(null, { custom: { ...myBat, name: ' 홍길동 ' } });
  assert.equal(s.playerId, CUSTOM_ID.bat); assert.equal(s.kind, 'bat'); assert.equal(s.custom.name, '홍길동');
  assert.equal(s.salary, PAY.min);
  const p = slotPlayer(s);
  assert.equal(p.name, '홍길동'); assert.equal(p.power, 85); assert.equal(p.speed, 45); assert.equal(p.pos, 'SS'); assert.equal(p.face, 3);
  assert.ok(matchSetup(s).userTeam.batters.some(b => b.id === s.playerId));
  // 신인이라 후보에서 시작: 선발 출전하는 날만 타순에 있다
  assert.equal(s.bench, true); assert.equal(s.trust, 0);
  const inLineup = raiseLineup(s, raiseTeam(s)).order.includes(s.playerId);
  assert.equal(inLineup, benchPlan(s) === 'start');
  assert.equal(raiseLineup({ ...s, bench: false }, raiseTeam(s)).order.includes(s.playerId), true);   // 주전이면 늘
  assert.throws(() => newSlot(null, { custom: { ...myBat, power: 99 } }));
});

test('custom players train, play a whole season and survive a save', () => {
  const rng = createRng(11);
  let s = newSlot(null, { custom: myBat });
  s = choose(s, 'contact').slot;
  assert.ok(slotPlayer(s).contact >= 70);
  s = { ...s, bench: false };                                             // 주전으로 한 시즌
  while (s.season.phase === 'regular') { s = applyDay(s, null, rng).slot; }
  const pa = s.stats.bat.pa;
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

test('a rookie bench player: some starts, pinch-hit chances, and no appearance on other days', () => {
  let s = newSlot(null, { custom: myBat });
  const seen = { start: 0, pinch: 0, none: 0 };
  for (let r = 0; r < s.season.schedule.length; r++) {
    const x = { ...s, season: { ...s.season, round: r } }, d = dayInfo(x);
    seen[d.plan]++;
    assert.equal(d.needsScreen, d.plan !== 'none');
    assert.equal(!!matchSetup(x).raise.pinch, d.plan === 'pinch');
  }
  assert.ok(seen.start >= 1 && seen.pinch >= 5 && seen.none >= 3, JSON.stringify(seen));
});

test('pinch-hitting: from the 7th the rookie bats in the DH spot, then plays on', () => {
  let s = newSlot(null, { custom: myBat }), r0 = 0;
  while (benchPlan({ ...s, season: { ...s.season, round: r0 } }) !== 'pinch') r0++;
  s = { ...s, season: { ...s.season, round: r0 } };
  const ms = matchSetup(s), id = s.playerId;
  let pinched = 0, bench = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const rng = createRng(seed);
    let m = createMatch({ userTeam: ms.userTeam, cpuTeam: ms.cpuTeam, userLineup: ms.lineup, innings: 9, rng, cpuStarterId: ms.cpuStarterId }), r, first = true;
    assert.ok(!m.lineups.home.order.includes(id));
    for (let k = 0; k < 50; k++) {
      r = raiseStep(m, ms.raise, rng);
      if (r.phase === 'steal') { m = raiseSteal(r.match, id, false, rng).match; continue; }
      if (r.phase === 'done') break;
      if (first) { assert.equal(r.pinchIn, true); assert.ok(r.match.game.inning >= PINCH_IN); assert.ok(r.match.lineups.home.order.includes(id)); pinched++; first = false; }
      m = simulateUntil(r.match, rng, x => x.log.length > r.match.log.length);
    }
    if (first) { assert.equal(r.note, 'bench'); bench++; }
    else assert.ok(r.match.log.some(e => e.batterId === id));
  }
  assert.ok(pinched >= 6, `pinched ${pinched}, no chance ${bench}`);
});

test('hitting builds the manager trust; a full meter promotes him to everyday DH', () => {
  const rng = createRng(2);
  let s = { ...newSlot(null, { custom: { ...myBat, contact: 85, power: 85, eye: 45, speed: 35 } }), trust: RAISE.bench.need - 10 }, promoted = null;
  while (s.season.phase === 'regular' && !promoted) { const r = applyDay(s, null, rng); if (r.report.promoted) promoted = r; s = r.slot; }
  assert.ok(promoted, 'promoted within a season');
  assert.equal(s.bench, false); assert.equal(s.trust, RAISE.bench.need);
  assert.equal(dayInfo(s).plan, null);
  assert.ok(raiseLineup(s, raiseTeam(s)).order.includes(s.playerId));
  // 기존 선수는 후보가 아니다
  assert.equal(newSlot('samsung-b06').bench, undefined); assert.equal(dayInfo(newSlot('samsung-b06')).plan, null);
});
