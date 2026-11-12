// 육성모드 경기 진행: 내 장면까지 넘기기, 대타·강판·마무리 등판, 승·패·세이브 (core/raisematch.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, matchup, simulateUntil } from '../js/core/match.js';
import { fatigue } from '../js/core/pitch.js';
import { battingSide } from '../js/core/rules.js';
import { defaultLineup } from '../js/core/team.js';
import { getTeam } from '../js/data/rosters.js';
import { createRng } from '../js/core/rng.js';
import { raiseStep, decisions, gameLine } from '../js/core/raisematch.js';

const S = getTeam('samsung'), B = 'samsung-b03', SP = 'samsung-p01', CL = 'samsung-p05';
const mk = (seed, starterId = S.pitchers[0].id) => {
  const rng = createRng(seed);
  return { rng, m: createMatch({ userTeam: S, cpuTeam: getTeam('kt'), userLineup: { ...defaultLineup(S), starterId }, innings: 9, rng, cpuStarterId: 'kt-p01' }) };
};
// 내 장면 한 타석은 컴퓨터가 대신 친다/던진다
const playMyPA = (m, rng) => simulateUntil(m, rng, x => x.log.length > m.log.length);

// 한 경기를 raiseStep으로 끝까지. onMe(match)는 내 장면마다
function runGame(seed, raise, starterId, onMe = () => {}) {
  let { m, rng } = mk(seed, starterId), r, me = 0;
  for (let i = 0; i < 300; i++) {
    r = raiseStep(m, raise, rng);
    if (r.phase === 'done') return { r, me, m: r.match };
    me++; onMe(r.match);
    m = playMyPA(r.match, rng);
  }
  throw new Error('경기가 안 끝남');
}

test('batter: raiseStep stops only at my at-bats and never at the top half', () => {
  const raise = { kind: 'bat', role: null, playerId: B, cond: 0 };
  for (let seed = 1; seed <= 20; seed++) {
    const { r, me, m } = runGame(seed, raise, undefined, x => {
      assert.equal(battingSide(x.game), 'home');
      assert.equal(matchup(x).batter.id, B);
      assert.equal(x.game.balls + x.game.strikes, 0);
    });
    assert.ok(m.game.over); assert.equal(r.note, 'end');
    assert.ok(me >= 3, `seed ${seed}: ${me} PA`);
    assert.equal(m.log.filter(e => e.batterId === B).length, me);
  }
});

test('pinch hitter after 7th when cold and hitless with 2 K; I never bat again', () => {
  const { m: m0, rng } = mk(5);
  const idx = m0.lineups.home.order.indexOf(B);
  const ks = [1, 4].map(inning => ({ batterId: B, pitcherId: 'kt-p01', event: 'STRIKEOUT', runs: 0, outs: 1, inning, half: 'bottom', bases: [false, false, false], score: { home: 0, away: 0 }, pitches: [] }));
  const m = { ...m0, log: ks, game: { ...m0.game, inning: 7, half: 'bottom', battingIndex: { ...m0.game.battingIndex, home: idx } } };
  const r = raiseStep(m, { kind: 'bat', role: null, playerId: B, cond: -1 }, rng);
  assert.equal(r.phase, 'done'); assert.equal(r.note, 'pinch'); assert.ok(r.match.game.over);
  assert.equal(r.match.log.filter(e => e.batterId === B).length, 2);
  assert.ok(!r.match.lineups.home.order.includes(B));
  // 컨디션이 보통이면 바뀌지 않는다
  const k = raiseStep(m, { kind: 'bat', role: null, playerId: B, cond: 0 }, rng);
  assert.equal(k.phase, 'me');
  // 6회면 아직 아니다
  const six = raiseStep({ ...m, game: { ...m.game, inning: 6 } }, { kind: 'bat', role: null, playerId: B, cond: -2 }, rng);
  assert.equal(six.phase, 'me');
});

test('starter is pulled at fatigue 0.6 and never returns', () => {
  const raise = { kind: 'pitch', role: 'SP', playerId: SP, cond: 0 };
  let pulled = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const { r, m } = runGame(seed, raise, SP, x => {
      assert.equal(x.game.half, 'top'); assert.equal(x.pitcher.home, SP);
      assert.ok(fatigue(x.pitchCount.home, matchup(x).pitcher.stamina) < 0.6);
    });
    const mine = m.log.map((e, i) => (e.pitcherId === SP ? i : -1)).filter(i => i >= 0);
    assert.equal(mine[0], 0, `seed ${seed}: I start the game`);
    // 내 기록은 처음부터 이어지고(초 공격만), 내려간 뒤 다시 나오지 않는다
    const tops = m.log.map((e, i) => (e.half === 'top' ? i : -1)).filter(i => i >= 0);
    const myTops = tops.slice(0, mine.length);
    assert.deepEqual(mine, myTops, `seed ${seed}`);
    if (r.note === 'pulled') pulled++;
  }
  assert.ok(pulled > 0, 'some starts end with the starter pulled');
});

