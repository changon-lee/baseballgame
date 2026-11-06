// 타구질 → 결과 이벤트
import { CONFIG } from '../config.js';

// 결과 이벤트와 타구 종류(뜬공/땅볼)를 함께 돌려준다. 타구 화면이 fly를 쓴다.
// lift: 배트가 공 아래를 쳤으면 +(뜬공이 많다), 위를 쳤으면 -(땅볼이 많다)
// 돌려주는 것: { event, fly, style? } — style은 같은 결과의 다른 장면(dive 다이빙 캐치, wall 펜스 앞 점프 캐치, liner 직선타,
//   home_safe 홈 승부 세이프, fumble/throw 포구·송구 실책, bloop 텍사스 안타, pop 내야 뜬공, foul 파울플라이)
export function battedBallInfo({ quality: q, power, outs, runnerOnFirst, runnerOnSecond = false, runnerOnThird, rng, lift = 0 }) {
  const B = CONFIG.BALANCE;
  const pHR = q > B.HR_Q ? (q - B.HR_Q) / (1 - B.HR_Q) * (B.HR_BASE + power / 100 * B.HR_POWER) : 0;
  if (rng() < pHR) return { event: 'HR', fly: true };
  if (rng() < B.HIT_BASE + q * B.HIT_Q) {
    const r = rng();
    if (r < 0.03) return { event: 'TRIPLE', fly: true };
    if (r < 0.03 + q * 0.25 * (0.5 + power / 100)) return { event: 'DOUBLE', fly: true };
    const fly = rng() < 0.5 + lift * 0.3;
    if (!fly && rng() < 0.2) return { event: 'INFIELD_SINGLE', fly: false };          // 느린 땅볼을 1루에서 살았다
    if (runnerOnSecond) {                                                             // 2루 주자가 홈으로: 홈 승부
      // 2아웃에 3루 주자가 있으면 홈 아웃이 득점 판정을 꼬이게 하니 그때만 아웃은 뺀다
      const h = rng();
      if (h < 0.2 && (outs < 2 || !runnerOnThird)) return { event: 'SINGLE_HOME_OUT', fly };
      if (h < 0.45) return { event: 'SINGLE', fly, style: 'home_safe' };
    }
    if (fly && rng() < 0.3 + Math.max(0, lift) * 0.2) return { event: 'SINGLE', fly, style: 'bloop' };   // 내야·외야 사이에 툭
    return { event: 'SINGLE', fly };
  }
  if (rng() < B.ERROR_RATE) return { event: 'ERROR', fly: false, style: rng() < 0.65 ? 'fumble' : 'throw' };
  if (rng() < 0.16) {                                                                 // 직선타: 내야수 정면
    if ((runnerOnFirst || runnerOnSecond) && outs < 2 && rng() < 0.3) return { event: 'LINE_DP', fly: false, style: 'liner' };
    return { event: 'OUT', fly: false, style: 'liner' };
  }
  const fly = rng() < 0.5 + lift * 0.3;
  // 공 밑을 많이 쳐서 높이 뜨면 내야 뜬공(주자는 못 들어온다)
  if (fly && rng() < 0.18 + Math.max(0, lift) * 0.35) return { event: 'OUT', fly: true, style: 'pop' };
  if (fly && runnerOnThird && outs < 2) return { event: 'SAC_FLY', fly: true };
  if (!fly && runnerOnFirst && outs < 2 && rng() < 0.35) return { event: 'DOUBLE_PLAY', fly: false };
  if (fly) {                                                                          // 잘 맞은 뜬공을 호수비로
    const s = rng();
    if (q > 0.62 && s < 0.14) return { event: 'OUT', fly: true, style: 'wall' };
    if (s < 0.3) return { event: 'OUT', fly: true, style: 'dive' };
    if (s < 0.45) return { event: 'OUT', fly: true, style: 'foul' };                   // 파울 지역까지 쫓아가서
  }
  return { event: 'OUT', fly };
}

export const battedBall = args => battedBallInfo(args).event;
