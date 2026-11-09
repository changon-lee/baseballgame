// 스윙 판정: 타이밍 차이(ms) + 배트를 댄 곳 → 헛스윙/파울/인플레이 + 타구질
// timingDiffMs = 스윙 시각 - 공 도착 시각 (음수 = 빠름). 이 모듈은 시계를 읽지 않는다.
// bat = { x, y, level }: 내가 칠 때 배트를 댄 곳(존 좌표). 공이 배트가 닿는 타원 밖으로 오면 헛스윙.
//   없으면(컴퓨터 타자) 위치는 따지지 않는다.
import { CONFIG } from '../config.js';
import { BALL_R } from './pitch.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const timingWindowMs = contact => 18 + contact * 0.3;
// 내가 칠 때(bat 있음)만: 이만큼 안쪽 차이는 정타로 본다. 폰은 화면·터치가 늦게 반영돼서(합쳐 두세 장) 사람이 맞출 수 있는 정확도가 이쯤이다
export const TIMING_GRACE_MS = 30;
// 배트가 공을 맞힐 수 있는 타원(존 좌표, 공 반지름 포함). 배트는 가로로 누워 있어 가로가 넓고, 컨택이 좋을수록 넓다.
// 난이도(level)마다 크기가 다르다: 쉬움 1배(컨택 50이면 존 가로의 3분의 2쯤), 보통 0.6배, 어려움 0.48배
export const BAT_SCALE = { easy: 1, normal: 0.6, hard: 0.48 };
export function batReach(contact, level = 'easy') {
  const k = BAT_SCALE[level] || 1;
  return { rx: (0.42 + contact * 0.003) * k + BALL_R, ry: (0.28 + contact * 0.002) * k + BALL_R };
}
// 배트를 댄 곳과 공의 거리: 0 = 배트 가운데, 1 = 타원 끝(넘으면 헛스윙). lift = 공이 배트보다 위(+, 뜬공 쪽)/아래(-, 땅볼 쪽)
export function batOffset(bat, plate, contact) {
  const { rx, ry } = batReach(contact, bat.level);
  const dx = (plate.x - bat.x) / rx, dy = (plate.y - bat.y) / ry;
  return { e: Math.hypot(dx, dy), lift: clamp(dy, -1, 1) };
}

export function swingResult({ timingDiffMs, batter, pitch, rng, bat = null }) {
  const B = CONFIG.BALANCE;
  const w = timingWindowMs(batter.contact);
  const m = Math.max(Math.abs(pitch.plate.x), Math.abs(pitch.plate.y));
  const d = Math.abs(timingDiffMs);
  const off = bat ? batOffset(bat, pitch.plate, batter.contact) : { e: 0, lift: 0 };
  if (off.e > 1) return { kind: 'MISS', quality: 0, pull: 0, aimMiss: true, lift: off.lift };   // 배트가 공 길에 없었다
  if (d > w * 5 || m > 1.6) return { kind: 'MISS', quality: 0, pull: 0 };
  const dq = bat ? Math.max(0, d - TIMING_GRACE_MS) : d;
  const quality = 1 - dq / (w * 5)
    - Math.max(0, m - 0.6) * B.EDGE_PENALTY
    - (Math.abs(pitch.breakX) + Math.abs(pitch.breakY)) * B.BREAK_PENALTY
    - off.e * off.e * B.AIM_PENALTY;
  const lift = off.lift;
  if (quality < B.WEAK_CONTACT) return { kind: rng() < 0.5 ? 'FOUL' : 'MISS', quality, pull: 0, lift };
  const pull = clamp(-timingDiffMs / (w * 3), -1, 1);
  if (Math.abs(pull) > 0.9) return { kind: 'FOUL', quality, pull, lift };
  return { kind: 'INPLAY', quality, pull, lift };
}
