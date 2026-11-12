// 육성모드: 내 선수의 컨디션(기세)·특성이 경기 중에 주는 효과.
// match 객체에 perks = { id, cond: -2..2, traits: [id] } 가 있을 때만, 그 선수에게만, 해당 상황에서만.
// rng를 쓰지 않는다 → 다른 모드(perks 없음)의 경기 결과와 난수 순서는 그대로다
import { battingSide } from './rules.js';
import { heatBoost } from './heat.js';

export const PERK = {
  cond: { reach: 0.04, quality: 0.015, control: 2, velo: 1 },   // 컨디션 한 칸마다
  trait: { reach: 1.08, quality: 0.03, control: 6 },            // 상황 특성 하나
  finisher: { control: 4, velo: 2 },                           // 결정구(2스트라이크)
  ironArm: 0.85,                                               // 강철 어깨: 투구 수가 이만큼만 쌓이는 셈(체력 ÷0.85)
  maxReach: 1.25,                                              // 불방망이·응원과 합쳐도 배트는 이 이상 안 커진다
};

export const TRAITS = [
  { id: 'clutch', kind: 'bat', name: '찬스에 강함', desc: '주자가 2·3루에 있으면 더 잘 쳐요' },
  { id: 'lhpKiller', kind: 'bat', name: '좌투수 킬러', desc: '왼손 투수를 상대로 더 잘 쳐요' },
  { id: 'firstPitch', kind: 'bat', name: '초구 공략', desc: '0볼 0스트라이크에서 더 잘 쳐요' },
  { id: 'slugger', kind: 'bat', name: '거포 본능', desc: '그 경기에서 홈런을 친 뒤 타구가 더 세져요' },
  { id: 'grind', kind: 'bat', name: '끈질김', desc: '2스트라이크 뒤에 배트가 커져요' },
  { id: 'escape', kind: 'pitch', name: '위기관리', desc: '주자가 2·3루에 있으면 제구가 좋아져요' },
  { id: 'lhbKiller', kind: 'pitch', name: '좌타자 킬러', desc: '왼손 타자를 상대로 제구가 좋아져요' },
  { id: 'finisher', kind: 'pitch', name: '결정구', desc: '2스트라이크에서 제구와 구속이 올라가요' },
  { id: 'ironArm', kind: 'pitch', name: '강철 어깨', desc: '경기 중에 덜 지쳐요' },
  { id: 'closer', kind: 'pitch', name: '뒷문 지킴이', desc: '9회부터 제구가 좋아져요' },
];

const other = s => (s === 'home' ? 'away' : 'home');
const has = (pk, id) => pk.traits && pk.traits.includes(id);
const risp = g => !!(g.bases[1] || g.bases[2]);

// 내 타자가 받는 효과 { reach: 배트 크기 배수, quality: 타구질 더하기 } 또는 null
export function perkBoost(m, batterId) {
  const pk = m.perks;
  if (!pk || batterId !== pk.id) return null;
  const g = m.game, c = pk.cond || 0;
  let reach = 1 + PERK.cond.reach * c, quality = PERK.cond.quality * c, any = c !== 0;
  const both = () => { reach *= PERK.trait.reach; quality += PERK.trait.quality; any = true; };
  if (has(pk, 'clutch') && risp(g)) both();
  if (has(pk, 'firstPitch') && g.balls === 0 && g.strikes === 0) both();
  if (has(pk, 'grind') && g.strikes === 2) { reach *= PERK.trait.reach; any = true; }
  if (has(pk, 'slugger') && (m.log || []).some(e => e.batterId === batterId && e.event === 'HR')) { quality += PERK.trait.quality; any = true; }
  if (has(pk, 'lhpKiller')) {
    const side = m.teams.home.batters.some(b => b.id === batterId) ? 'home' : 'away', ps = other(side);
    const p = m.teams[ps].pitchers.find(q => q.id === m.pitcher[ps]);
    if (p && p.throws === 'L') both();
  }
  return any ? { reach, quality } : null;
}

// 내 투수면 지금 상황에 맞춰 제구·구속·체력을 고친 새 객체, 아니면 그대로
export function perkPitcher(m, pitcher) {
  const pk = m.perks;
  if (!pk || !pitcher || pitcher.id !== pk.id) return pitcher;
  const g = m.game, c = pk.cond || 0;
  let control = pitcher.control + PERK.cond.control * c, velo = pitcher.velo + PERK.cond.velo * c, stamina = pitcher.stamina;
  if (has(pk, 'escape') && risp(g)) control += PERK.trait.control;
  if (has(pk, 'closer') && g.inning >= 9) control += PERK.trait.control;
  if (has(pk, 'finisher') && g.strikes === 2) { control += PERK.finisher.control; velo += PERK.finisher.velo; }
  if (has(pk, 'ironArm')) stamina = Math.min(120, stamina / PERK.ironArm);
  if (has(pk, 'lhbKiller')) {
    const bs = battingSide(g), id = m.lineups[bs].order[g.battingIndex[bs]];
    const b = m.teams[bs].batters.find(q => q.id === id);
    if (b && b.bats === 'L') control += PERK.trait.control;
  }
  if (control === pitcher.control && velo === pitcher.velo && stamina === pitcher.stamina) return pitcher;
  return { ...pitcher, control, velo, stamina };
}

// 불방망이·응원(heat)과 육성 효과(perk)를 합친 타자 보너스. 둘 다 없으면 null(예전과 같다)
export function boostFor(m, batterId, side, userSide = 'home') {
  const heat = heatBoost(m, batterId, side, userSide), perk = perkBoost(m, batterId);
  if (!perk) return heat;
  return {
    reach: Math.min(PERK.maxReach, (heat ? heat.reach : 1) * perk.reach),
    quality: (heat ? heat.quality : 0) + perk.quality,
    hot: heat ? heat.hot : false, rally: heat ? heat.rally : false, perk: true,
  };
}
