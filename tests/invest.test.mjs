// 육성모드 재테크(core/invest.js)와 성적 배수 연봉, 경기마다 나눠 받는 연봉
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, applyDay, nextSeason } from '../js/core/raise.js';
import { contract, PAY } from '../js/core/raisepay.js';
import { PRODUCTS, buy, sell, netWorth, marketDay, tickMarket } from '../js/core/invest.js';
import { createRng } from '../js/core/rng.js';

const bat = (pa, ab, h, hr, bb, d2 = 0) => ({ pa, ab, h, d2, d3: 0, hr, bb, so: 10, rbi: 30 });
const done = (slot, stats, champion = null) => ({ ...slot, stats, season: { ...slot.season, round: slot.season.schedule.length, phase: 'done', champion } });

test('a monster season roughly doubles or triples even a big salary', () => {
  const star = { ...newSlot('samsung-b03'), salary: 200000 };            // 구자욱 20억
  const mad = contract(done(star, { bat: bat(115, 100, 60, 12, 15, 10) })); // 타율 .600
  assert.ok(mad.to >= star.salary * 2.5, `mad ${mad.to}`);
  assert.ok(mad.to <= star.salary * PAY.raiseMax);
  const good = contract(done(star, { bat: bat(115, 100, 33, 5, 12, 6) }));  // 타율 .330
  assert.ok(good.pct >= 20 && good.pct < 100, `good ${good.pct}`);
  const avg = contract(done(star, { bat: bat(115, 100, 26, 2, 10, 4) }));   // 타율 .260
  assert.ok(avg.pct < 10, `avg ${avg.pct}`);
  const sp = { ...newSlot('samsung-p01'), salary: 100000 };
  const ace = contract(done(sp, { pit: { bf: 120, outs: 90, h: 15, hr: 1, bb: 5, so: 40, r: 4 }, w: 6 }));   // ERA 1.2
  assert.ok(ace.to >= sp.salary * 2.5, `ace ${ace.to}`);
});

test('buying and selling move money between cash and products', () => {
  let s = { ...newSlot('samsung-b06'), assets: 100000 };
  s = buy(s, 'snp', 40000);
  assert.equal(s.assets, 60000); assert.equal(s.invest.snp.v, 40000); assert.equal(netWorth(s), 100000);
  s = buy(s, 'estate', 30000);                                           // 부동산은 3% 비용
  assert.equal(s.invest.estate.v, 29100); assert.equal(s.invest.estate.c, 30000);
  assert.equal(buy(s, 'btc', 999999).assets, 0);                           // 있는 현금까지만
  s = sell(s, 'snp', 10000);
  assert.equal(s.assets, 40000); assert.equal(s.invest.snp.v, 30000); assert.equal(s.invest.snp.c, 30000);
  s = sell(s, 'snp', 1e9);
  assert.equal(s.invest.snp, undefined); assert.equal(s.assets, 70000);
});

test('the market is the same for every slot, deposits are safe, and nothing goes below zero', () => {
  assert.deepEqual(marketDay(2027, 5, 27), marketDay(2027, 5, 27));
  assert.notDeepEqual(marketDay(2027, 5, 27), marketDay(2027, 6, 27));
  let dep = 1;
  for (let d = 0; d < 27; d++) { const f = marketDay(2026, d, 27); dep *= f.deposit; for (const p of PRODUCTS) assert.ok(f[p.id] > 0); }
  assert.ok(Math.abs(dep - Math.exp(0.03)) < 1e-9);
  // 여러 해를 보면 나스닥이 코인보다 덜 출렁인다
  const spread = id => { const ys = []; for (let y = 2026; y < 2066; y++) { let v = 1; for (let d = 0; d < 27; d++) v *= marketDay(y, d, 27)[id]; ys.push(Math.log(v)); } const m = ys.reduce((a, b) => a + b) / ys.length; return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length); };
  assert.ok(spread('btc') > spread('nasdaq') && spread('nasdaq') > spread('estate') && spread('estate') > 0);
  const t = tickMarket({ year: 2026, invest: { gold: { v: 1000, c: 1000 } }, mkt: {} }, 0, 27);
  assert.ok(Math.abs(t.change - (t.invest.gold.v - 1000)) < 1e-9);
  assert.equal(Object.keys(t.mkt).length, PRODUCTS.length);
});

test('the salary comes in game by game and adds up to exactly one year by the season end', () => {
  const rng = createRng(4);
  let s = { ...newSlot('samsung-b06'), salary: 22000, assets: 0 };
  s = buy({ ...s, assets: 5000 }, 'deposit', 5000);
  let days = 0, got = 0;
  while (s.season.phase === 'regular') { const r = applyDay(s, null, rng); got += r.report.money.pay; s = r.slot; days++; }
  assert.equal(days, s.season.schedule.length);
  assert.equal(got, 22000); assert.equal(s.paid, 22000);
  assert.ok(s.invest.deposit.v > 5000);
  while (s.season.phase !== 'done') s = applyDay(s, null, rng).slot;
  const cash = s.assets, n = nextSeason(s), bonus = contract(s).bonus;
  assert.equal(n.assets, cash + bonus);                                   // 이미 다 받았으니 연말엔 보너스만
  assert.equal(n.paid, 0); assert.deepEqual(n.mkt, {}); assert.ok(n.invest.deposit);
  assert.equal(n.history[n.history.length - 1].worth, Math.round(netWorth(n)));
});
