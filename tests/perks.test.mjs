// 육성모드 컨디션·특성 효과(perks): 내 선수에게만, 해당 상황에서만. perks가 없는 경기는 예전과 한 글자도 같아야 한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateGame } from '../js/core/sim.js';
import { createMatch, matchup, simulateRest, cpuMaybeChangePitcher } from '../js/core/match.js';
import { defaultLineup } from '../js/core/team.js';
import { getTeam } from '../js/data/rosters.js';
import { createRng } from '../js/core/rng.js';
import { heatBoost } from '../js/core/heat.js';
import { perkBoost, perkPitcher, boostFor, TRAITS, PERK } from '../js/core/perks.js';

const fnv = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x; };
const S = getTeam('samsung');

test('perks-free matches are byte-identical to before', () => {
  // 기대값은 perks를 넣기 전 코드로 뽑았다
  const sim = { 11: 203811049, 222: 2853468584, 3333: 3342552156 };
  for (const [seed, h] of Object.entries(sim)) {
    const r = simulateGame({ home: S, away: getTeam('lg'), innings: 9, rng: createRng(+seed) });
    assert.equal(fnv(JSON.stringify(r)), h, `sim seed ${seed}`);
  }
  const heat = { 11: 1431453171, 222: 1860550176, 3333: 1416899416 };
  for (const [seed, h] of Object.entries(heat)) {
    const rng = createRng(+seed);
    let m = createMatch({ userTeam: S, cpuTeam: getTeam('kia'), userLineup: defaultLineup(S), innings: 9, rng, heat: true });
    assert.equal('perks' in m, false);
    m = simulateRest(m, rng);
    assert.equal(fnv(JSON.stringify(m.log)), h, `heat seed ${seed}`);
  }
});

