// 경기 기록(log)으로 만드는 화면용 요약: 이닝별 점수표, 타자의 오늘 성적, 경기 MVP
import { playerLine } from './growth.js';

const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const sideOf = half => (half === 'top' ? 'away' : 'home');

// 이닝별 점수표. game = 지금 경기 상태(진행 중이면 아직 안 한 칸은 null, 끝내기로 안 한 9회말은 'X')
// 돌려주는 것: { n: 칸 수, away: [..], home: [..], R: { away, home }, H: { away, home } }
export function lineScore(log, game) {
  const n = Math.max(game.innings, game.inning);
  const row = () => Array(n).fill(null);
  const t = { away: row(), home: row() }, H = { away: 0, home: 0 };
  for (let i = 1; i <= n; i++) {
    const started = h => i < game.inning || (i === game.inning && (h === 'top' || game.half === 'bottom'));
    if (started('top')) t.away[i - 1] = 0;
    if (started('bottom')) t.home[i - 1] = 0;
  }
  for (const e of log || []) {
    const s = sideOf(e.half), i = e.inning - 1;
    if (i < 0 || i >= n) continue;
    t[s][i] = (t[s][i] || 0) + (e.runs || 0);
    if (HIT.includes(e.event)) H[s]++;
  }
  // 경기가 끝났는데 마지막 이닝 말 공격을 안 했다(홈팀이 이기고 있어서) → X
  if (game.over && game.half === 'top' && t.home[game.inning - 1] == null && game.inning >= game.innings) t.home[game.inning - 1] = 'X';
  return { n, away: t.away, home: t.home, R: { ...game.score }, H };
}

// 오늘 성적 한 줄: "2타수 1안타 1홈런 2타점" / 첫 타석이면 "오늘 첫 타석"
export function todayText(log, batterId) {
  const b = playerLine({}, (log || []).filter(e => e.batterId === batterId)).bat[batterId];
  if (!b) return '오늘 첫 타석';
  const parts = [`${b.ab}타수 ${b.h}안타`];
  if (b.hr) parts.push(`${b.hr}홈런`);
  if (b.rbi) parts.push(`${b.rbi}타점`);
  if (b.bb) parts.push(`${b.bb}볼넷`);
  return parts.join(' ');
}

// 경기 MVP: 이긴 팀(비기면 우리 팀)에서 가장 잘한 선수 한 명
// mine(id) = 우리 팀 선수인가, userSide = 우리 팀 쪽('home'/'away'), result = game.result
// 돌려주는 것: { id, kind: 'bat' | 'pit', text } 또는 null
export function gameMvp(log, { mine, userSide, result }) {
  const winMine = result === userSide || !['home', 'away'].includes(result);
  const pick = id => (winMine ? mine(id) : !mine(id));
  const line = playerLine({}, log || []);
  let best = null;
  const offer = (id, kind, score, text) => { if (pick(id) && (!best || score > best.score)) best = { id, kind, score, text }; };
  for (const [id, b] of Object.entries(line.bat)) {
    const score = b.h + b.d2 * 0.5 + b.d3 + b.hr * 2 + b.rbi * 0.8 + b.bb * 0.3;
    offer(id, 'bat', score, todayText(log, id));
  }
  for (const [id, p] of Object.entries(line.pit)) {
    const score = p.outs / 3 * 0.75 + p.so * 0.3 - p.r * 0.9 - (p.h + p.bb) * 0.2;
    const ip = `${Math.floor(p.outs / 3)}${p.outs % 3 ? ` ${p.outs % 3}/3` : ''}이닝`;
    offer(id, 'pit', score, `${ip} ${p.so}삼진 ${p.r}실점`);
  }
  return best && best.score > 0 ? { id: best.id, kind: best.kind, text: best.text } : null;
}
