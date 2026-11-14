// 육성모드: 삼성 선수 한 명을 슬롯에 골라 끝없이 키운다.
// 하루 = 선택 1번(훈련 하나 또는 휴식) → 경기 1번. 피로가 차면 훈련을 못 한다.
// 저장은 'baseball.raise.v1' 한 키에 { v: 1, slots: [slot | null ×3] }. 시즌모드·대결모드 저장은 건드리지 않는다
import { getTeam, USER_TEAM_ID } from '../data/rosters.js';
import { createGrowth, gainXp, applyGrowth, gainFromLog, playerLine } from './growth.js';
import { defaultLineup } from './team.js';
import { createSeason, recordRound, standings, nextStarter } from './season.js';
import { decisions, gameLine, raiseStep } from './raisematch.js';
import { createMatch } from './match.js';
import { leagueAdd, emptyLeague } from './raisestats.js';
import { TRAITS } from './perks.js';

const ME = USER_TEAM_ID;
const KEY = 'baseball.raise.v1';

// 밸런스 숫자는 모두 여기
export const RAISE = {
  slots: 3,
  trainCost: 20, drillCost: 30,           // 훈련 피로
  rest: -45, idle: -10,                   // 휴식 / 아무것도 안 고르고 경기
  batGame: 5, perPitch: 0.4,              // 경기 출전 피로(타자 / 투수는 던진 공 수 ×)
  tiredAt: 70,                            // 이 이상으로 경기에 나가면 컨디션이 한 칸 더 떨어진다
  drillNeed: 4,                           // 같은 특훈을 이만큼 하면 특성
  drillXp: 0.4,                           // 특훈이 능력치에 주는 경험치(일반 훈련 대비)
  // 훈련 = 연습장 한 번(타격 5번 / 투구 5구). 연습 점수가 기준이면 경험치 그대로, 잘하면 최대 1.5배, 못하면 0.3배까지
  practiceGoal: { bat: 5, pitch: 5 },
  practiceRef: { bat: 5, pitch: 6 }, practiceMin: 0.3, practiceMax: 1.5,
  // 가벼운 훈련(헬스·유연성): 연습장 없이 바로. 피로도 덜, 효과도 덜(기준 연습의 이만큼)
  lightCost: 10, lightXp: 0.5,
  xpBase: 6, xpMin: 1.8, xpSlope: 0.12,   // 훈련 경험치: max(xpMin, xpBase - (능력치-60)×xpSlope), 12점마다 +1
  seasonCycles: 3, startEvery: 4,         // 9개 팀 × 3 = 27경기, 선발은 4경기마다
  firstYear: 2027,
  // 리그 타격 환경: 컴퓨터 타자 타이밍 흔들림 배수(리그 타율을 실제 KBO 수준으로)
  bat: { k: 1.3 },
  // 경기 뒤 컨디션: 점수가 up 이상이면 한 칸 ↑, down 이하면 ↓
  condBat: { up: 2, down: -1 }, condSP: { up: 4, down: 0 },
  // 경기 활약 특성: [누적 카운터, 기준]
  feat: { clutch: ['rispHits', 8], lhpKiller: ['lhpHits', 10], slugger: ['hr', 10], grind: ['bb', 12],
    escape: ['rispEscapes', 10], lhbKiller: ['lhbSo', 15], finisher: ['so', 30], ironArm: ['longStarts', 5], closer: ['saves', 8] },
};

const CAP = { power: 99, contact: 99, eye: 99, control: 99, stamina: 99, velo: 162 };

export const DRILLS = [
  { id: 'power', kind: 'bat', name: '파워 훈련', stat: 'power' },
  { id: 'contact', kind: 'bat', name: '컨택 훈련', stat: 'contact' },
  { id: 'eye', kind: 'bat', name: '선구안 훈련', stat: 'eye' },
  { id: 'drillRisp', kind: 'bat', name: '득점권 대비 특훈', stat: 'contact', drill: true, trait: 'clutch' },
  { id: 'drillLhp', kind: 'bat', name: '좌투수 대비 특훈', stat: 'contact', drill: true, trait: 'lhpKiller' },
  { id: 'drillFirst', kind: 'bat', name: '초구 공략 특훈', stat: 'power', drill: true, trait: 'firstPitch' },
  { id: 'gym', kind: 'bat', name: '헬스하기', stat: 'power', light: true },
  { id: 'flex', kind: 'bat', name: '유연성 키우기', stat: 'contact', light: true },
  { id: 'velo', kind: 'pitch', name: '구속 훈련', stat: 'velo' },
  { id: 'control', kind: 'pitch', name: '제구 훈련', stat: 'control' },
  { id: 'stamina', kind: 'pitch', name: '체력 훈련', stat: 'stamina' },
  { id: 'drillEscape', kind: 'pitch', name: '위기 대비 특훈', stat: 'control', drill: true, trait: 'escape' },
  { id: 'drillLhb', kind: 'pitch', name: '좌타자 대비 특훈', stat: 'control', drill: true, trait: 'lhbKiller' },
  { id: 'drillFinish', kind: 'pitch', name: '결정구 특훈', stat: 'velo', drill: true, trait: 'finisher' },
].map(d => ({ drill: false, light: false, ...d, cost: d.light ? RAISE.lightCost : d.drill ? RAISE.drillCost : RAISE.trainCost }));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function findPlayer(id) {
  const t = getTeam(ME);
  const b = t.batters.find(x => x.id === id);
  if (b) return { player: b, kind: 'bat' };
  const p = t.pitchers.find(x => x.id === id);
  if (p) return { player: p, kind: 'pitch' };
  return null;
}

