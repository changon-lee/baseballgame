// 육성모드 시즌 시상식: 정규시즌 리그 기록(raisestats)으로 내 선수가 받은 상을 낸다
// 다른 팀 선수의 승·세이브는 리그 기록에 없어서, 다승왕은 없고 구원왕은 내 기록 기준으로 준다
import { leaderboard, QUALIFY, MIN_POOL } from './raisestats.js';
import { getTeam, USER_TEAM_ID, TEAMS } from '../data/rosters.js';

// prize: 상금(만원), prem: 다음 연봉 기준 +%, fans: 인기
const MVP = { prize: 10000, prem: 0.3, fans: 15 }, TITLE = { prize: 2000, prem: 0.08, fans: 5 }, GG = { prize: 3000, prem: 0.1, fans: 6 };
export const AWARDS = {
  mvp: { name: '정규시즌 MVP', icon: '👑', ...MVP },
  gg: { name: '골든글러브', icon: '🧤', ...GG },
  avg: { name: '타격왕', icon: '🏏', ...TITLE },
  hr: { name: '홈런왕', icon: '💣', ...TITLE },
  rbi: { name: '타점왕', icon: '🎯', ...TITLE },
  era: { name: '평균자책점왕', icon: '🛡️', ...TITLE },
  so: { name: '탈삼진왕', icon: '🌪️', ...TITLE },
  sv: { name: '구원왕', icon: '🔒', ...TITLE },
};
export const SAVE_KING = { perGame: 0.25, era: 3.0 };   // 구원왕: 팀 경기 수 × 0.25 세이브 이상 + 평균자책 3.00 이하

const POS = new Map(TEAMS.flatMap(t => t.batters.map(b => [b.id, b.pos])));
const opsOf = b => (b.ab ? (b.h + b.bb) / (b.ab + b.bb) + (b.h + b.d2 + 2 * b.d3 + 3 * b.hr) / b.ab : 0);

// 내 포지션(지명타자 포함)에서 규정 타석을 채운 타자 중 OPS 1위인지
function goldenBat(slot) {
  const me = (slot.stats || {}).bat, games = slot.season.round || slot.season.schedule.length;
  const need = QUALIFY.bat * games;
  if (!me || me.pa < need || Object.keys((slot.league || {}).bat || {}).length < MIN_POOL) return false;
  const pos = (getTeam(USER_TEAM_ID).batters.find(b => b.id === slot.playerId) || {}).pos;
  const mine = opsOf(me);
  return !Object.entries((slot.league || {}).bat || {}).some(([id, l]) => id !== slot.playerId && POS.get(id) === pos && l.pa >= need && opsOf(l) > mine);
}

// 받은 상: [{ id, name, icon, prize, prem, fans }]. 정규시즌이 끝나야 준다
export function awardsOf(slot) {
  if (!slot.season || slot.season.phase === 'regular') return [];
  const st = slot.stats || {}, ids = [];
  // 비교할 선수가 너무 적으면(리그 기록이 없으면) 상은 없다
  const rank = key => { const l = leaderboard(slot, key, 1); return l.pool >= MIN_POOL ? l.myRank : null; };
  const first = key => rank(key) === 1;
  if (slot.kind === 'bat') {
    if (!st.bat) return [];
    if (first('ops')) ids.push('mvp');
    if (goldenBat(slot)) ids.push('gg');
    if (first('avg')) ids.push('avg');
    if (st.bat.hr > 0 && first('hr')) ids.push('hr');
    if (st.bat.rbi > 0 && first('rbi')) ids.push('rbi');
  } else if (slot.role === 'SP') {
    if (!st.pit) return [];
    const er = rank('era'), so = rank('so');
    if (er === 1 && so != null && so <= 3) ids.push('mvp');
    if (er != null && er <= 2) ids.push('gg');
    if (er === 1) ids.push('era');
    if (so === 1 && st.pit.so > 0) ids.push('so');
  } else {
    const p = st.pit, games = slot.season.schedule.length;
    if (p && p.outs && (st.sv || 0) >= games * SAVE_KING.perGame && (p.r * 27) / p.outs <= SAVE_KING.era) ids.push('sv');
  }
  return ids.map(id => ({ id, ...AWARDS[id] }));
}
