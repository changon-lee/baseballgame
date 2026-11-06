// 타구질 → 결과 이벤트
import { CONFIG } from '../config.js';

// 결과 이벤트와 타구 종류(뜬공/땅볼)를 함께 돌려준다. 타구 화면이 fly를 쓴다.
// lift: 배트가 공 아래를 쳤으면 +(뜬공이 많다), 위를 쳤으면 -(땅볼이 많다)
export function battedBallInfo({ quality: q, power, outs, runnerOnFirst, runnerOnThird, rng, lift = 0 }) {
  const B = CONFIG.BALANCE;
  const pHR = q > B.HR_Q ? (q - B.HR_Q) / (1 - B.HR_Q) * (B.HR_BASE + power / 100 * B.HR_POWER) : 0;
  if (rng() < pHR) return { event: 'HR', fly: true };
  if (rng() < B.HIT_BASE + q * B.HIT_Q) {
    const r = rng();
    if (r < 0.03) return { event: 'TRIPLE', fly: true };
    if (r < 0.03 + q * 0.25 * (0.5 + power / 100)) return { event: 'DOUBLE', fly: true };
    return { event: 'SINGLE', fly: rng() < 0.5 + lift * 0.3 };
  }
  const fly = rng() < 0.5 + lift * 0.3;
  if (fly && runnerOnThird && outs < 2) return { event: 'SAC_FLY', fly: true };
  if (!fly && runnerOnFirst && outs < 2 && rng() < 0.35) return { event: 'DOUBLE_PLAY', fly: false };
  return { event: 'OUT', fly };
}

export const battedBall = args => battedBallInfo(args).event;
