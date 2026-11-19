// 경기 중 '의미 있는 순간' 찾기: 클러치 상황, 끝내기·역전, 연속 삼진·3구 삼진·연속 홈런 같은 기록, 개인 최고 기록.
// 모두 경기 상태(game)·경기 기록(log)만 보고 계산한다(화면·시계·저장소를 읽지 않는다)
import { playerLine } from './growth.js';
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

// 방금 끝난 타석(log의 마지막)으로 생긴 기록. mine = 우리 팀 쪽.
// [{ kind, big, unit, label, sub, en, who, pitcherId?, batterId?, today? }] (kind: 'k' | 'bat'). big+unit은 숫자 타일, label은 제목, sub는 한 줄 설명, who는 얼굴을 보일 선수
// 우리 투수: 무결점 이닝(공 9개로 삼진 3개), 3구 삼진, 3타자 이상 연속 삼진, 한 투수의 그 경기 탈삼진 5·7·10·12·15개
// 우리 타자: 2타자 이상 연속 홈런, 한 타자 그 경기 2홈런 이상, 4타자 이상 연속 안타, 4안타 이상, 사이클링 히트
export const K_MILESTONES = [5, 7, 10, 12, 15];
const NOT_AB = ['WALK', 'HBP', 'SAC_FLY', 'SAC_BUNT'];
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
    const p = { kind: 'k', who: e.pitcherId, pitcherId: e.pitcherId };
    const half = e.inning != null ? log.filter(q => q.inning === e.inning && q.half === e.half) : [];
    const three = q => q.event === 'STRIKEOUT' && q.pitches && q.pitches.length === 3;
    if (half.length === 3 && half.every(q => three(q) && q.pitcherId === e.pitcherId))
      out.push({ ...p, big: '9', unit: '구', label: '무결점 이닝', sub: `${e.inning}회를 공 9개, 삼진 3개로`, en: 'IMMACULATE INNING' });
    else if (ks >= 3) out.push({ ...p, big: String(ks), unit: '연속', label: `${ks}타자 연속 삼진`, sub: `오늘 탈삼진 ${today}개`, en: 'STRIKEOUT STREAK' });
    else if (three(e)) out.push({ ...p, big: '3', unit: '구', label: '3구 삼진', sub: `오늘 탈삼진 ${today}개`, en: 'THREE PITCH STRIKEOUT' });
    if (K_MILESTONES.includes(today)) {
      const next = K_MILESTONES.find(k => k > today);
      out.push({ ...p, big: String(today), unit: 'K', label: `오늘 ${today}탈삼진`, sub: `${e.inning != null ? `${e.inning}회까지` : '오늘'}${next ? ` · 다음 목표 ${next}K` : ' · 대기록!'}`, en: 'STRIKEOUTS TODAY', today });
    }
    return out;
  }
  if (!HIT.includes(e.event)) return out;
  const mineToday = log.filter(q => q.batterId === e.batterId), hits = mineToday.filter(q => HIT.includes(q.event)).map(q => q.event);
  const ab = mineToday.filter(q => !NOT_AB.includes(q.event)).length;
  const b = { kind: 'bat', who: e.batterId };
  if (e.event === 'HR') {
    const hrs = run(q => q.event === 'HR'), today = hits.filter(h => h === 'HR').length, team = log.filter(q => batSide(q) === mine && q.event === 'HR').length;
    if (hrs >= 2) out.push({ ...b, big: String(hrs), unit: '연속', label: `${hrs}타자 연속 홈런`, sub: `오늘 팀 홈런 ${team}개`, en: hrs === 2 ? 'BACK TO BACK' : 'BACK TO BACK TO BACK' });
    else if (today >= 2) out.push({ ...b, batterId: e.batterId, big: String(today), unit: '홈런', label: `오늘 ${today}홈런`, sub: `${ab}타수 ${hits.length}안타`, en: 'MULTI HOMER GAME' });
  }
  if (HIT.every(h => hits.includes(h)) && hits.filter(h => h === e.event).length === 1) out.push({ ...b, batterId: e.batterId, big: '4', unit: '/4', label: '사이클링 히트', sub: '단타·2루타·3루타·홈런', en: 'HIT FOR THE CYCLE' });
  else if (hits.length >= 4) out.push({ ...b, batterId: e.batterId, big: String(hits.length), unit: '안타', label: `오늘 ${hits.length}안타`, sub: `${ab}타수 ${hits.length}안타`, en: 'MULTI HIT GAME' });
  const streak = run(q => HIT.includes(q.event));
  if (streak >= 4 && !out.some(o => o.label.includes('연속'))) out.push({ ...b, big: String(streak), unit: '연속', label: `${streak}타자 연속 안타`, sub: `${e.inning != null ? `${e.inning}회 ` : ''}쉬지 않는 공격`, en: 'HIT PARADE' });
  return out;
}

