// 육성모드 생활: 쇼핑·인기·부상·랜덤 이벤트(core/raiselife.js), 시즌 시상식(core/raiseawards.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, slotPlayer, canChoose, choose, applyDay, dayInfo, nextSeason, pickEvent, seasonGains, RAISE } from '../js/core/raise.js';
import { LIFE, SHOP, buyItem, canBuy, has, trainMult, fansOf, adsOf, rollInjury, EVENTS, eventOf } from '../js/core/raiselife.js';
import { awardsOf, AWARDS } from '../js/core/raiseawards.js';
import { contract, PAY } from '../js/core/raisepay.js';
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

test('fans start from the salary and pay ads at the season end', () => {
  assert.equal(fansOf(newSlot('samsung-b03')), LIFE.fans.max);              // 구자욱 20억
  assert.equal(fansOf(newSlot('samsung-b11')), LIFE.fans.min + 1);
  assert.equal(adsOf({ fans: 50 }), 7500);
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
