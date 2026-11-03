// 투구 모델: 구종, 타이밍 게이지, 피로, 제구, 구속
// 좌표: 스트라이크존 정규화 좌표(포수 시점). x ∈ [-1,1] 왼→오, y ∈ [-1,1] 아래→위.
import { CONFIG } from '../config.js';
import { randNormal } from './rng.js';

export const PITCH_TYPES = {
  FB: { name: '직구', speedMul: 1.00, breakX: 0.00, breakY: 0.10 },
  SI: { name: '투심', speedMul: 0.97, breakX: 0.25, breakY: -0.15 },
  CT: { name: '커터', speedMul: 0.94, breakX: -0.20, breakY: 0.00 },
  SL: { name: '슬라이더', speedMul: 0.88, breakX: -0.45, breakY: -0.15 },
  CU: { name: '커브', speedMul: 0.80, breakX: -0.20, breakY: -0.60 },
  CH: { name: '체인지업', speedMul: 0.85, breakX: 0.25, breakY: -0.35 },
  FO: { name: '포크', speedMul: 0.86, breakX: 0.00, breakY: -0.55 },
}; // breakX는 우투수 기준, 좌투수는 부호 반대

export const BALL_R = 0.17;   // 공 반지름(존 가로 반폭 기준)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function gaugePos(elapsedMs, periodMs) {
  const t = (((elapsedMs % periodMs) + periodMs) % periodMs) / periodMs;
  return t < 0.5 ? t * 2 : 2 - t * 2;
}
export const gaugeError = pos => Math.abs(pos - 0.5) * 2;
export const fatigue = (pitchCount, stamina) => clamp((pitchCount - stamina * 0.5) / (stamina * 0.9), 0, 1);
export const energy = (pitchCount, stamina) => 1 - clamp(pitchCount / (stamina * 1.4), 0, 1);
export const sweetWidth = (control, f) => (0.07 + control / 100 * 0.12) * (1 - 0.6 * f);
export const gaugePeriod = f => CONFIG.GAUGE_PERIOD_MS * (1 - 0.25 * f);
export const isStrike = p => Math.abs(p.x) <= 1 + BALL_R && Math.abs(p.y) <= 1 + BALL_R / 1.2;

export function computePitch({ pitcher, type, target, gaugePos: gpos, pitchCount, rng }) {
  const f = fatigue(pitchCount, pitcher.stamina);
  const sweet = sweetWidth(pitcher.control, f);
  const err = gaugeError(gpos);
  const onTarget = err <= sweet;
  const t = PITCH_TYPES[type];
  const speedKmh = Math.floor(pitcher.velo * t.speedMul * (onTarget ? 1 : 0.96) * (1 - 0.07 * f) * (1 - 0.01 * rng()));
  const spread = (0.06 + (1 - pitcher.control / 100) * 0.25) * (onTarget ? 1 + (err / sweet) * 0.8 : 2.5 + 4 * err) * (1 + 1.2 * f);
  const plate = { x: target.x + spread * randNormal(rng), y: target.y + spread * randNormal(rng) };
  const sign = pitcher.throws === 'L' ? -1 : 1;
  return {
    type, speedKmh, plate, err, sweet, onTarget,
    breakX: t.breakX * sign, breakY: t.breakY, throws: pitcher.throws,
    travelMs: CONFIG.MOUND_DISTANCE_M / (speedKmh / 3.6) * 1000 * CONFIG.SPEED_SCALE,
    isStrike: isStrike(plate),
  };
}

// 손가락 위치(화면 좌표) → 존 정규화 좌표. 조준점은 손가락보다 liftPx 위에 둔다.
// mirror=true면 투수 시점(좌우 반전).
export function aimFromTouch(touch, zoneRect, liftPx, mirror = false) {
  const cx = zoneRect.left + zoneRect.width / 2, cy = zoneRect.top + zoneRect.height / 2;
  const x = (touch.x - cx) / (zoneRect.width / 2) * (mirror ? -1 : 1);
  const y = -((touch.y - liftPx) - cy) / (zoneRect.height / 2);
  return { x: clamp(x, -1.6, 1.6) + 0, y: clamp(y, -1.6, 1.6) + 0 };
}