const B = 'samsung-b03', OTHER = 'samsung-b04', P = 'samsung-p01';
const mk = (perks, game = {}, extra = {}) => {
  const m = createMatch({ userTeam: S, cpuTeam: getTeam('lg'), userLineup: defaultLineup(S), innings: 9, rng: createRng(1), perks, ...extra });
  return { ...m, game: { ...m.game, ...game } };
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('TRAITS lists five batter and five pitcher traits', () => {
  assert.deepEqual(TRAITS.filter(t => t.kind === 'bat').map(t => t.id), ['clutch', 'lhpKiller', 'firstPitch', 'slugger', 'grind']);
  assert.deepEqual(TRAITS.filter(t => t.kind === 'pitch').map(t => t.id), ['escape', 'lhbKiller', 'finisher', 'ironArm', 'closer']);
  for (const t of TRAITS) assert.ok(t.name && t.desc, t.id);
});

test('perkBoost only for my batter, condition scales, traits only in their situation', () => {
  const m = mk({ id: B, cond: 2, traits: ['clutch'] });
  assert.equal(perkBoost(m, OTHER), null);
  assert.equal(perkBoost(mk(null), B), null);
  const b = perkBoost(m, B);
  near(b.reach, 1.08, 'reach'); near(b.quality, 0.03, 'quality');
  const r = perkBoost({ ...m, game: { ...m.game, bases: [false, true, false] } }, B);
  near(r.reach, 1.08 * 1.08, 'clutch reach'); near(r.quality, 0.06, 'clutch quality');
  // 보통 컨디션·특성 없음 → 효과 없음
  assert.equal(perkBoost(mk({ id: B, cond: 0, traits: [] }), B), null);
  // 초구 공략은 0-0에서만, 끈질김은 2스트라이크에서 배트만
  const f = mk({ id: B, cond: 0, traits: ['firstPitch', 'grind'] });
  near(perkBoost(f, B).reach, PERK.trait.reach, 'first pitch');
  const g = perkBoost({ ...f, game: { ...f.game, strikes: 2 } }, B);
  near(g.reach, PERK.trait.reach, 'grind reach'); near(g.quality, 0, 'grind quality');
  assert.equal(perkBoost({ ...f, game: { ...f.game, balls: 1 } }, B), null);
});

test('perkBoost: lefty killer vs a left-handed pitcher, slugger after a homer today', () => {
  const lhp = getTeam('lg').pitchers.find(p => p.throws === 'L');
  const rhp = getTeam('lg').pitchers.find(p => p.throws === 'R');
  const m0 = mk({ id: B, cond: 0, traits: ['lhpKiller', 'slugger'] }), m = { ...m0, pitcher: { ...m0.pitcher, away: rhp.id } };
  assert.equal(perkBoost({ ...m, game: { ...m.game, balls: 1 } }, B), null);
  const vsL = { ...m, game: { ...m.game, balls: 1 }, pitcher: { ...m.pitcher, away: lhp.id } };
  near(perkBoost(vsL, B).reach, PERK.trait.reach, 'lhp');
  const hr = { ...m, game: { ...m.game, balls: 1 }, log: [{ batterId: B, pitcherId: 'lg-p01', event: 'HR' }] };
  const s = perkBoost(hr, B);
  near(s.reach, 1, 'slugger reach'); near(s.quality, PERK.trait.quality, 'slugger quality');
});

test('perkPitcher adjusts only my pitcher; matchup sees it', () => {
  const lineup = { ...defaultLineup(S), starterId: P };
  const base = S.pitchers.find(p => p.id === P);
  const m = mk({ id: P, cond: -2, traits: ['escape', 'finisher'] }, {}, { userLineup: lineup });
  const other = S.pitchers.find(p => p.id !== P);
  assert.equal(perkPitcher(m, other), other);
  const q = perkPitcher(m, base);
  assert.equal(q.control, base.control - 4); assert.equal(q.velo, base.velo - 2);
  const risp = { ...m, game: { ...m.game, bases: [false, true, false] } };
  assert.equal(perkPitcher(risp, base).control, base.control - 4 + 6);
  const two = { ...m, game: { ...m.game, strikes: 2 } };
  assert.equal(perkPitcher(two, base).control, base.control - 4 + 4);
  assert.equal(perkPitcher(two, base).velo, base.velo - 2 + 2);
  // 초 공격: 삼성(홈) 투수가 던진다 → matchup도 같은 값
  assert.equal(matchup(risp).pitcher.control, base.control - 4 + 6);
  assert.equal(matchup(mk(null, {}, { userLineup: lineup })).pitcher, base);
});

test('perkPitcher: iron arm tires slower, closer is sharper from the 9th', () => {
  const lineup = { ...defaultLineup(S), starterId: P };
  const base = S.pitchers.find(p => p.id === P);
  const m = mk({ id: P, cond: 0, traits: ['ironArm', 'closer'] }, {}, { userLineup: lineup });
  near(perkPitcher(m, base).stamina, Math.min(120, base.stamina / PERK.ironArm), 'iron arm');
  assert.equal(perkPitcher(m, base).control, base.control);
  assert.equal(perkPitcher({ ...m, game: { ...m.game, inning: 9 } }, base).control, base.control + 6);
});

test('computer pitching changes honor my iron arm (review fix)', () => {
  const lineup = { ...defaultLineup(S), starterId: P };
  const at = perks => ({ ...mk(perks, {}, { userLineup: lineup }), pitchCount: { home: 100, away: 0 } });
  assert.notEqual(cpuMaybeChangePitcher(at(null), createRng(1), 'home').pitcher.home, P);
  assert.equal(cpuMaybeChangePitcher(at({ id: P, cond: 0, traits: ['ironArm'] }), createRng(1), 'home').pitcher.home, P);
});

test('perkPitcher never pushes control past 100 (review fix)', () => {
  const m = mk({ id: P, cond: 2, traits: ['escape', 'closer', 'finisher'] }, { bases: [false, true, false], inning: 9, strikes: 2 });
  const q = perkPitcher(m, { id: P, control: 95, velo: 150, stamina: 88 });
  assert.equal(q.control, 100);
});

test('boostFor caps reach at 1.25 and equals heatBoost when perks absent', () => {
  const hits = [{ batterId: B, event: 'SINGLE' }, { batterId: B, event: 'DOUBLE' }];
  const plain = { ...mk(null, {}, { heat: true }), log: hits };
  assert.deepEqual(boostFor(plain, B, 'home', 'home'), heatBoost(plain, B, 'home', 'home'));
  assert.equal(boostFor(mk(null), B, 'home', 'home'), null);
  const both = { ...mk({ id: B, cond: 2, traits: ['clutch'] }, { bases: [false, true, false] }, { heat: true }), log: hits };
  const b = boostFor(both, B, 'home', 'home');
  assert.equal(b.reach, 1.25);
  assert.ok(b.hot && b.perk);
  near(b.quality, 0.05 + 0.06, 'quality adds');
  const onlyPerk = boostFor(mk({ id: B, cond: 1, traits: [] }), B, 'home', 'home');
  assert.ok(onlyPerk.perk && !onlyPerk.hot && !onlyPerk.rally);
});
