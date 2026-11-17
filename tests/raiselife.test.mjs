// 육성모드 생활: 쇼핑·인기·부상·랜덤 이벤트(core/raiselife.js), 시즌 시상식(core/raiseawards.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, slotPlayer, canChoose, choose, applyDay, dayInfo, nextSeason, pickEvent, seasonGains, RAISE, STAT_CAP } from '../js/core/raise.js';
import { LIFE, SHOP, SHOP_GROUPS, buyItem, canBuy, has, trainMult, loadMult, injuryMult, dailyRecover, restBonus, fansOf, addFans, adsOf, rollInjury, EVENTS, eventOf } from '../js/core/raiselife.js';
import { computePitch } from '../js/core/pitch.js';
import { awardsOf, AWARDS } from '../js/core/raiseawards.js';
import { contract, salaryNow, PAY } from '../js/core/raisepay.js';
import { createRng } from '../js/core/rng.js';

const rich = id => ({ ...newSlot(id), assets: 1000000 });

test('the shop: staff for one season, gear for good, and only what you can afford', () => {
  let s = rich('samsung-b06');
  assert.equal(trainMult(s), 1);
  s = buyItem(s, 'trainer');
  assert.equal(s.assets, 1000000 - 10000); assert.ok(has(s, 'trainer')); assert.equal(trainMult(s), 1.25);
  assert.equal(canBuy(s, 'trainer').reason, 'owned');
  s = buyItem(s, 'coach'); assert.equal(trainMult(s), 1.6);
  assert.equal(canBuy(s, 'gGlove').reason, 'kind');                         // 투수 장비는 타자가 못 산다
  const before = slotPlayer(s).power;
  s = buyItem(s, 'gBat');
  assert.equal(slotPlayer(s).power, before + 2);
  assert.deepEqual(seasonGains(s), []);                                       // 장비는 '올해 오른 능력치'가 아니다
  const f = fansOf(s); s = buyItem(buyItem(s, 'donate'), 'donate');
  assert.equal(s.owned.donate, 2); assert.equal(fansOf(s), f + 16);
  assert.equal(canBuy({ ...newSlot('samsung-b06'), assets: 100 }, 'bed').reason, 'cash');
  // 훈련 경험치가 실제로 늘어난다
  const plain = choose(newSlot('samsung-b06'), 'power').slot.growth, coached = choose({ ...newSlot('samsung-b06'), owned: { coach: 2027 }, year: 2027 }, 'power').slot.growth;
  const xp = g => Object.values(g.delta['samsung-b06'] || {}).reduce((a, x) => a + (x.xp || 0) + (x.n || 0) * 100, 0);
  assert.ok(JSON.stringify(coached) !== JSON.stringify(plain));
  // 시즌 계약은 다음 시즌에 끝난다
  const done = { ...s, season: { ...s.season, round: s.season.schedule.length, phase: 'done', champion: null } };
  const n = nextSeason(done);
  assert.equal(has(n, 'coach'), false); assert.equal(has(n, 'gBat'), true);
  assert.ok(xp);
});

test('limit-break gear goes past 99, regular gear stops at 99', () => {
  let s = { ...newSlot('samsung-b04'), assets: 100000000 };                  // 디아즈 파워 93
  const base = slotPlayer(s).power;
  s = buyItem(buyItem(s, 'gBat'), 'xGodB');                                   // +2(상한까지) 다음 +10(상한 위)
  assert.equal(slotPlayer(s).power, Math.min(STAT_CAP.power, base + 2) + 10);
  assert.ok(slotPlayer(s).power > STAT_CAP.power);
  // 이미 상한을 넘은 능력치를 일반 장비가 깎지 않는다
  const big = buyItem(buyItem({ ...newSlot('samsung-b04'), assets: 100000000 }, 'xBat'), 'gBat');
  assert.ok(slotPlayer(big).power >= Math.min(STAT_CAP.power, base + 2) + 4);
  // 투수: 구속도 162km 위로
  let p = { ...newSlot('samsung-p01'), assets: 100000000 };
  const v = slotPlayer(p).velo; p = buyItem(p, 'xGodP');
  assert.equal(slotPlayer(p).velo, v + 6);
  assert.equal(canBuy(p, 'xGodB').reason, 'kind');
  for (const it of SHOP) assert.ok(SHOP_GROUPS.some(([g]) => g === it.group), it.id);
  assert.ok(SHOP.some(it => it.price >= 1000000), '100억 넘는 물건');
});

