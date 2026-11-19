// 경기 중 '의미 있는 순간' 찾기: 클러치 상황, 끝내기·역전, 연속 삼진·3구 삼진·연속 홈런 같은 기록, 개인 최고 기록.
// 모두 경기 상태(game)·경기 기록(log)만 보고 계산한다(화면·시계·저장소를 읽지 않는다)
const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const batSide = e => (e.half === 'top' ? 'away' : 'home');
const bothSides = { away: 'home', home: 'away' };

// 클러치: 경기 막판(마지막 두 이닝·연장, 짧은 경기는 3회부터)에 공격 팀이 지거나 비기고 있고, 동점(역전) 주자가 누상이나 타석에 있다.
// 막판이 아니어도 6회부터 2아웃 만루나 2아웃 풀카운트 득점권이면 클러치. 점수 차가 크면 아니다
export function clutchOf(game, innings) {
  if (!game || game.over) return false;
  const bat = game.half === 'top' ? 'away' : 'home', diff = game.score[bat] - game.score[bothSides[bat]];
  const on = game.bases.filter(Boolean).length, late = game.inning >= Math.max(3, innings - 1);   // 짧은 경기도 3회부터
  if (late && diff <= 0 && -diff <= on + 1 && (on > 0 || game.inning >= innings)) return true;
  if (game.inning >= 6 && game.outs === 2 && Math.abs(diff) <= 3) {
    if (on === 3) return true;
    if (game.balls === 3 && game.strikes === 2 && (game.bases[1] || game.bases[2])) return true;
  }
  return false;
}

// 점수가 바뀐 공 하나: 우리 팀(mine)이 뒤지다 앞섰으면 역전, 그 공으로 경기가 끝나 이겼으면 끝내기(우리가 친 말 공격)
export function scoreSwing(before, after, mine, half) {
  const opp = bothSides[mine];
  const walkoff = !!after.over && after.result === mine && half === 'bottom' && mine === 'home' && before.score[mine] <= before.score[opp];
  if (walkoff) return 'walkoff';
  if (before.score[mine] < before.score[opp] && after.score[mine] > after.score[opp]) return 'comeback';
  return null;
}

// 방금 끝난 타석(log의 마지막)으로 생긴 기록. mine = 우리 팀 쪽. [{ big, label, kind }] (kind: 'k' | 'bat')
// 우리 투수: 3구 삼진, 3타자 이상 연속 삼진, 한 투수의 그 경기 탈삼진 5·7·10·12·15개
// 우리 타자: 2타자 이상 연속 홈런, 한 타자 그 경기 2홈런 이상, 4타자 이상 연속 안타, 4안타 이상, 사이클링 히트
export const K_MILESTONES = [5, 7, 10, 12, 15];
export function highlightsOf(log, mine) {
  const e = log && log[log.length - 1];
  if (!e) return [];
  const out = [], ours = batSide(e) === mine;
  // 같은 쪽이 친 타석만 뒤에서부터 센다(반 이닝이 바뀌어도 이어진다: 연속 삼진·연속 안타는 이닝을 넘어 이어진다)
  const run = pred => { let n = 0; for (let i = log.length - 1; i >= 0; i--) { if (batSide(log[i]) !== batSide(e)) continue; if (!pred(log[i])) break; n++; } return n; };
  if (!ours) {
    if (e.event !== 'STRIKEOUT') return out;
    const ks = run(q => q.event === 'STRIKEOUT');
    const today = log.filter(q => q.pitcherId === e.pitcherId && q.event === 'STRIKEOUT').length;
    if (ks >= 3) out.push({ kind: 'k', big: String(ks), label: `${ks}타자 연속 삼진` });
    else if (e.pitches && e.pitches.length === 3) out.push({ kind: 'k', big: '3구', label: '3구 삼진!' });
    if (K_MILESTONES.includes(today)) out.push({ kind: 'k', big: `${today}K`, label: `오늘 ${today}탈삼진`, pitcherId: e.pitcherId, today });
    return out;
  }
  if (!HIT.includes(e.event)) return out;
  const mineToday = log.filter(q => q.batterId === e.batterId && HIT.includes(q.event)), hits = mineToday.map(q => q.event);
  if (e.event === 'HR') {
    const hrs = run(q => q.event === 'HR'), today = hits.filter(h => h === 'HR').length;
    if (hrs >= 2) out.push({ kind: 'bat', big: String(hrs), label: `${hrs}타자 연속 홈런` });
    else if (today >= 2) out.push({ kind: 'bat', big: String(today), label: `오늘 ${today}홈런`, batterId: e.batterId });
  }
  if (HIT.every(h => hits.includes(h)) && hits.filter(h => h === e.event).length === 1) out.push({ kind: 'bat', big: '사이클', label: '사이클링 히트!', batterId: e.batterId });
  else if (hits.length >= 4) out.push({ kind: 'bat', big: String(hits.length), label: `오늘 ${hits.length}안타`, batterId: e.batterId });
  const streak = run(q => HIT.includes(q.event));
  if (streak >= 4 && !out.some(o => o.label.includes('연속'))) out.push({ kind: 'bat', big: String(streak), label: `${streak}타자 연속 안타` });
  return out;
}

// 개인 최고 기록(저장소에 남긴 값 rec와 비교). 이전 기록이 있고 그걸 넘었을 때만 '경신'이다(처음 세운 값은 조용히 남긴다)
// rec = { velo: { id: km }, hr: { id: m }, k: { id: 개수 } }. 돌려주는 값: { rec(새 기록표), best: null | { kind, value, prev } }
export function bestOf(rec, kind, id, value) {
  const table = { ...(rec && rec[kind]) }, prev = table[id];
  if (!(value > 0) || (prev != null && value <= prev)) return { rec, best: null };
  table[id] = value;
  return { rec: { ...rec, [kind]: table }, best: prev != null ? { kind, value, prev } : null };
}
