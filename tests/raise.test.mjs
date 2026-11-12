// 육성모드: 슬롯·훈련·휴식·피로·저장 (core/raise.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTeam } from '../js/data/rosters.js';
import { createRng } from '../js/core/rng.js';
import { newSlot, loadRaise, saveRaise, slotPlayer, raiseTeam, raiseLineup, xpPerTraining, canChoose, choose, DRILLS, RAISE,
  dayInfo, starterFor, matchSetup, applyDay, seasonOver, nextSeason, seasonGains } from '../js/core/raise.js';

const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};
const fresh = s => ({ ...s, chosen: false });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

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

test('training XP follows the practice score: a better session grows more', () => {
  const s = { ...newSlot('samsung-b03'), fatigue: 0 };
  const xp = r => r.slot.growth.xp['samsung-b03'].power + 12 * ((r.slot.growth.delta['samsung-b03'] || {}).power || 0);
  const low = xp(choose(s, 'power', 2)), mid = xp(choose(s, 'power', RAISE.practiceRef.bat)), high = xp(choose(s, 'power', 25));
  assert.ok(low < mid && mid < high, `${low} ${mid} ${high}`);
  near(mid, xpPerTraining('power', 72));
  near(high, xpPerTraining('power', 72) * RAISE.practiceMax);
  near(low, xpPerTraining('power', 72) * RAISE.practiceMin);
  // 투수 연습은 기준 점수가 다르다
  const p = { ...newSlot('samsung-p01'), fatigue: 0 };
  const px = choose(p, 'control', RAISE.practiceRef.pitch).slot.growth.xp['samsung-p01'].control;
  near(px, xpPerTraining('control', 82));
  // 특훈도 연습 점수를 따르고, 진행도는 한 번으로 센다
  const d = choose(s, 'drillRisp', 1);
  assert.equal(d.slot.progress.train.drillRisp, 1);
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

// ── 하루·경기 반영·시즌 (Task 4) ──
const pa = (batterId, pitcherId, event, extra = {}) => ({ batterId, pitcherId, event, runs: 0, outs: ['OUT', 'STRIKEOUT'].includes(event) ? 1 : 0,
  inning: 1, half: 'bottom', bases: [false, false, false], score: { home: 0, away: 0 }, pitches: [{ k: 'FB', v: 140, e: event }], ...extra });
const gameOf = (log, home = 3, away = 1) => ({ home, away, log, starterId: 'samsung-p01' });

test('starter pitches every 4th game; dayInfo restarts each season', () => {
  let s = newSlot('samsung-p01'); const rng = createRng(7), starts = [];
  for (let i = 0; i < 27; i++) {
    const d = dayInfo(s);
    assert.equal(d.round, i); assert.equal(d.total, 27); assert.ok(d.opponentId && d.opponentId !== 'samsung');
    if (d.myStart) { starts.push(i); assert.equal(starterFor(s), 'samsung-p01'); assert.equal(d.needsScreen, true); }
    else { assert.notEqual(starterFor(s), 'samsung-p01'); assert.equal(d.needsScreen, false); }
    s = applyDay(s, null, rng).slot;
  }
  assert.deepEqual(starts, [0, 4, 8, 12, 16, 20, 24]);
  assert.ok(seasonOver(s));
  const n = nextSeason(s);
  assert.equal(dayInfo(n).round, 0); assert.equal(dayInfo(n).myStart, true);
  assert.equal(dayInfo(newSlot('samsung-b03')).needsScreen, true);
  assert.equal(dayInfo(newSlot('samsung-p05')).needsScreen, true);
});

test('matchSetup hands the game screen my team, lineup, perks and raise info', () => {
  const s = { ...newSlot('samsung-b10'), condition: 1, traits: ['clutch'] };
  const g = matchSetup(s);
  assert.equal(g.userTeam.id, 'samsung'); assert.equal(g.cpuTeam.id, dayInfo(s).opponentId);
  assert.ok(g.lineup.order.includes('samsung-b10')); assert.ok(g.cpuStarterId.startsWith(g.cpuTeam.id));
  assert.deepEqual(g.perks, { id: 'samsung-b10', cond: 1, traits: ['clutch'] });
  assert.deepEqual(g.raise, { kind: 'bat', role: null, playerId: 'samsung-b10', cond: 1 });
  assert.equal(matchSetup(newSlot('samsung-p01')).lineup.starterId, 'samsung-p01');
});

test('applyDay records the game, my line, standings; null result simulates', () => {
  let s = newSlot('samsung-b03'); const rng = createRng(3);
  let last;
  for (let i = 0; i < 27; i++) { last = applyDay(s, null, rng); s = last.slot; }
  assert.ok(seasonOver(s)); assert.equal(last.report.seasonOver, true);
  const me = last.report.team; assert.equal(me.w + me.l + me.d, 27); assert.ok(me.rank >= 1 && me.rank <= 10);
  assert.ok(s.stats.bat.pa > 50, `pa ${s.stats.bat.pa}`); assert.deepEqual(s.total.bat, s.stats.bat);
});

test('applyDay with a played game uses its log and score', () => {
  const s = newSlot('samsung-b03'), B = 'samsung-b03';
  const r = applyDay(s, gameOf([pa(B, 'lg-p01', 'HR', { runs: 1 }), pa(B, 'lg-p01', 'SINGLE'), pa('samsung-b01', 'lg-p01', 'OUT')], 5, 2), createRng(1));
  assert.equal(r.report.line.bat.hr, 1); assert.equal(r.report.line.bat.h, 2);
  assert.equal(r.slot.stats.bat.hr, 1); assert.equal(r.slot.season.round, 1);
  assert.equal(r.report.team.w, 1); assert.equal(r.report.appeared, true);
  assert.ok(Array.isArray(r.report.ups));
});

test('condition moves with performance and fatigue, clamped -2..2', () => {
  const B = 'samsung-b03', rng = createRng(2), s = newSlot('samsung-b03');
  const good = gameOf([pa(B, 'lg-p01', 'HR', { runs: 1 }), pa(B, 'lg-p01', 'SINGLE')]);
  const bad = gameOf([pa(B, 'lg-p01', 'STRIKEOUT'), pa(B, 'lg-p01', 'STRIKEOUT'), pa(B, 'lg-p01', 'STRIKEOUT')]);
  const meh = gameOf([pa(B, 'lg-p01', 'SINGLE'), pa(B, 'lg-p01', 'OUT'), pa(B, 'lg-p01', 'OUT')]);
  assert.equal(applyDay(s, good, rng).slot.condition, 1);
  assert.equal(applyDay({ ...s, condition: 2 }, good, rng).slot.condition, 2);
  assert.equal(applyDay(s, bad, rng).slot.condition, -1);
  assert.equal(applyDay({ ...s, condition: -2 }, bad, rng).slot.condition, -2);
  assert.equal(applyDay(s, meh, rng).slot.condition, 0);
  assert.equal(applyDay({ ...s, fatigue: 75 }, meh, rng).slot.condition, -1);
  // 피로: 고르지 않은 날 -10, 타자 출전 +5
  assert.equal(applyDay({ ...s, fatigue: 50 }, meh, rng).slot.fatigue, 45);
  assert.equal(applyDay({ ...s, fatigue: 50, chosen: true }, meh, rng).slot.fatigue, 55);
  assert.equal(applyDay({ ...s, chosen: true }, meh, rng).slot.chosen, false);
});

test('pitcher fatigue grows with pitches; closer condition by clean innings', () => {
  const CL = 'samsung-p05', s = newSlot(CL), rng = createRng(4);
  const clean = [1, 2, 3].map(() => ({ ...pa('lg-b01', CL, 'OUT'), inning: 9, half: 'top', score: { home: 3, away: 1 }, pitches: [{}, {}, {}, {}, {}] }));
  const lead = { ...pa('samsung-b01', 'lg-p01', 'OUT'), inning: 8, half: 'bottom', score: { home: 3, away: 1 } };
  const r = applyDay({ ...s, chosen: true }, gameOf([lead, ...clean]), rng);
  assert.equal(r.slot.condition, 1); assert.equal(r.slot.fatigue, 6);
  assert.equal(r.slot.stats.sv, 1); assert.equal(r.slot.progress.feat.saves, 1);
  const blown = [lead, clean[0], { ...pa('lg-b02', CL, 'HR', { runs: 2 }), inning: 9, half: 'top', score: { home: 3, away: 3 } }];
  assert.equal(applyDay(s, gameOf(blown, 3, 4), rng).slot.condition, -1);
  // 등판이 없으면 컨디션 그대로
  assert.equal(applyDay({ ...s, condition: 1 }, gameOf([pa('samsung-b01', 'lg-p01', 'OUT')]), rng).slot.condition, 1);
});

test('game feats grant traits once (10 HR → slugger)', () => {
  const B = 'samsung-b03', rng = createRng(5);
  const s = { ...newSlot(B), progress: { train: {}, feat: { hr: 9 } } };
  const r = applyDay(s, gameOf([pa(B, 'lg-p01', 'HR', { runs: 1 })]), rng);
  assert.deepEqual(r.slot.traits, ['slugger']); assert.deepEqual(r.report.traitsNew, ['slugger']);
  const r2 = applyDay(r.slot, gameOf([pa(B, 'lg-p01', 'HR', { runs: 1 })]), rng);
  assert.deepEqual(r2.slot.traits, ['slugger']); assert.deepEqual(r2.report.traitsNew, []);
  // 득점권 안타·좌투수 상대 안타도 센다
  const lhp = getTeam('lg').pitchers.find(p => p.throws === 'L').id;
  const r3 = applyDay(newSlot(B), gameOf([pa(B, lhp, 'SINGLE', { bases: [false, true, false] })]), rng);
  assert.equal(r3.slot.progress.feat.rispHits, 1); assert.equal(r3.slot.progress.feat.lhpHits, 1);
});

test('leaving mid-game keeps the choice and the day', () => {
  const s = choose(newSlot('samsung-b03'), 'power').slot;
  // 경기 화면에서 나가면 applyDay를 부르지 않는다 → 저장된 슬롯은 그대로
  assert.equal(s.chosen, true); assert.equal(s.season.round, 0);
  assert.equal(canChoose(s, 'rest').reason, 'done');
  assert.equal(matchSetup(s).raise.playerId, 'samsung-b03');
});

test('season stat gains and the next start are reported (review fix)', () => {
  let s = newSlot('samsung-b03');
  assert.deepEqual(seasonGains(s), []);
  for (let i = 0; i < 3; i++) s = choose({ ...s, chosen: false, fatigue: 0 }, 'power').slot;
  assert.deepEqual(seasonGains(s), [{ stat: 'power', n: slotPlayer(s).power - 72 }]);
  s = { ...s, season: { ...s.season, phase: 'post' } };
  assert.deepEqual(seasonGains(nextSeason(s)), []);
  const sp = newSlot('samsung-p01');
  const at = r => dayInfo({ ...sp, season: { ...sp.season, round: r } }).nextStartIn;
  assert.equal(at(0), 0); assert.equal(at(1), 3); assert.equal(at(21), 3); assert.equal(at(25), null); assert.equal(at(26), null);
  assert.equal(dayInfo(newSlot('samsung-b03')).nextStartIn, null);
});

test('nextSeason keeps growth/traits/total and resets the rest', () => {
  let s = newSlot('samsung-b03'); const rng = createRng(9);
  for (let i = 0; i < 27; i++) s = applyDay(s, null, rng).slot;
  s = { ...s, traits: ['clutch'], fatigue: 60, condition: -2 };
  const n = nextSeason(s);
  assert.equal(n.year, 2028); assert.equal(n.season.year, 2028); assert.equal(n.season.round, 0);
  assert.deepEqual(n.stats, {}); assert.equal(n.fatigue, 0); assert.equal(n.condition, 0);
  assert.deepEqual(n.traits, ['clutch']); assert.deepEqual(n.growth, s.growth); assert.deepEqual(n.total, s.total);
  assert.equal(n.history.length, 1);
  const h = n.history[0];
  assert.equal(h.year, 2027); assert.equal(h.w + h.l + h.d, 27); assert.deepEqual(h.line, s.stats); assert.deepEqual(h.traitsNew, ['clutch']);
  assert.deepEqual(nextSeason(nextSeason(n)).history[2].traitsNew, []);
});

test('balance: power training for 3 seasons hits clearly more HR than no training, and no stat rises more than 15 in one season', () => {
  const run = (train, seed) => {
    let s = newSlot('samsung-b03'); const rng = createRng(seed), hr = [], gain = [];
    for (let y = 0; y < 3; y++) {
      const p0 = slotPlayer(s);
      for (let i = 0; i < 27; i++) {
        if (train) s = choose(s, canChoose(s, 'power').ok ? 'power' : 'rest').slot;
        s = applyDay(s, null, rng).slot;
      }
      const p1 = slotPlayer(s);
      gain.push(Math.max(...['power', 'contact', 'eye'].map(k => p1[k] - p0[k])));
      hr.push(s.stats.bat.hr);
      s = nextSeason(s);
    }
    return { hr, gain, power: slotPlayer(s).power };
  };
  let trained = 0, plain = 0;
  for (const seed of [1, 2, 3, 4]) {
    const a = run(true, seed), b = run(false, seed);
    trained += a.hr[2]; plain += b.hr[2];
    for (const g of [...a.gain, ...b.gain]) assert.ok(g <= 15, `season gain ${g}`);
  }
  assert.ok(trained > plain * 1.3, `HR trained ${trained} vs plain ${plain}`);
});

test('prelude: a closer who does not pitch today gets the day without a game screen', async () => {
  const { prelude, applyDay: day } = await import('../js/core/raise.js');
  let noshow = 0, shows = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const slot = newSlot('samsung-p05'), rng = createRng(seed);
    const pre = prelude(slot, rng);
    if (pre.result) {
      noshow++;
      assert.equal(pre.result.raise.note, 'noshow');
      assert.ok(!pre.result.log.some(e => e.pitcherId === 'samsung-p05'));
      assert.equal(pre.result.home + pre.result.away >= 0, true);
      const out = day(slot, pre.result, rng);
      assert.equal(out.report.appeared, false);
      assert.equal(out.slot.season.round, 1);
    } else {
      shows++;
      // 화면은 내가 9회초 마운드에 오른 바로 그 순간부터
      assert.equal(pre.match.pitcher.home, 'samsung-p05');
      assert.equal(pre.match.game.inning, 9); assert.equal(pre.match.game.half, 'top');
      assert.equal(pre.match.game.balls + pre.match.game.strikes, 0);
      assert.ok(pre.set && pre.set.raise.role === 'CL');
    }
  }
  assert.ok(noshow > 0 && shows > 0, `noshow ${noshow} shows ${shows}`);
});

test('prelude: a batter always opens the screen at his first at-bat', async () => {
  const { prelude } = await import('../js/core/raise.js');
  const pre = prelude(newSlot('samsung-b03'), createRng(3));
  assert.ok(pre.match && !pre.result);
  assert.equal(pre.match.lineups.home.order[pre.match.game.battingIndex.home], 'samsung-b03');
  assert.equal(pre.match.game.half, 'bottom');
});