export function newSlot(playerId, year = RAISE.firstYear) {
  const f = findPlayer(playerId);
  if (!f) throw new Error(`삼성 선수가 아니에요: ${playerId}`);
  return {
    playerId, kind: f.kind, role: f.kind === 'bat' ? null : f.player.role === 'SP' ? 'SP' : 'CL',
    growth: createGrowth(), condition: 0, fatigue: 0, traits: [],
    progress: { train: {}, feat: {} }, chosen: false,
    year, season: createSeason({ cycles: RAISE.seasonCycles, innings: 9, year }),
    stats: {}, total: {}, history: [], league: emptyLeague(),
    seasonBase: baseOf(playerId, f.kind, createGrowth()),
  };
}

// 시즌 시작 때 능력치(시즌 결산에서 '이번 시즌에 오른 능력치'를 보여 준다)
const STAT_KEYS = { bat: ['power', 'contact', 'eye'], pitch: ['velo', 'control', 'stamina'] };
function baseOf(playerId, kind, growth) {
  const t = applyGrowth(getTeam(ME), growth), p = t.batters.find(b => b.id === playerId) || t.pitchers.find(q => q.id === playerId);
  return Object.fromEntries(STAT_KEYS[kind].map(k => [k, p[k]]));
}
export function seasonGains(slot) {
  if (!slot.seasonBase) return [];
  const p = slotPlayer(slot);
  return STAT_KEYS[slot.kind].map(k => ({ stat: k, n: p[k] - (slot.seasonBase[k] ?? p[k]) })).filter(x => x.n > 0);
}

// ── 저장 ──
const validSlot = s => !!(s && typeof s === 'object' && typeof s.playerId === 'string' && findPlayer(s.playerId)
  && (s.kind === 'bat' || s.kind === 'pitch') && s.season && Array.isArray(s.season.schedule)
  && s.growth && s.growth.delta && Array.isArray(s.traits) && s.progress && Number.isFinite(s.fatigue) && Number.isFinite(s.condition));

export function loadRaise(storage) {
  const empty = { v: 1, slots: Array(RAISE.slots).fill(null), broken: [] };
  let raw = null;
  try { raw = storage && storage.getItem(KEY); } catch (e) { return empty; }
  if (!raw) return empty;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return { ...empty, broken: [...Array(RAISE.slots).keys()] }; }
  if (!d || d.v !== 1 || !Array.isArray(d.slots)) return { ...empty, broken: [...Array(RAISE.slots).keys()] };
  const slots = [], broken = [];
  for (let i = 0; i < RAISE.slots; i++) {
    const s = d.slots[i];
    if (s == null) slots.push(null);
    else if (validSlot(s)) slots.push(s);
    else { slots.push(null); broken.push(i); }
  }
  return { v: 1, slots, broken };
}

export function saveRaise(storage, r) {
  try { storage.setItem(KEY, JSON.stringify({ v: 1, slots: r.slots })); return true; } catch (e) { return false; }
}

// ── 선수·팀 ──
export const raiseTeam = (slot, { benchMe = false } = {}) => {
  const t = applyGrowth(getTeam(ME), slot.growth);
  return benchMe ? { ...t, pitchers: t.pitchers.filter(p => p.id !== slot.playerId), batters: t.batters.filter(b => b.id !== slot.playerId) } : t;
};
export const slotPlayer = slot => {
  const t = raiseTeam(slot);
  return t.batters.find(b => b.id === slot.playerId) || t.pitchers.find(p => p.id === slot.playerId);
};

