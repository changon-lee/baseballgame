// 경기 흐름 보너스: 불방망이(그 경기에서 잘 치는 타자) · 응원 열기(우리 공격이 이어질수록 차오르는 관중 게이지)
// 둘 다 경기 기록(log)만 보고 계산한다 → 따로 상태를 들고 다니지 않고, 되돌리기·넘기기에도 맞다.
// 불방망이: 그 경기 2안타째부터. 우리 타자면 배트가 커지고 타구가 세지고, 상대 타자도 타구가 세진다
// 응원 열기(우리 팀 공격만): 이번 반 이닝 동안 안타·볼넷 +1, 장타 +2, 아웃 -1. 4칸이 차면 '응원 폭발' →
//   다음 타자 한 타석 동안 배트가 커지고 타구가 세진다. 그 타석이 끝나면 0부터 다시 쌓는다
export const HOT_HITS = 2;
export const HOT = { reach: 1.12, quality: 0.05 };
export const RALLY = { reach: 1.15, quality: 0.06 };
export const RALLY_MAX = 4;
const MAX_REACH = 1.25;

const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const RALLY_STEP = { SINGLE: 1, WALK: 1, HBP: 1, ERROR: 1, SAC_BUNT: 1, SAC_FLY: 1, DOUBLE: 2, TRIPLE: 2, HR: 2,
  OUT: -1, STRIKEOUT: -1, DOUBLE_PLAY: -1 };

export const hitsToday = (log, batterId) => (log || []).reduce((n, e) => n + (e.batterId === batterId && HIT.includes(e.event) ? 1 : 0), 0);
export const isHot = (log, batterId) => hitsToday(log, batterId) >= HOT_HITS;

// 이번 반 이닝(inning, half)의 응원 열기: { value: 0..RALLY_MAX, full: 다음 타자가 응원 폭발 }
export function rally(log, inning, half) {
  let v = 0;
  for (const e of log || []) {
    if (e.inning !== inning || e.half !== half) continue;
    if (v >= RALLY_MAX) { v = 0; continue; }          // 응원 폭발 타석이 끝났다 → 처음부터
    v = Math.max(0, Math.min(RALLY_MAX, v + (RALLY_STEP[e.event] || 0)));
  }
  return { value: v, full: v >= RALLY_MAX };
}

// 지금 타자가 받는 보너스 { reach: 배트 크기 배수, quality: 타구질 더하기, hot, rally } 또는 null
// m.heat가 켜진 경기(내가 하는 일반 경기)에서만. userSide: 응원 열기를 받는 쪽(홈 = 우리 팀)
export function heatBoost(m, batterId, battingSide, userSide = 'home') {
  if (!m.heat) return null;
  const hot = isHot(m.log, batterId);
  const ral = battingSide === userSide && rally(m.log, m.game.inning, m.game.half).full;
  if (!hot && !ral) return null;
  const reach = Math.min(MAX_REACH, (hot ? HOT.reach : 1) * (ral ? RALLY.reach : 1));
  return { reach, quality: (hot ? HOT.quality : 0) + (ral ? RALLY.quality : 0), hot, rally: ral };
}
