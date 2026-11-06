// 컴퓨터 투수의 공 선택, 컴퓨터 타자의 스윙
import { CONFIG } from '../config.js';
import { randNormal } from './rng.js';
import { ZONE_K, BALL_R } from './pitch.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EDGE = ZONE_K + BALL_R;        // 공이 존에 걸치는 끝(isStrike와 같다)

export function cpuChoosePitch({ pitcher, balls, strikes, rng }) {
  const ws = pitcher.pitches.map(k => (k === 'FB' || k === 'SI' ? 3 : 1.5));
  let r = rng() * ws.reduce((a, c) => a + c, 0), i = 0;
  while ((r -= ws[i]) > 0 && i < ws.length - 1) i++;
  const inZone = rng() < CONFIG.BALANCE.CPU_ZONE + (balls >= 3 ? 0.25 : 0) - (strikes === 2 ? 0.2 : 0);
  let target;
  if (inZone) target = { x: (rng() * 2 - 1) * 0.85 * ZONE_K, y: (rng() * 2 - 1) * 0.85 * ZONE_K };
  else { const a = rng() * Math.PI * 2, rr = 1.2 + rng() * 0.4; target = { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; }
  const gaugePos = 0.5 + randNormal(rng) * 0.05 * (1.3 - pitcher.control / 100);
  return { type: pitcher.pitches[i], target, gaugePos };
}

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
  if (rng() >= ps) return { swing: false, timingDiffMs: 0 };
  let sigma = B.SIGMA_BASE + (100 - batter.contact) * 0.5 + Math.max(0, pitch.speedKmh - 135) + brk * 35;
  if (prev && prev.v) {
    const dv = Math.abs(pitch.speedKmh - prev.v);
    sigma += B.SPEED_MIX * dv;
    if (prev.k === pitch.type && dv < 4) sigma -= B.SAME_PITCH;
  }
  return { swing: true, timingDiffMs: randNormal(rng) * sigma };
}
