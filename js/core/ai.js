// 컴퓨터 투수의 공 선택, 컴퓨터 타자의 스윙
import { CONFIG } from '../config.js';
import { randNormal } from './rng.js';

export function cpuChoosePitch({ pitcher, balls, strikes, rng }) {
  const ws = pitcher.pitches.map(k => (k === 'FB' || k === 'SI' ? 3 : 1.5));
  let r = rng() * ws.reduce((a, c) => a + c, 0), i = 0;
  while ((r -= ws[i]) > 0 && i < ws.length - 1) i++;
  const inZone = rng() < CONFIG.BALANCE.CPU_ZONE + (balls >= 3 ? 0.25 : 0) - (strikes === 2 ? 0.2 : 0);
  let target;
  if (inZone) target = { x: (rng() * 2 - 1) * 0.85, y: (rng() * 2 - 1) * 0.85 };
  else { const a = rng() * Math.PI * 2, rr = 1.3 + rng() * 0.35; target = { x: Math.cos(a) * rr, y: Math.sin(a) * rr }; }
  const gaugePos = 0.5 + randNormal(rng) * 0.05 * (1.3 - pitcher.control / 100);
  return { type: pitcher.pitches[i], target, gaugePos };
}

export function cpuSwing({ batter, pitch, balls, strikes, rng }) {
  const B = CONFIG.BALANCE;
  const m = Math.max(Math.abs(pitch.plate.x), Math.abs(pitch.plate.y));
  let ps;
  if (pitch.isStrike) ps = B.SWING_ZONE + strikes * 0.1;
  else if (m <= 1.6) ps = B.CHASE * (1 - batter.eye / 150) + strikes * 0.12;
  else ps = 0.04;
  if (rng() >= ps) return { swing: false, timingDiffMs: 0 };
  let sigma = B.SIGMA_BASE + (100 - batter.contact) * 0.5 + Math.max(0, pitch.speedKmh - 135)
    + (Math.abs(pitch.breakX) + Math.abs(pitch.breakY)) * 35;
  return { swing: true, timingDiffMs: randNormal(rng) * sigma };
}
