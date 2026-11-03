// 스윙 판정: 타이밍 차이(ms) → 헛스윙/파울/인플레이 + 타구질
// timingDiffMs = 탭 시각 - 공 도착 시각 (음수 = 빠름). 이 모듈은 시계를 읽지 않는다.
import { CONFIG } from '../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const timingWindowMs = contact => 18 + contact * 0.3;

export function swingResult({ timingDiffMs, batter, pitch, rng }) {
  const B = CONFIG.BALANCE;
  const w = timingWindowMs(batter.contact);
  const m = Math.max(Math.abs(pitch.plate.x), Math.abs(pitch.plate.y));
  const d = Math.abs(timingDiffMs);
  if (d > w * 5 || m > 1.6) return { kind: 'MISS', quality: 0, pull: 0 };
  const quality = 1 - d / (w * 5)
    - Math.max(0, m - 0.6) * B.EDGE_PENALTY
    - (Math.abs(pitch.breakX) + Math.abs(pitch.breakY)) * B.BREAK_PENALTY;
  if (quality < B.WEAK_CONTACT) return { kind: rng() < 0.5 ? 'FOUL' : 'MISS', quality, pull: 0 };
  const pull = clamp(-timingDiffMs / (w * 3), -1, 1);
  if (Math.abs(pull) > 0.9) return { kind: 'FOUL', quality, pull };
  return { kind: 'INPLAY', quality, pull };
}
