// 번트와 도루(내가 칠 때 고르는 작전)
// 번트: 배트를 공 길에 대기만 하면 된다. 타이밍은 스윙보다 훨씬 너그럽고 배트 닿는 범위도 넓다.
//   맞히면 대개 희생번트(타자 아웃, 주자 한 베이스씩). 가끔 번트 안타, 앞 주자가 잡히는 야수 선택, 뜬공, 파울
// 도루: 다음 공에 주자가 뛴다. 공을 안 치거나 헛스윙이면 성공/실패가 갈린다(친 공·파울이면 없던 일)
import { batReach } from './batting.js';
import { stealRunners } from './rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const BUNT = { timing: 230, reach: 1.3 };

// 배트를 댄 곳과 공의 거리(0 = 배트 가운데, 1 = 닿는 끝). 번트는 배트를 눕혀 대고 있으니 스윙보다 넓다
function buntOffset(bat, plate, contact) {
  const { rx, ry } = batReach(contact, bat.level);
  return Math.hypot((plate.x - bat.x) / (rx * BUNT.reach), (plate.y - bat.y) / (ry * BUNT.reach));
}

// 돌려주는 것: decide()와 같은 모양 { event, contact, fly, style }
export function buntResult({ timingDiffMs, batter, pitch, bat, bases, rng }) {
  const m = Math.max(Math.abs(pitch.plate.x), Math.abs(pitch.plate.y));
  const e = bat ? buntOffset(bat, pitch.plate, batter.contact) : 0.3;
  const miss = { event: 'STRIKE', contact: { kind: 'MISS', quality: 0, pull: 0, bunt: true, aimMiss: e > 1 }, fly: false, style: null };
  if (e > 1 || Math.abs(timingDiffMs) > BUNT.timing || m > 1.5) return miss;
  // 번트 질: 배트 가운데에 댈수록, 존 안 공일수록, 컨택이 좋을수록
  const q = clamp(1 - e * 0.45 - Math.abs(timingDiffMs) / 500 - Math.max(0, m - 0.8) * 0.4 + (batter.contact - 50) / 250, 0, 1);
  const contact = { kind: 'INPLAY', quality: 0.15, pull: clamp(-timingDiffMs / 300, -1, 1), lift: 0, bunt: true };
  const r = rng();
  const pFoul = 0.14 + (1 - q) * 0.22, pPop = pFoul + 0.04 + (1 - q) * 0.08;
  if (r < pFoul) return { event: 'BUNT_FOUL', contact: { ...contact, kind: 'FOUL' }, fly: false, style: null };
  if (r < pPop) return { event: 'OUT', contact, fly: true, style: 'pop' };                    // 번트가 떠서 잡혔다(주자는 그대로)
  const s = rng(), anyone = bases.some(Boolean);
  if (!anyone) return s < 0.16 + q * 0.14 ? { event: 'BUNT_SINGLE', contact, fly: false, style: null } : { event: 'OUT', contact, fly: false, style: 'bunt' };
  if (s < 0.06 + q * 0.08) return { event: 'BUNT_SINGLE', contact, fly: false, style: null };
  if (s < 0.06 + q * 0.08 + 0.2 * (1 - q) + 0.04) return { event: 'BUNT_FC', contact, fly: false, style: null };
  return { event: 'SAC_BUNT', contact, fly: false, style: null };
}

// 도루 성공 확률: 2루 70%, 3루 62%쯤. 느린 공·바닥으로 떨어지는 공이면 더 잘 산다(포수가 던지기 어렵다), 빠른 공이면 덜
export function stealChance(bases, pitch) {
  const st = stealRunners(bases);
  if (!st) return 0;
  let p = st.lead === 0 ? 0.7 : 0.62;
  p += clamp((140 - pitch.speedKmh) / 100, -0.08, 0.1);
  if (pitch.plate.y < -0.9) p += 0.07;
  return clamp(p, 0.35, 0.9);
}
