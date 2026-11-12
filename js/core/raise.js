// 육성모드: 삼성 선수 한 명을 슬롯에 골라 끝없이 키운다.
// 하루 = 선택 1번(훈련 하나 또는 휴식) → 경기 1번. 피로가 차면 훈련을 못 한다.
// 저장은 'baseball.raise.v1' 한 키에 { v: 1, slots: [slot | null ×3] }. 시즌모드·대결모드 저장은 건드리지 않는다
import { getTeam, USER_TEAM_ID } from '../data/rosters.js';
import { createGrowth, gainXp, applyGrowth } from './growth.js';
import { defaultLineup } from './team.js';
import { createSeason } from './season.js';

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
  xpBase: 6, xpMin: 1.8, xpSlope: 0.12,   // 훈련 경험치: max(xpMin, xpBase - (능력치-60)×xpSlope), 12점마다 +1
  seasonCycles: 3, startEvery: 4,         // 9개 팀 × 3 = 27경기, 선발은 4경기마다
  firstYear: 2027,
};

const CAP = { power: 99, contact: 99, eye: 99, control: 99, stamina: 99, velo: 162 };

export const DRILLS = [
  { id: 'power', kind: 'bat', name: '파워 훈련', stat: 'power' },
  { id: 'contact', kind: 'bat', name: '컨택 훈련', stat: 'contact' },
  { id: 'eye', kind: 'bat', name: '선구안 훈련', stat: 'eye' },
  { id: 'drillRisp', kind: 'bat', name: '득점권 대비 특훈', stat: 'contact', drill: true, trait: 'clutch' },
  { id: 'drillLhp', kind: 'bat', name: '좌투수 대비 특훈', stat: 'contact', drill: true, trait: 'lhpKiller' },
  { id: 'drillFirst', kind: 'bat', name: '초구 공략 특훈', stat: 'power', drill: true, trait: 'firstPitch' },
  { id: 'velo', kind: 'pitch', name: '구속 훈련', stat: 'velo' },
  { id: 'control', kind: 'pitch', name: '제구 훈련', stat: 'control' },
  { id: 'stamina', kind: 'pitch', name: '체력 훈련', stat: 'stamina' },
  { id: 'drillEscape', kind: 'pitch', name: '위기 대비 특훈', stat: 'control', drill: true, trait: 'escape' },
  { id: 'drillLhb', kind: 'pitch', name: '좌타자 대비 특훈', stat: 'control', drill: true, trait: 'lhbKiller' },
  { id: 'drillFinish', kind: 'pitch', name: '결정구 특훈', stat: 'velo', drill: true, trait: 'finisher' },
].map(d => ({ drill: false, ...d, cost: d.drill ? RAISE.drillCost : RAISE.trainCost }));

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
    stats: {}, total: {}, history: [],
  };
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
  return benchMe ? { ...t, pitchers: t.pitchers.filter(p => p.id !== slot.playerId) } : t;
};
export const slotPlayer = slot => {
  const t = raiseTeam(slot);
  return t.batters.find(b => b.id === slot.playerId) || t.pitchers.find(p => p.id === slot.playerId);
};

// 기본 타순. 내 타자가 9명 밖(벤치)이면 지명타자 자리에 들어간다
export function raiseLineup(slot, team) {
  const l = defaultLineup(team);
  if (slot.kind !== 'bat' || l.order.includes(slot.playerId)) return l;
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

// 오늘의 선택. { slot, ups: [{ stat, n }], trait: 새 특성 id | null }
export function choose(slot, id) {
  const c = canChoose(slot, id);
  if (!c.ok) throw new Error(`고를 수 없어요: ${id} (${c.reason})`);
  if (id === 'rest') {
    const cond = slot.condition - Math.sign(slot.condition);
    return { slot: { ...slot, chosen: true, fatigue: clamp(slot.fatigue + RAISE.rest, 0, 100), condition: cond }, ups: [], trait: null };
  }
  const d = drillOf(id), now = slotPlayer(slot)[d.stat];
  let growth = slot.growth, ups = [];
  if (now < CAP[d.stat]) {
    const r = gainXp(growth, slot.playerId, d.stat, xpPerTraining(d.stat, now) * (d.drill ? RAISE.drillXp : 1));
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
