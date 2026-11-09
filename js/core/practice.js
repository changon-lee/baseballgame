// 연습장: 투구 연습 / 타격 연습. 정해진 공 수를 채우면 고른 선수의 고른 능력치에 경험치가 쌓이고, 12가 모이면 +1 (성장과 같은 규칙).
// 하루(= 경기 한 번이 지나감)에 할 수 있는 연습 횟수가 정해져 있다 → 경기를 하면 다시 채워진다.
import { gainXp } from './growth.js';

export const PRACTICE = {
  goal: 20,          // 한 번의 연습 공 수
  perDay: 2,         // 하루 연습 횟수
  ptsPerXp: 6,       // 연습 점수 6 = 경험치 1
};
export const PRACTICE_STATS = { pitch: ['velo', 'control', 'stamina'], bat: ['power', 'contact', 'eye'] };

export const practiceLeft = c => PRACTICE.perDay - (c.practice && c.practice.day === c.day ? c.practice.used : 0);

// 공 하나의 연습 점수. 잘 던질수록 / 잘 칠수록 많이 쌓인다
export function pitchPts(pitch) {
  if (!pitch.onTarget) return 0.4;                          // 제구 실패
  return pitch.err < pitch.sweet * 0.35 ? 1.5 : 1;          // 완벽 / 성공
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
  const xp = pts / PRACTICE.ptsPerXp;
  const { growth, ups } = gainXp(c.growth, playerId, stat, xp);
  const used = (c.practice && c.practice.day === c.day ? c.practice.used : 0) + 1;
  return { career: { ...c, growth, practice: { day: c.day, used } }, ups, xp };
}
