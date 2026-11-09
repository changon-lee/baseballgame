// 투수 피로: 던진 투수는 다음 경기에도 지친 채로 나오고, 3일(경기 3번)이 지나야 완전히 회복한다.
// 피로(load) 0 = 쌩쌩, 1 = 방금 많이 던짐. 하루에 1/3씩 회복: 다음 경기 2/3, 그다음 1/3, 3일 뒤 0.
// 상태는 커리어에 { day: 지금까지 지난 날 수, fatigue: { 선수: { load, day } } } 로 둔다.
export const RECOVER_DAYS = 3;
const FULL_PITCHES = 80;          // 이만큼 던지면 피로 가득

export function loadNow(c, id) {
  const f = c.fatigue && c.fatigue[id];
  if (!f) return 0;
  return Math.max(0, f.load - (c.day - f.day) / RECOVER_DAYS);
}
export const daysToRecover = load => Math.ceil(load * RECOVER_DAYS - 1e-9);

// 끝난 경기 기록에서 우리 팀 투수가 던진 공 수를 세어 피로를 쌓는다 (day는 아직 안 올린 '경기한 날')
export function fatigueAfterGame(c, log, teamId) {
  const n = {};
  for (const e of log) if (e.pitcherId.startsWith(teamId + '-')) n[e.pitcherId] = (n[e.pitcherId] || 0) + (e.pitches || []).length;
  const fatigue = { ...(c.fatigue || {}) };
  for (const [id, cnt] of Object.entries(n)) {
    const load = Math.min(1, Math.max(0.15, cnt / FULL_PITCHES));
    fatigue[id] = { load: Math.min(1, Math.max(loadNow(c, id), load)), day: c.day };
  }
  // 다 회복한 기록은 치운다
  for (const id of Object.keys(fatigue)) if (!n[id] && loadNow({ ...c, fatigue }, id) <= 0) delete fatigue[id];
  return fatigue;
}

// 지친 만큼 능력이 떨어진 팀 (경기용): 체력 -40%, 제구 -12%, 구속 -2%가 최대
export function applyFatigue(team, c) {
  return {
    ...team,
    pitchers: team.pitchers.map(p => {
      const L = loadNow(c, p.id);
      if (!L) return p;
      return { ...p, stamina: Math.round(p.stamina * (1 - 0.4 * L)), control: Math.round(p.control * (1 - 0.12 * L)), velo: Math.round(p.velo * (1 - 0.02 * L)) };
    }),
  };
}
