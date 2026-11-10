// 컴퓨터 투수의 공 선택, 컴퓨터 타자의 스윙
import { CONFIG } from '../config.js';
import { randNormal } from './rng.js';
import { ZONE_K, BALL_R } from './pitch.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EDGE = ZONE_K + BALL_R;        // 공이 존에 걸치는 끝(isStrike와 같다)

// strikeOnly: 타격 연습용. 늘 스트라이크존 안을 노린다
export function cpuChoosePitch({ pitcher, balls, strikes, rng, strikeOnly = false }) {
  const ws = pitcher.pitches.map(k => (k === 'FB' || k === 'SI' ? 3 : 1.5));
  let r = rng() * ws.reduce((a, c) => a + c, 0), i = 0;
  while ((r -= ws[i]) > 0 && i < ws.length - 1) i++;
  const inZone = strikeOnly || rng() < CONFIG.BALANCE.CPU_ZONE + (balls >= 3 ? 0.25 : 0) - (strikes === 2 ? 0.2 : 0);
  let target;
  if (inZone) target = { x: (rng() * 2 - 1) * 0.85 * ZONE_K, y: (rng() * 2 - 1) * 0.85 * ZONE_K };
  else { const a = rng() * Math.PI * 2, rr = 1.2 + rng() * 0.4; target = { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; }
  const gaugePos = 0.5 + randNormal(rng) * 0.05 * (1.3 - pitcher.control / 100);
  return { type: pitcher.pitches[i], target, gaugePos };
}

// 볼카운트에 따른 타자 성향: zone = 존 안 공에 휘두르는 배율, chase = 유인구 쫓는 배율, fb/off = 직구·변화구 타이밍 흔들림 배율
//  - 0-0: 초구는 조금 지켜본다
//  - 타자 카운트(2-0, 3-1, 2-1): 직구를 노리고 크게 휘두른다(직구 타이밍은 좋아지고 변화구엔 속는다), 유인구는 덜 쫓는다
//  - 3-0: 거의 기다린다(힘센 타자만 가끔 "치라" 사인)
//  - 2스트라이크: 짧게 맞히는 스윙(타이밍이 덜 흔들린다)
export const COUNT_STYLE = {
  '0-0': { zone: 0.85, chase: 0.9 },
  '2-0': { zone: 1.08, chase: 0.6, fb: 0.88, off: 1.18 },
  '2-1': { zone: 1.05, chase: 0.8, fb: 0.93, off: 1.12 },
  '3-1': { zone: 1.1, chase: 0.55, fb: 0.86, off: 1.2 },
  '3-0': { zone: 0.3, chase: 0.25, fb: 0.86, off: 1.2 },
};
const TWO_STRIKE_SIGMA = 0.9;
const FAST = new Set(['FB', 'SI', 'CT']);

// prev = 이번 타석에서 바로 전에 던진 공 { k: 구종, v: 구속 } (없으면 null)
//  - 구석 스트라이크: 존 끝에 걸칠수록 덜 휘두른다(루킹 스트라이크)
//  - 유인구: 존 밖 변화구는 휘는 만큼, 존에 가까울수록 더 쫓는다
//  - 완급 조절: 바로 전 공과 구속 차이가 클수록 타이밍이 흔들린다. 같은 공이 이어지면 눈에 익는다
export function cpuSwing({ batter, pitch, balls, strikes, rng, prev = null }) {
  const B = CONFIG.BALANCE;
  const m = Math.max(Math.abs(pitch.plate.x), Math.abs(pitch.plate.y));
  const brk = Math.abs(pitch.breakX) + Math.abs(pitch.breakY);
  let ps;
  if (pitch.isStrike) ps = B.SWING_ZONE * (1 - B.CORNER_TAKE * clamp((m - 0.45) / (EDGE - 0.45), 0, 1)) + strikes * 0.1;
  else if (m <= 1.6) ps = B.CHASE * (1 - batter.eye / 150) * (1 + B.CHASE_BREAK * brk) * (1 + 0.6 * clamp((1.35 - m) / (1.35 - EDGE), 0, 1)) + strikes * 0.12;
  else ps = 0.04;
  const cs = COUNT_STYLE[`${balls}-${strikes}`] || {};
  const green = balls === 3 && strikes === 0 && batter.power >= 80;   // 3-0 강타자는 노려 친다
  ps *= pitch.isStrike ? (green ? 0.7 : cs.zone ?? 1) : cs.chase ?? 1;
  if (rng() >= ps) return { swing: false, timingDiffMs: 0 };
  let sigma = B.SIGMA_BASE + (100 - batter.contact) * 0.5 + Math.max(0, pitch.speedKmh - 135) + brk * 35;
  if (prev && prev.v) {
    const dv = Math.abs(pitch.speedKmh - prev.v);
    sigma += B.SPEED_MIX * dv;
    if (prev.k === pitch.type && dv < 4) sigma -= B.SAME_PITCH;
  }
  sigma *= (FAST.has(pitch.type) ? cs.fb : cs.off) ?? 1;
  if (strikes === 2) sigma *= TWO_STRIKE_SIGMA;
  return { swing: true, timingDiffMs: randNormal(rng) * sigma };
}