test('better staff replaces worse, body care takes the best one, recovery adds up', () => {
  let s = { ...newSlot('samsung-b06'), assets: 100000000 };
  s = buyItem(s, 'legendCoach');
  assert.equal(trainMult(s), 2.5);
  assert.equal(canBuy(s, 'coach').reason, 'owned'); assert.equal(canBuy(s, 'trainer').reason, 'owned');
  s = buyItem(s, 'science');
  assert.equal(loadMult(s), 0.5); assert.equal(injuryMult(s), 0.25);
  assert.equal(canBuy(s, 'nutri').reason, 'owned');
  s = buyItem(buyItem(buyItem(buyItem(s, 'house'), 'penthouse'), 'bed'), 'yacht');
  assert.equal(dailyRecover(s), LIFE.houseRecover + 5);
  assert.equal(restBonus(s), 10 + 15);
});

test('pitching math stays sane past control 100', () => {
  const pitcher = { velo: 168, control: 130, stamina: 110, throws: 'R' };
  const rng = createRng(1);
  for (let k = 0; k < 50; k++) {
    const p = computePitch({ pitcher, type: 'FB', target: { x: 0, y: 0 }, gaugePos: 0.5, pitchCount: 0, rng });
    assert.ok(Number.isFinite(p.plate.x) && Math.abs(p.plate.x) < 1, `x ${p.plate.x}`);
  }
});

test('fans start from the salary and pay ads at the season end', () => {
  assert.equal(fansOf(newSlot('samsung-b03')), LIFE.fans.max);              // 구자욱 20억
  assert.equal(fansOf(newSlot('samsung-b11')), LIFE.fans.min + 1);
  assert.equal(adsOf({ fans: 100 }), 200000);                               // 인기 100 → 광고 한 편 20억
  assert.equal(adsOf({ fans: 1000 }), 2000000);                             // 인기 1000 → 200억
  assert.equal(adsOf({ fans: 50 }), 100000);
});

test('fans have no cap, but the higher they are the harder they climb', () => {
  assert.equal(addFans(50, 10), 60);                                        // 100까지는 그대로
  assert.equal(addFans(90, 4), 94);
  const at100 = addFans(100, 10) - 100, at500 = addFans(500, 10) - 500, at1000 = addFans(1000, 10) - 1000;
  assert.ok(at100 < 10 && at100 > 9, `100: +${at100}`);
  assert.ok(Math.abs(at500 - 2) < 0.05, `500: +${at500}`);                  // 1/5
  assert.ok(Math.abs(at1000 - 1) < 0.02, `1000: +${at1000}`);               // 1/10
  assert.ok(addFans(990, 200) > 1000);                                      // 상한 없음
  assert.equal(addFans(500, -20), 480);                                     // 내려가는 건 그대로
  assert.equal(addFans(5, -20), 0);
  // 가게·이벤트·시즌 끝 어디로 올라도 100에서 멈추지 않는다
  let s = { ...newSlot('samsung-b06'), assets: 1e9, fans: 99 };
  s = buyItem(s, 'naming');
  assert.ok(fansOf(s) > 100, `naming → ${fansOf(s)}`);
  const ev = pickEvent({ ...s, event: 'tv' }, 0);
  assert.ok(ev.slot.fans > fansOf(s) && ev.slot.fans < fansOf(s) + 5);       // 100을 넘었으니 +5보다 덜 오른다
  // CF 한 편 = 광고 한 편
  const cf = pickEvent({ ...s, assets: 0, event: 'cf' }, 0);
  assert.equal(cf.slot.assets, adsOf(s));
});