// 기본 타순. 내 타자가 9명 밖(벤치)이면 지명타자 자리에 들어간다
export function raiseLineup(slot, team) {
  const l = defaultLineup(team);
  if (slot.kind !== 'bat' || l.order.includes(slot.playerId) || !team.batters.some(b => b.id === slot.playerId)) return l;   // 벤치(휴식)면 그대로
  const dh = l.order.findIndex(id => team.batters.find(b => b.id === id).pos === 'DH');
  const order = [...l.order];
  order[dh >= 0 ? dh : 8] = slot.playerId;
  return { ...l, order };
}

// ── 훈련 ──
// 능력치가 높을수록 덜 오른다. 구속은 145km ≈ 50, 160km ≈ 95로 바꿔서 같은 식
export function xpPerTraining(stat, value) {
  const v = stat === 'velo' ? 50 + (value - 145) * 3 : value;
  return Math.max(RAISE.xpMin, RAISE.xpBase - (v - 60) * RAISE.xpSlope);
}

const drillOf = id => DRILLS.find(d => d.id === id);

export function canChoose(slot, id) {
  if (slot.chosen) return { ok: false, reason: 'done' };
  if (id === 'rest') return { ok: true };
  const d = drillOf(id);
  if (!d || d.kind !== slot.kind) return { ok: false, reason: 'kind' };
  if (slot.fatigue + d.cost > 100) return { ok: false, reason: 'tired' };
  return { ok: true };
}

// 오늘의 선택. pts: 훈련으로 한 연습장 점수(없으면 기준 점수로 친다 — 시뮬레이션·테스트용)
// { slot, ups: [{ stat, n }], trait: 새 특성 id | null }
export function choose(slot, id, pts = null) {
  const c = canChoose(slot, id);
  if (!c.ok) throw new Error(`고를 수 없어요: ${id} (${c.reason})`);
  if (id === 'rest') {
    const cond = slot.condition - Math.sign(slot.condition);
    // 휴식한 날은 그날 경기에 나가지 않는다(벤치)
    return { slot: { ...slot, chosen: true, resting: true, fatigue: clamp(slot.fatigue + RAISE.rest, 0, 100), condition: cond }, ups: [], trait: null };
  }
  const d = drillOf(id), now = slotPlayer(slot)[d.stat];
  let growth = slot.growth, ups = [];
  if (now < CAP[d.stat]) {
    const k = pts == null ? 1 : clamp(pts / RAISE.practiceRef[slot.kind], RAISE.practiceMin, RAISE.practiceMax);
    const r = gainXp(growth, slot.playerId, d.stat, xpPerTraining(d.stat, now) * k * (d.drill ? RAISE.drillXp : d.light ? RAISE.lightXp : 1));
    growth = r.growth; ups = r.ups.map(u => ({ stat: u.stat, n: u.n }));
  }
  let progress = slot.progress, traits = slot.traits, trait = null;
  if (d.drill) {
    const n = (progress.train[id] || 0) + 1;
    progress = { ...progress, train: { ...progress.train, [id]: n } };
    if (n >= RAISE.drillNeed && !traits.includes(d.trait)) { traits = [...traits, d.trait]; trait = d.trait; }
  }
  return { slot: { ...slot, growth, progress, traits, chosen: true, fatigue: clamp(slot.fatigue + d.cost, 0, 100) }, ups, trait };
}

// ── 하루 · 경기 ──
const ownerOf = id => getTeam(id.split('-')[0]);
const pitcherById = id => { const t = ownerOf(id); return t && t.pitchers.find(p => p.id === id); };
const batterById = id => { const t = ownerOf(id); return t && t.batters.find(b => b.id === id); };

export function dayInfo(slot) {
  const s = slot.season, round = s.round, total = s.schedule.length;
  const g = round < total ? s.schedule[round].find(x => x.includes(ME)) : null;
  const resting = !!slot.resting;
  const myStart = slot.role === 'SP' && round % RAISE.startEvery === 0 && !resting;
  const k = (RAISE.startEvery - (round % RAISE.startEvery)) % RAISE.startEvery;
  return {
    nextStartIn: slot.role === 'SP' && round + k < total ? k : null,      // 다음 선발까지 남은 경기(이번 시즌에 없으면 null)
    round, total, opponentId: g ? g.find(x => x !== ME) : null,
    label: `${slot.year} 시즌 ${Math.min(round + 1, total)}/${total}경기`,
    myStart, resting, needsScreen: !resting && (slot.kind === 'bat' || slot.role === 'CL' || myStart),
  };
}

