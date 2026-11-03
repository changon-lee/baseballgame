// 관절 리그: 포즈 정의와 시간에 따른 포즈 계산 (DOM을 모르는 순수 함수)
// 좌표: 발 = y 0, 위쪽이 음수, 키 약 180.

const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = t => Math.max(0, Math.min(1, t));

export function lerpPose(a, b, t) {
  const o = {};
  for (const k in a) o[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : L(a[k], b[k], t);
  return o;
}

export function seqPose(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [t0, p0] = keys[i - 1], [t1, p1] = keys[i];
      return lerpPose(p0, p1, ease((u - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

// 타자 옆모습. +x = 투수 쪽. bs/fs = 뒤/앞 어깨, be/fe = 팔꿈치, bk/fk = 무릎, bf/ff = 발.
// bat = 방망이 방향(라디안), twist = 몸통이 투수 쪽으로 돈 정도(0 옆, 1 정면)
const STANCE = { head: [6, -166], neck: [2, -150], hip: [-2, -96], bs: [-10, -146], fs: [12, -146], be: [-28, -126], fe: [-2, -120], hands: [-16, -142], bk: [-16, -52], fk: [22, -54], bf: [-26, 0], ff: [30, 0], bat: -2.0, twist: 0 };
const LOAD = { ...STANCE, hands: [-24, -140], be: [-32, -122], fe: [-8, -120], ff: [46, 0], fk: [32, -50], bat: -2.25, twist: -0.1 };
const CONTACT = { head: [12, -160], neck: [7, -147], hip: [4, -94], bs: [-4, -140], fs: [18, -142], be: [2, -116], fe: [24, -124], hands: [32, -116], bk: [-8, -48], fk: [32, -52], bf: [-20, -2], ff: [46, 0], bat: 0.05 - Math.PI * 2, twist: 0.6 };
const FINISH = { head: [12, -158], neck: [8, -146], hip: [4, -94], bs: [-2, -142], fs: [16, -142], be: [-12, -138], fe: [16, -140], hands: [-4, -154], bk: [-6, -46], fk: [32, -52], bf: [-14, -6], ff: [46, 0], bat: -2.6 - Math.PI * 2, twist: 0.9 };
export const BAT_POSES = { STANCE, LOAD, CONTACT, FINISH };

// 투수 정면. 우투 기준 던지는 팔(l*) = -x, 글러브 팔(r*) = +x, 드는 다리 = r*.
const SET = { head: [0, -168], neck: [0, -152], hip: [0, -98], ls: [-16, -146], rs: [16, -146], lE: [-20, -124], rE: [18, -124], lH: [-4, -122], rH: [4, -124], lK: [-10, -50], rK: [10, -50], lF: [-12, 0], rF: [12, 0], twist: 0 };
const LIFT = { ...SET, head: [-2, -170], neck: [-2, -154], hip: [-2, -100], lK: [-8, -50], lF: [-10, 0], rK: [10, -104], rF: [6, -64], lH: [-2, -136], rH: [2, -136], lE: [-18, -132], rE: [16, -132], twist: -0.3 };
const COCK = { head: [6, -156], neck: [4, -140], hip: [4, -84], ls: [-14, -136], rs: [20, -134], lE: [-36, -140], lH: [-30, -170], rE: [32, -128], rH: [40, -118], lK: [-14, -44], lF: [-24, 0], rK: [18, -46], rF: [28, 4], twist: -0.2 };
const RELEASE = { head: [2, -148], neck: [2, -132], hip: [4, -82], ls: [-14, -132], rs: [16, -128], lE: [-14, -152], lH: [-4, -164], rE: [20, -110], rH: [12, -104], lK: [-16, -46], lF: [-24, 0], rK: [16, -44], rF: [24, 4], twist: 0.3 };
const FOLLOW = { head: [12, -132], neck: [10, -118], hip: [6, -80], ls: [-6, -118], rs: [22, -116], lE: [4, -96], lH: [18, -78], rE: [26, -100], rH: [18, -112], lK: [-14, -40], lF: [-22, -8], rK: [16, -42], rF: [24, 4], twist: 0.5 };
export const PIT_POSES = { SET, LIFT, COCK, RELEASE, FOLLOW };

export function pitcherPoseAt(now, releaseAt, windMs) {
  if (releaseAt == null) return { pose: SET, holdBall: true };
  if (now < releaseAt) {
    const u = (now - (releaseAt - windMs)) / windMs;
    return { pose: seqPose([[0, SET], [0.4, LIFT], [0.8, COCK], [1, RELEASE]], u), holdBall: true };
  }
  return { pose: lerpPose(RELEASE, FOLLOW, ease(clamp01((now - releaseAt) / 260))), holdBall: false };
}

export function batterPoseAt(now, { swingAt = null, pitchStart = null, travelMs = 1 } = {}) {
  if (swingAt != null) {
    const t = now - swingAt;
    if (t < 70) return lerpPose(LOAD, CONTACT, clamp01(t / 70));
    if (t < 260) return lerpPose(CONTACT, FINISH, ease((t - 70) / 190));
    return FINISH;
  }
  if (pitchStart != null && now >= pitchStart) return lerpPose(STANCE, LOAD, ease(clamp01(((now - pitchStart) / travelMs - 0.15) / 0.5)));
  return STANCE;
}
