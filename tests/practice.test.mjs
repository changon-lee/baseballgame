// 연습장과 투수 피로
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../js/core/rng.js';
import { newCareer, loadCareer, startSeason, applyUserGame, applyAutoGame, userTeamNow, userTeamTired } from '../js/core/career.js';
import { PRACTICE, practiceLeft, applyPractice, swingPts, controlGrade } from '../js/core/practice.js';
import { computePitch } from '../js/core/pitch.js';
import { loadNow, daysToRecover, fatigueAfterGame, applyFatigue } from '../js/core/fatigue.js';
import { getTeam } from '../js/data/rosters.js';

const sam = getTeam('samsung');
const sp = sam.pitchers.find(p => p.role === 'SP').id;
const bat = sam.batters[0].id;
// 선발이 100구를 던진 경기 기록
const gameLog = (pid, pitches = 100) => [{ batterId: 'lg-b01', pitcherId: pid, event: 'OUT', runs: 0, outs: 1, pitches: Array.from({ length: pitches }, () => ({ k: 'FB', v: 150, e: 'BALL' })) }];

test('a starter who threw a lot is tired next game, 2/3 then 1/3, and fully rested after 3 days', () => {
  let c = startSeason(newCareer(), { cycles: 1, innings: 3 });
  c = applyUserGame(c, { home: 3, away: 1, starterId: sp, log: gameLog(sp) }, createRng(1)).career;
  assert.equal(c.day, 1);
  assert.ok(Math.abs(loadNow(c, sp) - 2 / 3) < 1e-9, '다음 경기: 아직 지침');
  assert.equal(daysToRecover(loadNow(c, sp)), 2);
  const base = { ...newCareer(), day: 1, fatigue: { [sp]: { load: 1, day: 0 } } };
  assert.ok(Math.abs(loadNow(base, sp) - 2 / 3) < 1e-9);
  assert.ok(Math.abs(loadNow({ ...base, day: 2 }, sp) - 1 / 3) < 1e-9);
  assert.equal(loadNow({ ...base, day: 3 }, sp), 0);
  assert.equal(loadNow({ ...base, day: 9 }, sp), 0);
});

test('tired pitcher plays with less stamina/control/velo; rested one is unchanged', () => {
  const c = { ...newCareer(), day: 1, fatigue: { [sp]: { load: 1, day: 0 } } };   // 이틀째 = 2/3
  const before = sam.pitchers.find(p => p.id === sp), team = applyFatigue(sam, c), after = team.pitchers.find(p => p.id === sp);
  assert.ok(after.stamina < before.stamina && after.control < before.control && after.velo <= before.velo);
  assert.equal(after.stamina, Math.round(before.stamina * (1 - 0.4 * 2 / 3)));
  const other = sam.pitchers.find(p => p.id !== sp);
  assert.deepEqual(team.pitchers.find(p => p.id === other.id), other);
  assert.equal(userTeamTired(c).pitchers.find(p => p.id === sp).stamina, after.stamina);
});

test('a short relief outing tires less than a starter; only my team is counted', () => {
  const rp = sam.pitchers.find(p => p.role === 'RP').id;
  const log = [...gameLog(sp, 100), ...gameLog(rp, 12), ...gameLog('lg-p01', 100)];
  const f = fatigueAfterGame(newCareer(), log, 'samsung');
  assert.equal(f[sp].load, 1);
  assert.ok(f[rp].load < 0.3 && f[rp].load >= 0.15);
  assert.equal(f['lg-p01'], undefined);
});

test('practice: points become xp for the chosen stat, +1 at 12 xp; limited per day', () => {
  let c = newCareer();
  assert.equal(practiceLeft(c), PRACTICE.perDay);
  const before = userTeamNow(c).pitchers.find(p => p.id === sp).control;
  let r = applyPractice(c, { kind: 'pitch', playerId: sp, stat: 'control', pts: 7.5 });   // 투구 7.5점 = 5xp
  assert.equal(r.xp, 5); assert.equal(r.ups.length, 0);
  r = applyPractice(r.career, { kind: 'pitch', playerId: sp, stat: 'control', pts: 12 });   // 8xp → 총 13xp → +1
  assert.equal(r.ups[0].stat, 'control'); assert.equal(r.ups[0].n, 1);
  assert.equal(userTeamNow(r.career).pitchers.find(p => p.id === sp).control, before + 1);
  assert.equal(practiceLeft(r.career), 0);
  const blocked = applyPractice(r.career, { kind: 'pitch', playerId: sp, stat: 'control', pts: 60 });
  assert.equal(blocked.xp, 0); assert.equal(blocked.career, r.career);
});

test('a played game day refills the practice count', () => {
  let c = startSeason(newCareer(), { cycles: 1, innings: 3 });
  c = applyPractice(applyPractice(c, { kind: 'bat', playerId: bat, stat: 'power', pts: 20 }).career, { kind: 'bat', playerId: bat, stat: 'power', pts: 20 }).career;
  assert.equal(practiceLeft(c), 0);
  c = applyAutoGame(c, createRng(2), {}).career;
  assert.equal(practiceLeft(c), PRACTICE.perDay);
});

test('practice rejects a stat that does not fit the kind', () => {
  const r = applyPractice(newCareer(), { kind: 'bat', playerId: bat, stat: 'velo', pts: 30 });
  assert.equal(r.xp, 0);
});

test('better swings are worth more practice points', () => {
  assert.ok(swingPts({ kind: 'INPLAY', quality: 0.9 }) > swingPts({ kind: 'INPLAY', quality: 0.3 }));
  assert.ok(swingPts({ kind: 'INPLAY', quality: 0.3 }) > swingPts({ kind: 'MISS' }));
});

test('pitching practice grades only how close the ball came to the target', () => {
  const at = (x, y) => controlGrade({ plate: { x, y } }, { x: 0.5, y: -0.5 });
  const best = at(0.5, -0.5), good = at(0.5 + 0.3, -0.5), poor = at(0.5, -0.5 + 0.6), bad = at(-0.6, 0.7);
  assert.deepEqual([best.q, good.q, poor.q, bad.q], [3, 2, 1, 0]);
  assert.ok(best.pts > good.pts && good.pts > poor.pts && poor.pts > bad.pts);
  // 스트라이크인지 볼인지는 따지지 않는다: 존 밖을 노리고 거기 꽂으면 완벽
  assert.equal(controlGrade({ plate: { x: 1.3, y: 0 } }, { x: 1.3, y: 0 }).q, 3);
  assert.ok(best.label && bad.label);
});

test('a good pitcher with good timing scores about the reference over 5 pitches', () => {
  const rng = createRng(7), p = { control: 70, velo: 145, stamina: 90, throws: 'R' };
  let pts = 0;
  for (let i = 0; i < 500; i++) {
    const target = { x: 0.4, y: -0.3 };
    pts += controlGrade(computePitch({ pitcher: p, type: 'FB', target, gaugePos: 0.5, pitchCount: 0, rng }), target).pts;
  }
  const per5 = pts / 100;
  assert.ok(per5 > 5 && per5 < 7.5, `5구 평균 ${per5.toFixed(2)}`);
});

test('old saves without day/fatigue/practice load with defaults', () => {
  const store = { getItem: () => JSON.stringify({ v: 1, history: [], growth: { xp: {}, delta: {} } }), setItem() {} };
  const c = loadCareer(store);
  assert.equal(c.day, 0); assert.deepEqual(c.fatigue, {}); assert.equal(practiceLeft(c), PRACTICE.perDay);
});