// 퀄리티스타트: 우리 선발이 내려가지 않고 6회 수비를 마쳤고, 6회까지 3점 이하만 줬다. before/after = 방금 공 하나 전후 경기 상태
// 6회 수비가 끝나는 그 공에서만 { kind, big, label, ... }, 아니면 null. 6회보다 짧은 경기는 없다
export function qualityStart(log, mine, before, after, innings) {
  if (innings < 6 || !before || before.inning !== 6 || batSide(before) === mine) return null;
  if (!after.over && after.inning === before.inning && after.half === before.half) return null;   // 아직 6회 수비 중
  const opp = log.filter(e => batSide(e) !== mine);
  if (!opp.length) return null;
  const sp = opp[0].pitcherId;
  if (opp.some(e => e.pitcherId !== sp)) return null;                 // 선발이 한 번이라도 내려갔다
  const runs = opp.reduce((a, e) => a + (e.runs || 0), 0);
  if (runs > 3) return null;
  const k = opp.filter(e => e.event === 'STRIKEOUT').length;
  return { kind: 'k', who: sp, pitcherId: sp, big: 'QS', unit: '', label: '퀄리티스타트 달성', sub: `6이닝 ${runs}실점 · 탈삼진 ${k}개`, en: 'QUALITY START' };
}

// 시즌 이정표(육성모드 내 선수): 시즌 기록 + 오늘 기록이 방금 타석으로 이정표를 넘었다
// season = { bat, pit, year, game }(bat·pit은 오늘 전까지의 시즌 기록). 넘은 이정표마다 하나씩
export const SEASON_STEPS = { hr: [10, 20, 30, 40, 50, 60, 70], h: [50, 100, 150, 200], rbi: [50, 100, 150], so: [50, 100, 150, 200, 250, 300] };
const STEP_NAME = { hr: ['홈런', '호'], h: ['안타', '안타'], rbi: ['타점', '타점'], so: ['탈삼진', 'K'] };
export function seasonMilestones(log, id, season) {
  const e = log && log[log.length - 1];
  if (!e || !season || (e.batterId !== id && e.pitcherId !== id)) return [];
  const line = l => playerLine({}, l.filter(q => q.batterId === id || q.pitcherId === id));
  const now = line(log), was = line(log.slice(0, -1)), out = [];
  const add = (side, key) => {
    const base = (season[side] && season[side][key]) || 0;
    const a = base + ((was[side][id] || {})[key] || 0), b = base + ((now[side][id] || {})[key] || 0);
    const hit = SEASON_STEPS[key].filter(v => a < v && v <= b).pop();
    if (!hit) return;
    const [name, unit] = STEP_NAME[key];
    out.push({ kind: 'season', who: id, big: String(hit), unit, label: `시즌 ${hit}${name}`, sub: `${season.year ? `${season.year} 시즌 ` : ''}${season.game ? `${season.game}경기째` : ''}`.trim(), en: 'SEASON MILESTONE' });
  };
  if (e.batterId === id) { add('bat', 'hr'); add('bat', 'h'); add('bat', 'rbi'); }
  if (e.pitcherId === id) add('pit', 'so');
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
