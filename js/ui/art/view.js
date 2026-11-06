// 시점(카메라): 존 위치·크기, 좌표 변환, 공 궤적. 스파이크 3의 makeView/toS/fromS/ballScreen 기반.
// catcher = 타격 시점(포수 뒤에서 투수 쪽), pitcher = 투구 시점(투수 뒤에서 홈 쪽, 좌우 반전)
import { BALL_R } from '../../core/pitch.js';
import { PIT_POSES } from './rig.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeView(kind, W, H) {
  if (kind === 'catcher') {
    const zw = Math.min(W * 0.36, H * 0.24), zh = zw * 1.2, cy = H * 0.58;
    return { kind, W, H, zw, zh, cx: W / 2, cy, mirror: false, d0: 18.5, d1: 4.5, brk: 1.2, screenBreak: true,
      feetY: cy + zh * 1.06, figH: zh * 2, batX: 1.9, moundY: H * 0.34, pitX: W / 2, pitY: H * 0.34, pitS: zh * 0.85 / 180 };
  }
  // 투구 시점: 투수는 카메라 바로 앞이라 크게, 멀리 있는 타자·포수·심판은 작게
  // 존은 조금 작게, 타자는 크게: 존이 타자 무릎~가슴 높이쯤에 오도록(예전엔 존 위쪽이 타자 머리보다 높았다)
  const zw = Math.min(W * 0.27, H * 0.172), zh = zw * 1.2, cy = H * 0.36;
  return { kind, W, H, zw, zh, cx: W / 2, cy, mirror: true, d0: 2, d1: 19,
    feetY: cy + zh * 1.06, figH: zh * 2.0, batX: 2.6, pitX: W * 0.5, pitY: H * 1.13, pitS: H * 0.56 / 180 };
}

export const toS = (V, x, y) => [V.cx + (V.mirror ? -x : x) * V.zw / 2, V.cy - y * V.zh / 2];
export const fromS = (V, sx, sy) => ({ x: (V.mirror ? -1 : 1) * (sx - V.cx) / (V.zw / 2), y: -(sy - V.cy) / (V.zh / 2) });
export const zoneRect = V => ({ left: V.cx - V.zw / 2, top: V.cy - V.zh / 2, width: V.zw, height: V.zh });
export const ballRadius = V => V.zw * BALL_R / 2;

// 투수 그림 위치. catcher 시점은 정면(우투 mirror 1), pitcher 시점은 뒷모습(우투 mirror -1)
export function pitcherAnchor(V, throws) {
  const front = V.kind === 'catcher';
  const mirror = (throws === 'L' ? -1 : 1) * (front ? 1 : -1);
  return { x: V.pitX, y: V.pitY, scale: V.pitS, mirror, back: !front };
}
// 일러스트 스프라이트를 쓰면 손 위치가 달라서, 화면 쪽에서 덮어쓸 수 있게 한다
let releaseOverride = null;
export function setReleaseOverride(fn) { releaseOverride = fn; }
export function releasePoint(V, throws) {
  const o = releaseOverride && releaseOverride(V.kind !== 'catcher', throws);
  if (o) return [V.pitX + o[0] * V.pitS, V.pitY + o[1] * V.pitS];
  const a = pitcherAnchor(V, throws), h = PIT_POSES.RELEASE.lH;
  return [a.x + h[0] * a.scale * a.mirror, a.y + h[1] * a.scale];
}
// 타자 위치: 포수 좌표계에서 우타자는 x<0 쪽(1루 반대편). batX = 홈플레이트 중심에서 타자 머리까지(존 반폭 단위)
export function batterAnchor(V, bats) {
  const side = bats === 'L' ? 1 : -1;
  const [x] = toS(V, side * (V.batX || 2.05), 0);
  return { x, y: V.feetY, scale: V.figH / 180, facing: (V.mirror ? -1 : 1) * -side };
}

// 구종별로 화면에 보이는 휘는 정도(존 반폭·반높이 단위, 우투수 기준, 중력 포함)와 휘는 시점.
// 공은 (도착점 - 휨) 쪽으로 곧게 출발해서 휨 * p^n 만큼 꺾여 도착점에 닿는다. n이 클수록 늦게 확 꺾인다.
// 게임 판정(도착점, 타격)은 그대로이고 보이는 길만 다르다.
export const PITCH_PATH = {
  FB: { x: 0.0, y: -0.3, n: 2 },      // 직구: 거의 일직선
  SI: { x: 0.9, y: -1.0, n: 2.3 },    // 투심: 팔 쪽으로 휘며 가라앉음
  CT: { x: -0.7, y: -0.5, n: 2.8 },   // 커터: 막판에 살짝 반대쪽
  SL: { x: -1.7, y: -0.9, n: 2.6 },   // 슬라이더: 옆으로 크게, 늦게
  CU: { x: -0.8, y: -2.7, n: 2 },     // 커브: 위로 떴다가 크게 뚝
  CH: { x: 0.9, y: -1.5, n: 2.6 },    // 체인지업: 팔 쪽으로 흐르며 떨어짐
  FO: { x: 0.0, y: -2.3, n: 3.4 },    // 포크: 똑바로 오다 막판에 뚝
};
export function pitchPath(pitch) {
  const p = PITCH_PATH[pitch.type];
  if (!p) return { x: pitch.breakX, y: pitch.breakY, n: 2 };
  return { x: p.x * (pitch.throws === 'L' ? -1 : 1), y: p.y, n: p.n };
}

// 공 화면 위치. 원근(가까울수록 큼) + 구종별 꺾임
export function ballScreen(V, pitch, startAt, now) {
  const prog = clamp((now - startAt) / pitch.travelMs, 0, 1.1);
  const pp = Math.min(prog, 1);
  const d = V.d0 + (V.d1 - V.d0) * pp;
  const k = (1 / V.d0 - 1 / d) / (1 / V.d0 - 1 / V.d1);
  const S = releasePoint(V, pitch.throws);
  const [px, py] = toS(V, pitch.plate.x, pitch.plate.y);
  const br = pitchPath(pitch), m = V.brk || 1;            // 타격 시점은 원근 때문에 덜 휘어 보여서 더 키운다
  const Bx = (V.mirror ? -1 : 1) * br.x * m * V.zw / 2, By = -br.y * m * V.zh / 2;
  // 타격 시점: 원근대로면 꺾임이 마지막 두세 프레임에 몰려 안 보여서, 화면에서 움직인 만큼에 맞춰 꺾는다
  const late = V.screenBreak ? Math.pow(k, br.n) : Math.pow(pp, br.n) * (V.d1 / d);
  const x = S[0] + (px - Bx - S[0]) * k + Bx * late, y = S[1] + (py - By - S[1]) * k + By * late;
  const r = clamp(ballRadius(V) * V.d1 / d, 2.5, V.zw * 0.28);
  return { x, y, r, prog, spin: (now - startAt) / 25 };
}
