// 시점(카메라): 존 위치·크기, 좌표 변환, 공 궤적. 스파이크 3의 makeView/toS/fromS/ballScreen 기반.
// catcher = 타격 시점(포수 뒤에서 투수 쪽), pitcher = 투구 시점(투수 뒤에서 홈 쪽, 좌우 반전)
import { BALL_R } from '../../core/pitch.js';
import { PIT_POSES } from './rig.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeView(kind, W, H) {
  if (kind === 'catcher') {
    const zw = Math.min(W * 0.36, H * 0.24), zh = zw * 1.2, cy = H * 0.58;
    return { kind, W, H, zw, zh, cx: W / 2, cy, mirror: false, d0: 18.5, d1: 1.5,
      feetY: cy + zh * 1.06, figH: zh * 2, moundY: H * 0.34, pitX: W / 2, pitY: H * 0.34, pitS: zh * 0.85 / 180 };
  }
  const zw = Math.min(W * 0.36, H * 0.23), zh = zw * 1.2, cy = H * 0.36;
  return { kind, W, H, zw, zh, cx: W / 2, cy, mirror: true, d0: 2, d1: 19,
    feetY: cy + zh * 1.06, figH: zh * 1.85, pitX: W * 0.5, pitY: H * 1.07, pitS: H * 0.4 / 180 };
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
// 타자 위치: 포수 좌표계에서 우타자는 x<0 쪽(1루 반대편)
export function batterAnchor(V, bats) {
  const side = bats === 'L' ? 1 : -1;
  const [x] = toS(V, side * 2.05, 0);
  return { x, y: V.feetY, scale: V.figH / 180, facing: (V.mirror ? -1 : 1) * -side };
}

// 공 화면 위치. 원근(가까울수록 큼) + 변화는 늦게 꺾임
export function ballScreen(V, pitch, startAt, now) {
  const prog = clamp((now - startAt) / pitch.travelMs, 0, 1.1);
  const pp = Math.min(prog, 1);
  const d = V.d0 + (V.d1 - V.d0) * pp;
  const k = (1 / V.d0 - 1 / d) / (1 / V.d0 - 1 / V.d1);
  const S = releasePoint(V, pitch.throws);
  const [px, py] = toS(V, pitch.plate.x, pitch.plate.y);
  const Bx = (V.mirror ? -1 : 1) * pitch.breakX * V.zw / 2, By = -pitch.breakY * V.zh / 2;
  const late = pp * pp * (V.d1 / d);
  const x = S[0] + (px - Bx - S[0]) * k + Bx * late, y = S[1] + (py - By - S[1]) * k + By * late;
  const r = clamp(ballRadius(V) * V.d1 / d, 2.5, V.zw * 0.28);
  return { x, y, r, prog, spin: (now - startAt) / 25 };
}
