// 타순, 저장/불러오기, 불펜
const key = team => 'baseball.lineup.' + team.id;

export function defaultLineup(team) {
  return { order: team.batters.slice(0, 9).map(b => b.id), starterId: team.pitchers.find(p => p.role === 'SP').id };
}

export function isValidLineup(team, l) {
  if (!l || !Array.isArray(l.order) || l.order.length !== 9) return false;
  if (new Set(l.order).size !== 9) return false;
  if (!l.order.every(id => team.batters.some(b => b.id === id))) return false;
  const sp = team.pitchers.find(p => p.id === l.starterId);
  return !!sp && sp.role === 'SP';
}

export function loadLineup(storage, team) {
  try {
    const raw = storage && storage.getItem(key(team));
    if (raw) {
      const l = JSON.parse(raw);
      if (isValidLineup(team, l)) return { order: [...l.order], starterId: l.starterId };
    }
  } catch (e) { /* 저장소 막힘 또는 손상 → 기본값 */ }
  return defaultLineup(team);
}

export function saveLineup(storage, team, lineup) {
  try { storage.setItem(key(team), JSON.stringify({ order: lineup.order, starterId: lineup.starterId })); return true; }
  catch (e) { return false; }
}

export function availableRelievers(team, usedIds, currentId) {
  return team.pitchers.filter(p => p.id !== currentId && !usedIds.has(p.id));
}
