// 육성모드 연봉·자산: 시즌 성적에 따라 다음 해 연봉이 오르내리고, 한 해가 끝나면 그 해 연봉만큼 자산이 쌓인다 (core/raisepay.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, nextSeason } from '../js/core/raise.js';
import { PAY, startSalary, contract, won } from '../js/core/raisepay.js';

const bat = (pa, ab, h, hr, bb, d2 = 0) => ({ pa, ab, h, d2, d3: 0, hr, bb, so: 20, rbi: 30 });
const done = (slot, stats, champion = null) => ({ ...slot, stats, season: { ...slot.season, round: slot.season.schedule.length, phase: 'done', champion } });

test('every Samsung player starts from a salary table; new slots start with no assets', () => {
  assert.equal(startSalary('samsung-b03'), 200000);          // 구자욱 20억
  assert.equal(startSalary('samsung-p01'), 100000);          // 원태인 10억
  for (const id of ['samsung-b01', 'samsung-b12', 'samsung-p09']) assert.ok(startSalary(id) >= PAY.min);
  const s = newSlot('samsung-b06');
  assert.equal(s.salary, startSalary('samsung-b06')); assert.equal(s.assets, 0);
});

test('money reads the Korean way', () => {
  assert.equal(won(200000), '20억원');
  assert.equal(won(23000), '2억 3000만원');
  assert.equal(won(9000), '9000만원');
  assert.equal(won(-4500), '-4500만원');
});

test('a great season raises the salary, a bad one cuts it, within the limits', () => {
  const s = { ...newSlot('samsung-b06'), salary: 22000 };     // 김영웅 2억 2000만원, 27경기 시즌
  const great = contract(done(s, { bat: bat(115, 100, 36, 9, 15, 8) }));   // OPS 1.1+ 수준
  const poor = contract(done(s, { bat: bat(115, 105, 20, 1, 6) }));        // OPS .4 수준
  assert.ok(great.to > s.salary, `great ${great.to}`);
  assert.ok(great.to <= s.salary * PAY.raiseMax);
  assert.ok(poor.to < s.salary);
  assert.ok(poor.to >= Math.round(s.salary * (1 - PAY.cutMax)));
  assert.ok(great.pct > 0 && poor.pct < 0);
  // 거의 못 뛰었으면(타석 부족) 잘 쳐도 크게 오르지 않는다
  const few = contract(done(s, { bat: bat(12, 10, 5, 2, 2) }));
  assert.ok(few.to < great.to);
  assert.ok(contract(done({ ...s, salary: 3000 }, { bat: bat(5, 5, 0, 0, 0) })).to >= PAY.min);
});

test('pitchers are paid for ERA and innings (starters) or ERA and saves (closers)', () => {
  const sp = { ...newSlot('samsung-p01'), salary: 100000 };
  const ace = contract(done(sp, { pit: { bf: 600, outs: 480, h: 120, hr: 8, bb: 30, so: 150, r: 40 }, w: 8, l: 2 }));   // 160이닝 ERA 2.25
  const bad = contract(done(sp, { pit: { bf: 300, outs: 180, h: 90, hr: 12, bb: 30, so: 40, r: 60 }, w: 1, l: 6 }));    // 60이닝 ERA 9
  assert.ok(ace.to >= sp.salary, `ace ${ace.to}`); assert.ok(bad.to < sp.salary);
  const cl = { ...newSlot('samsung-p05'), salary: 30000 };
  const many = contract(done(cl, { pit: { bf: 120, outs: 90, h: 20, hr: 2, bb: 8, so: 35, r: 8 }, sv: 14 }));
  const none = contract(done(cl, { pit: { bf: 120, outs: 90, h: 20, hr: 2, bb: 8, so: 35, r: 8 }, sv: 0 }));
  assert.ok(many.to > none.to);
});

test('winning the Korean Series pays a bonus and a premium on the next salary', () => {
  const s = { ...newSlot('samsung-b06'), salary: 22000 };
  const st = { bat: bat(115, 100, 30, 6, 12, 6) };
  const plain = contract(done(s, st)), champ = contract(done(s, st, 'samsung'));
  assert.equal(plain.bonus, 0); assert.equal(champ.bonus, PAY.champBonus);
  assert.ok(champ.to >= plain.to);
});

test('when the year ends the salary goes into assets and the new salary applies', () => {
  const s = done({ ...newSlot('samsung-b06'), salary: 22000, assets: 5000 }, { bat: bat(115, 100, 30, 6, 12, 6) }, 'samsung');
  const c = contract(s);
  const n = nextSeason(s);
  assert.equal(n.assets, 5000 + 22000 + PAY.champBonus);
  assert.equal(n.salary, c.to);
  const h = n.history[n.history.length - 1];
  assert.equal(h.salary, 22000); assert.equal(h.nextSalary, c.to); assert.equal(h.bonus, PAY.champBonus);
  // 예전 저장(연봉·자산 없음)도 표에서 시작한다
  const old = done(newSlot('samsung-b06'), {}); delete old.salary; delete old.assets;
  const o = nextSeason(old);
  assert.equal(o.assets, startSalary('samsung-b06'));
});