test('starter who gave up 5+ runs in an inning is pulled after it', () => {
  const { m: m0, rng } = mk(3, SP);
  const log = [0, 1, 2, 3, 4].map(i => ({ batterId: 'kt-b01', pitcherId: SP, event: 'HR', runs: 1, outs: 0, inning: 2, half: 'top', bases: [false, false, false], score: { home: 0, away: i + 1 }, pitches: [] }));
  const m = { ...m0, log, game: { ...m0.game, inning: 3, half: 'top', score: { home: 0, away: 5 } } };
  const r = raiseStep(m, { kind: 'pitch', role: 'SP', playerId: SP, cond: 0 }, rng);
  assert.equal(r.phase, 'done'); assert.equal(r.note, 'pulled');
  assert.equal(r.match.log.filter(e => e.pitcherId === SP).length, 5);
});

test('closer is not used before the 9th and enters only within 3 runs', () => {
  const raise = { kind: 'pitch', role: 'CL', playerId: CL, cond: 0 };
  let shows = 0, noshows = 0;
  for (let seed = 1; seed <= 25; seed++) {
    let first = true;
    const { r, m } = runGame(seed, raise, undefined, x => {
      assert.equal(x.pitcher.home, CL); assert.equal(x.game.half, 'top');
      assert.ok(x.game.inning === 9 || x.game.inning === 10, `inning ${x.game.inning}`);
      if (first) { assert.ok(Math.abs(x.game.score.home - x.game.score.away) <= 3); first = false; }
    });
    assert.ok(m.log.every(e => e.pitcherId !== CL || e.inning >= 9), `seed ${seed}`);
    if (r.note === 'noshow') { noshows++; assert.ok(!m.log.some(e => e.pitcherId === CL)); }
    else shows++;
  }
  assert.ok(shows > 0 && noshows > 0, `shows ${shows} noshows ${noshows}`);
});

const e = (pitcherId, half, inning, home, away, outs = 1, ev = 'OUT') => ({ batterId: 'x', pitcherId, event: ev, runs: 0, outs, inning, half, score: { home, away } });
test('decisions: win, loss, save', () => {
  // 선발 6이닝(18아웃) 3-1 리드로 내려가고 그대로 이김 → 승
  const win = [...Array(18)].map((_, i) => e(SP, 'top', Math.floor(i / 3) + 1, 3, 1)).concat([e('samsung-p06', 'top', 7, 3, 1), e('samsung-p06', 'top', 9, 4, 2)]);
  assert.deepEqual(decisions(win, SP, 'SP', 'home'), { w: 1, l: 0, sv: 0 });
  // 14아웃이면 승 아님
  assert.deepEqual(decisions(win.slice(4), SP, 'SP', 'home'), { w: 0, l: 0, sv: 0 });
  // 뒤진 채 내려가고 그대로 짐 → 패
  const loss = [e(SP, 'top', 1, 0, 2), e('samsung-p06', 'top', 6, 1, 3)];
  assert.deepEqual(decisions(loss, SP, 'SP', 'away'), { w: 0, l: 1, sv: 0 });
  // 뒤졌다가 동점이 되면 패 아님
  assert.deepEqual(decisions([e(SP, 'top', 1, 0, 2), e('samsung-p06', 'top', 6, 2, 2), e('samsung-p06', 'top', 9, 2, 3)], SP, 'SP', 'away'), { w: 0, l: 0, sv: 0 });
  // 마무리: 2점 리드로 등판해 끝까지 → 세이브
  const save = [e('samsung-p01', 'top', 8, 4, 2), e(CL, 'top', 9, 4, 2), e(CL, 'top', 9, 4, 3), e(CL, 'top', 9, 4, 3)];
  assert.deepEqual(decisions(save, CL, 'CL', 'home'), { w: 0, l: 0, sv: 1 });
  // 4점 리드면 세이브 아님
  assert.deepEqual(decisions([e('samsung-p01', 'top', 8, 6, 2), e(CL, 'top', 9, 6, 2)], CL, 'CL', 'home'), { w: 0, l: 0, sv: 0 });
  // 등판 없음
  assert.deepEqual(decisions(win, CL, 'CL', 'home'), { w: 0, l: 0, sv: 0 });
});

test('gameLine picks my own line only', () => {
  const log = [
    { batterId: B, pitcherId: 'kt-p01', event: 'HR', runs: 1 }, { batterId: B, pitcherId: 'kt-p01', event: 'STRIKEOUT', runs: 0 },
    { batterId: 'samsung-b01', pitcherId: 'kt-p01', event: 'SINGLE', runs: 0 },
  ];
  const l = gameLine(log, B);
  assert.equal(l.bat.ab, 2); assert.equal(l.bat.hr, 1); assert.equal(l.bat.rbi, 1); assert.equal(l.pit, null);
  assert.deepEqual(gameLine(log, SP), { bat: null, pit: null });
});