test('playing worn out can injure you; injured players sit, rehab and come back', () => {
  let hurtSeen = null;
  const rng = createRng(9);
  let s = newSlot('samsung-b06');
  for (let k = 0; k < 60 && !hurtSeen; k++) {
    s = { ...s, fatigue: 100, injury: null };
    const r = applyDay(s, null, rng);
    if (r.report.hurt) hurtSeen = r;
    s = r.slot;
    if (s.season.phase !== 'regular') break;
  }
  assert.ok(hurtSeen, 'should get hurt at fatigue 100 within 60 games');
  s = hurtSeen.slot;
  assert.ok(s.injury.left >= LIFE.injury.minor[0]);
  assert.equal(canChoose(s, 'power').ok, false); assert.equal(canChoose(s, 'rest').ok, true);
  assert.equal(dayInfo(s).resting, true); assert.equal(dayInfo(s).needsScreen, false);
  const r = choose({ ...s, assets: 5000 }, 'rehab');
  assert.equal(r.slot.assets, 5000 - LIFE.rehabCost);
  assert.equal(r.slot.injury.left, Math.max(1, s.injury.left - 1));
  assert.equal(canChoose({ ...s, assets: 0 }, 'rehab').ok, false);
  let left = s.injury.left, days = 0;
  while (s.injury && days < 20) { s = applyDay(s, null, rng).slot; days++; }
  assert.equal(days, left); assert.equal(s.injury, null);
  // 피로가 낮으면 안 다친다, 영양사가 있으면 덜 다친다
  assert.equal(rollInjury({ ...s, fatigue: 50 }), null);
});

test('random events show up some days and their choices change the slot', () => {
  const rng = createRng(3);
  let s = newSlot('samsung-b06'), seen = 0, days = 0;
  while (s.season.phase === 'regular') { s = applyDay({ ...s, event: null }, null, rng).slot; days++; if (s.event) seen++; }
  assert.ok(seen > days * 0.1 && seen < days * 0.6, `events ${seen}/${days}`);
  const base = { ...newSlot('samsung-b06'), assets: 20000, condition: 0, fatigue: 50 };
  const tv = pickEvent({ ...base, event: 'tv' }, 0);
  assert.equal(tv.slot.fans, fansOf(base) + 5); assert.equal(tv.slot.fatigue, 55); assert.equal(tv.slot.event, null);
  const coach = pickEvent({ ...base, event: 'coachTip' }, 0);
  assert.notDeepEqual(coach.slot.growth, base.growth);
  const coin = pickEvent({ ...base, event: 'coin' }, 0);
  assert.ok([10000, 40000].includes(coin.slot.assets), `coin ${coin.slot.assets}`);
  assert.equal(pickEvent({ ...base, assets: 100, event: 'stiff' }, 0), null);   // 돈이 모자라면 못 고른다
  for (const e of EVENTS) assert.ok(e.opts.length >= 1 && eventOf(e.id) === e);
});

// 리그: 다른 타자 8명(규정 채움), 나는 그보다 잘 쳤다
function leagueSlot(myLine, others) {
  const s = newSlot('samsung-b06'), games = s.season.schedule.length;
  const bat = {};
  others.forEach((l, k) => { bat[`kia-b0${k + 1}`] = l; });
  bat['samsung-b06'] = myLine;
  return { ...s, stats: { bat: myLine }, league: { bat, pit: {} }, season: { ...s.season, round: games, phase: 'done', champion: null } };
}
const line = (pa, ab, h, hr, bb, rbi) => ({ pa, ab, h, d2: 0, d3: 0, hr, bb, so: 10, rbi });

