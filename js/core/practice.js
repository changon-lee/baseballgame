// 연습장: 투구 연습 / 타격 연습. 정해진 공 수를 채우면 고른 선수의 고른 능력치에 경험치가 쌓이고, 12가 모이면 +1 (성장과 같은 규칙).
// 하루(= 경기 한 번이 지나감)에 할 수 있는 연습 횟수가 정해져 있다 → 경기를 하면 다시 채워진다.
import { gainXp } from './growth.js';

export const PRACTICE = {
  goal: { pitch: 5, bat: 10 },   // 한 번의 연습 공 수: 투구 5구, 타격 10번
  perDay: 2,         // 하루 연습 횟수
  ptsPerXp: { pitch: 1.5, bat: 3 },   // 연습 점수 이만큼 = 경험치 1 (공 수가 적은 투구가 점수당 더 값지다)
};
export const PRACTICE_STATS = { pitch: ['velo', 'control', 'stamina'], bat: ['power', 'contact', 'eye'] };

export const practiceLeft = c => PRACTICE.perDay - (c.practice && c.practice.day === c.day ? c.practice.used : 0);

// 공 하나의 연습 점수. 잘 던질수록 / 잘 칠수록 많이 쌓인다
// 투구 연습(타자 없음): 노린 곳에 얼마나 가깝게 꽂혔나만 본다. 스트라이크·볼은 따지지 않는다
// 거리는 존 좌표(1 = 존 가로 반폭). 공 하나 안쪽이면 완벽
export const CONTROL_GRADES = [
  { q: 3, max: 0.17, pts: 1.5, label: '제구 완벽!' },
  { q: 2, max: 0.4, pts: 1, label: '제구 좋아요' },
  { q: 1, max: 0.8, pts: 0.5, label: '조금 빗나갔어요' },
  { q: 0, max: Infinity, pts: 0.2, label: '제구 실패' },
];
export function controlGrade(pitch, target) {
  const d = Math.hypot(pitch.plate.x - target.x, pitch.plate.y - target.y);
  return { ...CONTROL_GRADES.find(g => d <= g.max), d };
}
export function swingPts(contact) {                         // contact: 안 쳤으면 null
  if (!contact) return 0.3;
  if (contact.kind === 'MISS') return 0.2;
  if (contact.kind === 'FOUL') return 0.6;
  return 0.5 + 1.5 * contact.quality;
}

// 연습 결과를 커리어에 반영. 오늘 남은 횟수가 없거나 능력치가 안 맞으면 아무것도 안 한다
export function applyPractice(c, { kind, playerId, stat, pts }) {
  if (practiceLeft(c) <= 0 || !(PRACTICE_STATS[kind] || []).includes(stat) || !(pts > 0)) return { career: c, ups: [], xp: 0 };
  const xp = pts / PRACTICE.ptsPerXp[kind];
  const { growth, ups } = gainXp(c.growth, playerId, stat, xp);
  const used = (c.practice && c.practice.day === c.day ? c.practice.used : 0) + 1;
  return { career: { ...c, growth, practice: { day: c.day, used } }, ups, xp };
}