// 오늘 삼성 팀: 휴식한 날, 선발 투수가 쉬는 날에는 내 선수를 빼 둔다(다른 선발이 돌고, 불펜으로도 안 나온다)
const todayTeam = slot => raiseTeam(slot, { benchMe: !!slot.resting || (slot.role === 'SP' && !dayInfo(slot).myStart) });
const getterFor = slot => { const mine = todayTeam(slot); return id => (id === ME ? mine : getTeam(id)); };

export function starterFor(slot) {
  if (dayInfo(slot).myStart) return slot.playerId;
  return nextStarter(slot.season, ME, getterFor(slot));
}

// 경기 화면(showGame)에 그대로 넘길 것
export function matchSetup(slot) {
  const d = dayInfo(slot), team = todayTeam(slot), cond = slot.condition;
  return {
    userTeam: team, cpuTeam: getTeam(d.opponentId), title: d.label,
    lineup: { ...raiseLineup(slot, team), starterId: starterFor(slot) },
    cpuStarterId: nextStarter(slot.season, d.opponentId),
    perks: { id: slot.playerId, cond, traits: [...slot.traits] },
    raise: { kind: slot.kind, role: slot.role, playerId: slot.playerId, cond },
  };
}

const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const risp = e => !!(e.bases && (e.bases[1] || e.bases[2]));

// 이 경기에서 늘어난 활약 카운터
function featsOf(slot, log, line, dec) {
  const id = slot.playerId, f = {};
  const add = (k, n = 1) => { if (n) f[k] = (f[k] || 0) + n; };
  if (slot.kind === 'bat') {
    for (const e of log) if (e.batterId === id) {
      const hit = HIT.includes(e.event);
      if (hit && risp(e)) add('rispHits');
      if (hit && (pitcherById(e.pitcherId) || {}).throws === 'L') add('lhpHits');
      if (e.event === 'HR') add('hr');
      if (e.event === 'WALK') add('bb');
    }
    return f;
  }
  const mine = log.filter(e => e.pitcherId === id);
  for (const e of mine) if (e.event === 'STRIKEOUT') { add('so'); if ((batterById(e.batterId) || {}).bats === 'L') add('lhbSo'); }
  for (const inn of new Set(mine.map(e => e.inning))) {
    const half = log.filter(e => e.inning === inn && e.half === 'top');
    if (half.some(e => e.pitcherId === id && risp(e)) && half.reduce((a, e) => a + (e.runs || 0), 0) === 0 && half[half.length - 1].pitcherId === id) add('rispEscapes');
  }
  if (slot.role === 'SP' && line.pit && line.pit.outs >= 18 && slotPlayer(slot).stamina >= 90) add('longStarts');
  add('saves', dec.sv);
  return f;
}

function condDelta(slot, line) {
  if (slot.kind === 'bat') {
    const b = line.bat;
    if (!b) return 0;
    const sc = b.h + (b.d2 + b.d3 + b.hr) + b.hr + 0.5 * b.bb + 0.5 * b.rbi - 0.5 * b.so - 0.3 * Math.max(0, b.ab - b.h - b.so);
    return sc >= RAISE.condBat.up ? 1 : sc <= RAISE.condBat.down ? -1 : 0;
  }
  const p = line.pit;
  if (!p) return 0;
  if (slot.role === 'CL') return p.outs >= 3 && p.r === 0 ? 1 : p.r >= 2 ? -1 : 0;
  const sc = p.outs * 0.3 + p.so * 0.2 - p.r;
  return sc >= RAISE.condSP.up ? 1 : sc <= RAISE.condSP.down ? -1 : 0;
}

// 기록 누적: { bat, pit, w, l, sv, g(출전 경기) }
function addStats(prev, id, myLog, dec, appeared) {
  const pl = playerLine({ bat: prev.bat ? { [id]: prev.bat } : {}, pit: prev.pit ? { [id]: prev.pit } : {} }, myLog);
  return {
    ...(pl.bat[id] ? { bat: pl.bat[id] } : {}), ...(pl.pit[id] ? { pit: pl.pit[id] } : {}),
    w: (prev.w || 0) + dec.w, l: (prev.l || 0) + dec.l, sv: (prev.sv || 0) + dec.sv, g: (prev.g || 0) + (appeared ? 1 : 0),
  };
}


// 오늘 경기를 내 첫 장면까지 미리 돌려 본다(화면 없이).
// 내 장면이 없으면(마무리 등판 없음 등) { set, result } — 화면 없이 그대로 하루를 끝낼 경기 결과
// 있으면 { set, match } — 그 순간의 경기부터 화면을 연다
export function prelude(slot, rng) {
  const set = matchSetup(slot);
  const m0 = createMatch({ userTeam: set.userTeam, cpuTeam: set.cpuTeam, userLineup: set.lineup, innings: 9, rng, cpuStarterId: set.cpuStarterId, heat: true, perks: set.perks, bat: RAISE.bat });
  const r = raiseStep(m0, set.raise, rng);
  if (r.phase === 'me') return { set, match: r.match };
  const g = r.match.game;
  return { set, result: { home: g.score.home, away: g.score.away, log: r.match.log, starterId: set.lineup.starterId, raise: { note: r.note } } };
}
const traitKind = t => (TRAITS.find(x => x.id === t) || {}).kind;