test('awards: the league leader takes the titles, a prize, a salary premium and fans', () => {
  const others = Array.from({ length: 8 }, (_, k) => line(110, 100, 25 + k, 3 + k, 10, 15 + k));
  const best = leagueSlot(line(115, 100, 45, 15, 15, 40), others);
  const ids = awardsOf(best).map(a => a.id);
  for (const id of ['mvp', 'avg', 'hr', 'rbi']) assert.ok(ids.includes(id), `${id} in ${ids}`);
  const meh = leagueSlot(line(115, 100, 20, 1, 5, 5), others);
  assert.deepEqual(awardsOf(meh), []);
  const c = contract(best), c0 = contract(meh);
  assert.equal(c.prize, awardsOf(best).reduce((a, x) => a + x.prize, 0));
  assert.ok(c.prize >= AWARDS.mvp.prize);
  const n = nextSeason(best), h = n.history[n.history.length - 1];
  assert.deepEqual(h.awards, ids);
  assert.ok(n.fans > fansOf(best));
  assert.equal(c0.prize, 0);
  // 정규시즌 중에는 상이 없다
  assert.deepEqual(awardsOf({ ...best, season: { ...best.season, phase: 'regular' } }), []);
  assert.ok(PAY.raiseMax);
});

test('a league MVP on the minimum salary jumps straight to the market rate, past the 3x limit', () => {
  const others = Array.from({ length: 8 }, (_, k) => line(110, 100, 25 + k, 3 + k, 10, 15 + k));
  const rookie = { ...leagueSlot(line(115, 100, 45, 15, 15, 40), others), salary: PAY.min };
  const c = contract(rookie);
  assert.ok(c.awards.some(a => a.id === 'mvp'));
  assert.ok(c.to >= 200000, `mvp rookie ${c.to}`);                       // OPS 1.4대 MVP: 20억 이상
  // 잘했지만 리그 1등이 아니면 3배 한도 그대로
  const second = { ...leagueSlot(line(115, 100, 40, 10, 15, 30), [...others, line(115, 100, 50, 20, 15, 50)]), salary: PAY.min };
  const c2 = contract(second);
  assert.ok(!c2.awards.some(a => a.id === 'mvp'));
  assert.ok(c2.to <= PAY.min * PAY.raiseMax * 1.5, `second ${c2.to}`);
  // 이미 많이 받는 MVP는 깎이지 않는다
  const star = contract({ ...rookie, salary: 400000 });
  assert.ok(star.to >= 400000);
});

test('salary never goes past 300억, whatever the season', () => {
  const others = Array.from({ length: 8 }, (_, k) => line(110, 100, 25 + k, 3 + k, 10, 15 + k));
  const mvp = { ...leagueSlot(line(115, 100, 45, 15, 15, 40), others), season: { ...leagueSlot(line(115, 100, 45, 15, 15, 40), others).season, champion: 'samsung' } };
  for (const salary of [PAY.max / 3, PAY.max * 0.9, PAY.max, PAY.max * 5]) {
    const c = contract({ ...mvp, salary });
    assert.ok(c.to <= PAY.max, `${salary} → ${c.to}`);
  }
  assert.equal(contract({ ...mvp, salary: PAY.max * 0.9 }).to, PAY.max);           // 미친 시즌이면 딱 300억에서 멈춘다
  assert.equal(salaryNow({ ...mvp, salary: PAY.max * 5 }), PAY.max);              // 옛 저장에 300억 넘는 연봉이 있어도 300억으로
  assert.equal(PAY.max, 3000000);
  // 300억 넘는 옛 저장도 시즌 동안 받는 돈은 300억
  let s = { ...newSlot('samsung-b06'), salary: PAY.max * 5 };
  const a0 = s.assets || 0, rng = createRng(4);
  while (s.season.phase === 'regular') s = applyDay(s, null, rng).slot;
  assert.ok((s.assets || 0) - a0 <= PAY.max + 1, `paid ${s.assets - a0}`);
});
