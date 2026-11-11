// 업적: 직접 한 경기·시즌·커리어 기록으로 판정한다. 한 번 달성하면 커리어에 남는다(c.achv = { id: { year, n } })
// 경기 업적은 직접 한 경기(자동 진행 제외)만, 시즌·커리어 업적은 시즌을 마칠 때 본다.
const HIT = new Set(['SINGLE', 'DOUBLE', 'TRIPLE', 'HR']);

export const ACHIEVEMENTS = [
  // 경기
  { id: 'first_win', icon: '🎉', name: '첫 승리', desc: '직접 한 경기에서 처음으로 이기기' },
  { id: 'blowout', icon: '🔥', name: '대승', desc: '10점 차 이상으로 이기기' },
  { id: 'comeback', icon: '🔁', name: '대역전승', desc: '5점 차 이상 뒤지다가 이기기' },
  { id: 'walkoff', icon: '🎆', name: '끝내기', desc: '홈 경기 마지막 공격에서 끝내기로 이기기' },
  { id: 'shutout', icon: '🧱', name: '완봉승', desc: '상대에게 한 점도 안 주고 이기기' },
  { id: 'ten_k', icon: '⚡', name: '탈삼진 쇼', desc: '한 경기에서 삼진 10개 잡기' },
  { id: 'no_hitter', icon: '🚫', name: '노히트 노런', desc: '안타를 하나도 안 맞고 이기기' },
  { id: 'perfect', icon: '💎', name: '퍼펙트 게임', desc: '한 명도 1루에 안 보내고 이기기' },
  { id: 'hits15', icon: '💯', name: '안타 폭발', desc: '한 경기에서 안타 15개 치기' },
  { id: 'grand_slam', icon: '🌟', name: '만루 홈런', desc: '주자 꽉 찬 상황에서 홈런 치기' },
  { id: 'three_hr', icon: '💥', name: '3홈런 경기', desc: '한 선수가 한 경기에서 홈런 3개 치기' },
  { id: 'cycle', icon: '🔄', name: '사이클링 히트', desc: '한 선수가 한 경기에서 단타·2루타·3루타·홈런 모두 치기' },
  // 시즌
  { id: 'winning', icon: '📈', name: '승률 7할', desc: '9경기 이상 시즌을 승률 7할 이상으로 마치기' },
  { id: 'champion', icon: '🏆', name: '우승', desc: '한국시리즈 우승하기' },
  { id: 'hr10', icon: '💣', name: '두 자릿수 홈런', desc: '한 선수가 한 시즌 홈런 10개' },
  { id: 'hr30', icon: '👑', name: '30홈런 타자', desc: '한 선수가 한 시즌 홈런 30개' },
  { id: 'avg300', icon: '🎯', name: '3할 타자', desc: '경기당 3타석 이상 나선 선수가 타율 3할로 시즌 마치기' },
  // 커리어
  { id: 'seasons5', icon: '📅', name: '베테랑 감독', desc: '시즌 5번 마치기' },
  { id: 'dynasty', icon: '🏰', name: '왕조', desc: '우승 3번 하기' },
];
export const achievementById = id => ACHIEVEMENTS.find(a => a.id === id);

// 직접 한 경기: game = { home, away, hs, as }, log = 타석 기록, me = 우리 팀 id
export function gameAchievements(game, log, me) {
  if (!game || !log) return [];
  const home = game.home === me;
  const my = home ? game.hs : game.as, op = home ? game.as : game.hs, win = my > op;
  const mine = id => String(id).startsWith(me + '-');
  const myBat = log.filter(e => mine(e.batterId)), opBat = log.filter(e => !mine(e.batterId));
  const out = [];
  if (win) out.push('first_win');
  if (win && my - op >= 10) out.push('blowout');
  // 가장 크게 뒤졌던 점수 차(타석이 끝난 뒤 점수 기준)
  let deficit = 0;
  for (const e of log) if (e.score) { const d = (home ? e.score.away - e.score.home : e.score.home - e.score.away); if (d > deficit) deficit = d; }
  if (win && deficit >= 5) out.push('comeback');
  const last = log[log.length - 1];
  if (win && home && last && last.half === 'bottom' && mine(last.batterId) && last.runs > 0) out.push('walkoff');
  if (win && op === 0) out.push('shutout');
  if (opBat.filter(e => e.event === 'STRIKEOUT').length >= 10) out.push('ten_k');
  const opHits = opBat.filter(e => HIT.has(e.event)).length;
  if (win && opBat.length && opHits === 0) out.push('no_hitter');
  if (win && opBat.length && opBat.every(e => ['OUT', 'STRIKEOUT', 'DOUBLE_PLAY', 'SAC_FLY', 'SAC_BUNT', 'LINE_DP'].includes(e.event))) out.push('perfect');
  if (myBat.filter(e => HIT.has(e.event)).length >= 15) out.push('hits15');
  if (myBat.some(e => e.event === 'HR' && e.bases && e.bases.every(Boolean))) out.push('grand_slam');
  const by = {};
  for (const e of myBat) (by[e.batterId] = by[e.batterId] || []).push(e.event);
  const lines = Object.values(by);
  if (lines.some(evs => evs.filter(x => x === 'HR').length >= 3)) out.push('three_hr');
  if (lines.some(evs => ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'].every(k => evs.includes(k)))) out.push('cycle');
  return out;
}

// 시즌을 마칠 때: sum = seasonSummary, stats = 그 시즌 우리 선수 기록 { bat: {id: {pa, ab, h, hr}} }
export function seasonAchievements(sum, stats, me) {
  if (!sum) return [];
  const out = [], games = sum.w + sum.l + (sum.d || 0);
  if (games >= 9 && sum.w / Math.max(1, sum.w + sum.l) >= 0.7) out.push('winning');
  if (sum.champion === me) out.push('champion');
  const bats = Object.values((stats && stats.bat) || {});
  if (bats.some(b => b.hr >= 10)) out.push('hr10');
  if (bats.some(b => b.hr >= 30)) out.push('hr30');
  if (games && bats.some(b => b.pa >= games * 3 && b.ab > 0 && b.h / b.ab >= 0.3)) out.push('avg300');
  return out;
}

export function careerAchievements(history, me) {
  const out = [];
  if (history.length >= 5) out.push('seasons5');
  if (history.filter(x => x.champion === me).length >= 3) out.push('dynasty');
  return out;
}

// 달성 기록에 더한다. 처음 달성한 것만 fresh로 돌려준다(여러 번 달성하면 n만 는다)
export function award(achv, ids, year) {
  const next = { ...(achv || {}) }, fresh = [];
  for (const id of new Set(ids)) {
    if (!achievementById(id)) continue;
    if (next[id]) next[id] = { ...next[id], n: next[id].n + 1 };
    else { next[id] = { year, n: 1 }; fresh.push(id); }
  }
  return { achv: next, fresh };
}