// 하루 마무리: 경기 결과(내가 한 경기 { home, away, log, starterId } 또는 null = 자동)를 시즌·내 선수에 반영
export function applyDay(slot, result, rng) {
  const id = slot.playerId, team = todayTeam(slot);
  const r = recordRound(slot.season, result, rng, { getT: getterFor(slot), userLineup: raiseLineup(slot, team), userStarterId: starterFor(slot), bat: RAISE.bat });
  const game = r.games.find(g => g.home === ME || g.away === ME);
  const log = (game && game.log) || [];
  const myLog = log.filter(e => e.batterId === id || e.pitcherId === id);
  const outcome = !game ? 'draw' : game.hs > game.as ? 'home' : game.hs < game.as ? 'away' : 'draw';
  const line = gameLine(myLog, id), dec = decisions(log, id, slot.role, outcome);
  const appeared = !!(slot.kind === 'bat' ? line.bat : line.pit);
  const { growth, ups } = gainFromLog(slot.growth, myLog, ME);
  // 컨디션: 성적 + 지친 채로 나갔으면 한 칸 더 ↓
  let d = condDelta(slot, line);
  if (appeared && slot.fatigue >= RAISE.tiredAt) d -= 1;
  const condition = clamp(slot.condition + d, -2, 2);
  // 피로: 아무것도 안 고른 날은 조금 회복, 출전하면 쌓인다
  const pitches = myLog.filter(e => e.pitcherId === id).reduce((a, e) => a + (e.pitches || []).length, 0);
  const load = slot.kind === 'bat' ? (appeared ? RAISE.batGame : 0) : pitches * RAISE.perPitch;
  const fatigue = clamp(slot.fatigue + (slot.chosen ? 0 : RAISE.idle) + load, 0, 100);
  // 활약 특성
  const inc = featsOf(slot, log, line, dec), feat = { ...slot.progress.feat };
  for (const [k, n] of Object.entries(inc)) feat[k] = (feat[k] || 0) + n;
  const traitsNew = Object.entries(RAISE.feat)
    .filter(([t, [k, need]]) => traitKind(t) === slot.kind && (feat[k] || 0) >= need && !slot.traits.includes(t)).map(([t]) => t);
  const next = {
    ...slot, season: r.season, growth, condition, fatigue, chosen: false, resting: false,
    traits: [...slot.traits, ...traitsNew], progress: { ...slot.progress, feat },
    stats: addStats(slot.stats, id, myLog, dec, appeared), total: addStats(slot.total, id, myLog, dec, appeared),
    league: leagueAdd(slot.league, r.games.map(g => g.log)),   // 리그 전체 기록(상위 몇 %를 내려고)
  };
  const st = standings(r.season).find(x => x.id === ME);
  return {
    slot: next,
    report: {
      line, dec, appeared, rested: !!slot.resting, ups: ups.map(u => ({ stat: u.stat, n: u.n })), condFrom: slot.condition, condTo: condition, traitsNew,
      game: game ? { home: game.home, away: game.away, hs: game.hs, as: game.as } : null,
      team: { w: st.w, l: st.l, d: st.d, rank: st.rank }, seasonOver: seasonOver(next),
    },
  };
}

export const seasonOver = slot => slot.season.phase !== 'regular';

// 다음 시즌: 시즌 기록·순위는 새로, 능력치·특성·통산은 그대로. 비시즌에 푹 쉬어 피로 0, 컨디션 보통
export function nextSeason(slot) {
  const st = standings(slot.season).find(x => x.id === ME);
  const before = new Set(slot.history.flatMap(h => h.traitsNew || []));
  const entry = { year: slot.year, line: slot.stats, rank: st.rank, w: st.w, l: st.l, d: st.d, traitsNew: slot.traits.filter(t => !before.has(t)) };
  const year = slot.year + 1;
  return {
    ...slot, year, season: createSeason({ cycles: RAISE.seasonCycles, innings: 9, year }),
    stats: {}, league: emptyLeague(), fatigue: 0, condition: 0, chosen: false, resting: false, history: [...slot.history, entry], seasonBase: baseOf(slot.playerId, slot.kind, slot.growth),
  };
}
