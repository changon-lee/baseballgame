// 일러스트 스프라이트(assets/sprites/*.webp). 다 불러오기 전이나 실패하면 false를 돌려주고,
// 호출한 쪽이 코드로 그린 그림(figures.js)을 대신 쓴다.
// 좌표: 각 프레임 그림 안의 픽셀. ax = 머리(모자) 가로 중심 — 동작 중 머리는 거의 안 움직이므로 프레임끼리 머리를 맞춘다. 아래 끝 = 발.
// 동작은 프레임을 끊어 바꾸지 않고, 잠깐 머문 뒤 다음 프레임으로 겹쳐 넘어간다(디졸브) + 몸 위치를 조금씩 옮긴다.
import { toS } from './view.js';

const BASE = new URL('../../../assets/sprites/', import.meta.url).href;
const STAND = 182;                                       // 서 있는 선수 키(포즈 단위)
const BAT_SHIFT = 0;                                     // 필요하면 타자 그림을 홈플레이트 쪽(+)으로 당긴다

// dy/sc = 그 동작일 때 몸 위치·크기 변화(투수가 홈 쪽으로 내딛는 느낌)
// k = 그림 배율 보정(중간 동작 그림은 더 크게 그려져 있어서 줄인다). 없으면 1
const SETS = {
  pitcher_back: {                                       // 뒷모습(초록 배경 영상 pitcher_back_g에서 25장): 셋 → 다리 들기 → … → 릴리스(17) → 팔로스루
    h0: 667, txt: 1.3, cut: true,
    frames: [
      { w: 240, h: 667, ax: 113, ay: 667, num: [127, 169] },
      { w: 240, h: 665, ax: 111, ay: 664, num: [127, 169] },
      { w: 240, h: 659, ax: 111, ay: 659, num: [129, 167] },
      { w: 244, h: 652, ax: 114, ay: 652, num: [133, 165] },
      { w: 249, h: 644, ax: 117, ay: 644, num: [137, 162] },
      { w: 252, h: 632, ax: 117, ay: 632, num: [138, 159] },
      { w: 252, h: 622, ax: 113, ay: 622, num: [136, 156] },
      { w: 285, h: 608, ax: 138, ay: 608, num: [164, 155] },
      { w: 344, h: 596, ax: 184, ay: 596, num: [212, 154] },
      { w: 414, h: 579, ax: 210, ay: 581, num: [240, 151] },
      { w: 450, h: 562, ax: 217, ay: 567, num: [247, 143] },
      { w: 467, h: 547, ax: 213, ay: 553, num: [242, 136] },
      { w: 450, h: 538, ax: 194, ay: 544, num: [221, 135] },
      { w: 429, h: 531, ax: 179, ay: 538, num: [199, 134] },
      { w: 355, h: 549, ax: 155, ay: 558, num: [161, 143] },
      { w: 277, h: 571, ax: 137, ay: 581, num: [139, 170] },
      { w: 240, h: 503, ax: 99, ay: 521, num: [111, 131] },
      { w: 241, h: 564, ax: 93, ay: 588, num: [99, 172], hand: [212, 0] },
      { w: 227, h: 446, ax: 105, ay: 503 },
      { w: 274, h: 444, ax: 106, ay: 508 },
      { w: 358, h: 446, ax: 116, ay: 509 },
      { w: 426, h: 450, ax: 125, ay: 514 },
      { w: 435, h: 474, ax: 134, ay: 538 },
      { w: 417, h: 502, ax: 129, ay: 565 },
      { w: 344, h: 515, ax: 122, ay: 579 },
    ],
  },
  pitcher_front: {                                       // 정면(영상에서 25장), 순서는 뒷모습과 같다
    h0: 670, cut: true,
    frames: [
      { w: 209, h: 670, ax: 114, ay: 668 },
      { w: 188, h: 659, ax: 120, ay: 667 },
      { w: 186, h: 648, ax: 125, ay: 670 },
      { w: 216, h: 649, ax: 156, ay: 671 },
      { w: 256, h: 648, ax: 197, ay: 671 },
      { w: 256, h: 648, ax: 197, ay: 671 },
      { w: 232, h: 647, ax: 172, ay: 670 },
      { w: 220, h: 641, ax: 159, ay: 665 },
      { w: 255, h: 629, ax: 186, ay: 654 },
      { w: 300, h: 618, ax: 221, ay: 640 },
      { w: 309, h: 641, ax: 224, ay: 626 },
      { w: 264, h: 654, ax: 176, ay: 615 },
      { w: 192, h: 668, ax: 106, ay: 611 },
      { w: 220, h: 690, ax: 138, ay: 611 },
      { w: 277, h: 704, ax: 114, ay: 608 },
      { w: 340, h: 696, ax: 150, ay: 600 },
      { w: 325, h: 680, ax: 163, ay: 584 },
      { w: 332, h: 730, ax: 169, ay: 634, hand: [43, 20] },
      { w: 252, h: 650, ax: 93, ay: 558 },
      { w: 256, h: 644, ax: 98, ay: 555 },
      { w: 275, h: 639, ax: 104, ay: 554 },
      { w: 322, h: 628, ax: 118, ay: 547 },
      { w: 360, h: 616, ax: 178, ay: 541 },
      { w: 425, h: 619, ax: 236, ay: 549 },
      { w: 455, h: 631, ax: 267, ay: 567 },
    ],
  },
  batter_back: {                                         // 타격 시점(타자 등 뒤 카메라, tools/video_back.py). 그림은 왼쪽(투수 쪽)을 본다. 방망이까지 그림에 있다
    // 29장: 0 준비, 1~5 다리 들고 내딛기, 6 내딛은 자세, 7~13 스윙, 14 임팩트, 15~24 팔로스루, 25~28 마무리. 기준점(ax, ay) = 준비 자세의 두 발 가운데
    h0: 662,
    frames: [
      { w: 315, h: 662, ax: 144, ay: 662 },
      { w: 273, h: 684, ax: 50, ay: 684 },
      { w: 263, h: 686, ax: 23, ay: 685 },
      { w: 272, h: 677, ax: 22, ay: 676 },
      { w: 282, h: 665, ax: 31, ay: 665 },
      { w: 290, h: 653, ax: 56, ay: 653 },
      { w: 306, h: 629, ax: 92, ay: 629 },
      { w: 316, h: 570, ax: 99, ay: 574 },
      { w: 297, h: 534, ax: 100, ay: 543 },
      { w: 299, h: 527, ax: 99, ay: 545 },
      { w: 359, h: 531, ax: 99, ay: 548 },
      { w: 372, h: 534, ax: 98, ay: 551 },
      { w: 295, h: 537, ax: 97, ay: 554 },
      { w: 243, h: 541, ax: 95, ay: 557 },
      { w: 304, h: 543, ax: 152, ay: 559 },
      { w: 395, h: 545, ax: 241, ay: 561 },
      { w: 455, h: 570, ax: 299, ay: 585 },
      { w: 469, h: 644, ax: 312, ay: 659 },
      { w: 448, h: 705, ax: 290, ay: 721 },
      { w: 397, h: 741, ax: 232, ay: 756 },
      { w: 327, h: 739, ax: 150, ay: 754 },
      { w: 277, h: 716, ax: 95, ay: 731 },
      { w: 291, h: 617, ax: 90, ay: 633 },
      { w: 327, h: 590, ax: 90, ay: 606 },
      { w: 349, h: 592, ax: 89, ay: 605 },
      { w: 363, h: 587, ax: 85, ay: 594 },
      { w: 332, h: 749, ax: 68, ay: 756 },
      { w: 438, h: 823, ax: 179, ay: 830 },
      { w: 414, h: 724, ax: 158, ay: 732 },
    ],
  },
  batter_front: {                                        // 투수 시점(앞에서 본 타자). 순서·기준점은 batter_back과 같다
    h0: 662, raw: true,                                  // 정면 그림은 방망이를 왼쪽 어깨에 멘 모습(좌타자처럼 보임)이라 batter와 반대로, 뒤집지 않고 그린다                                             // 14 임팩트 = 방망이가 몸 뒤에서 카메라 쪽으로 돌아 나와 홈플레이트를 가로지른 순간
    frames: [
      { w: 379, h: 664, ax: 175, ay: 664 },
      { w: 409, h: 659, ax: 173, ay: 659 },
      { w: 414, h: 657, ax: 159, ay: 655 },
      { w: 393, h: 659, ax: 126, ay: 650 },
      { w: 388, h: 674, ax: 117, ay: 645 },
      { w: 372, h: 695, ax: 102, ay: 638 },
      { w: 367, h: 700, ax: 97, ay: 634 },
      { w: 353, h: 701, ax: 98, ay: 634 },
      { w: 306, h: 704, ax: 98, ay: 636 },
      { w: 325, h: 706, ax: 98, ay: 638 },
      { w: 388, h: 706, ax: 100, ay: 638 },
      { w: 419, h: 707, ax: 100, ay: 639 },
      { w: 293, h: 711, ax: 100, ay: 643 },
      { w: 449, h: 711, ax: 254, ay: 645 },
      { w: 515, h: 714, ax: 318, ay: 648 },
      { w: 517, h: 718, ax: 318, ay: 652 },
      { w: 519, h: 720, ax: 318, ay: 653 },
      { w: 521, h: 721, ax: 318, ay: 655 },
      { w: 521, h: 723, ax: 318, ay: 657 },
      { w: 522, h: 725, ax: 318, ay: 659 },
      { w: 524, h: 727, ax: 318, ay: 660 },
      { w: 522, h: 728, ax: 313, ay: 662 },
      { w: 475, h: 730, ax: 264, ay: 664 },
      { w: 458, h: 732, ax: 241, ay: 665 },
      { w: 461, h: 745, ax: 240, ay: 679 },
      { w: 456, h: 769, ax: 226, ay: 704 },
      { w: 421, h: 760, ax: 193, ay: 697 },
      { w: 397, h: 736, ax: 163, ay: 672 },
      { w: 395, h: 741, ax: 159, ay: 676 },
    ],
  },
  catcher: { h0: 1005, frames: [{ w: 762, h: 1005, ax: 380, mitt: [517, 413] }] },
  umpire: { h0: 1177, frames: [{ w: 633, h: 1177, ax: 316 }] },
};

// 묶음마다 다 받으면 바로 쓴다(못 받은 묶음만 코드로 그린 사람). 경기는 투구 시점(1회초)부터라 그 그림을 먼저 받는다
let loaded = 0, total = 0, failed = false;
for (const name of ['pitcher_back', 'batter_front', 'catcher', 'umpire', 'pitcher_front', 'batter_back']) {
  const set = SETS[name];
  set.got = 0;
  set.frames.forEach((f, i) => {
    total++;
    const img = new Image();
    img.onload = () => { loaded++; set.got++; if (loaded === total) { loadIdle(); loadField(); } };
    img.onerror = () => { failed = true; set.bad = true; loadField(); };
    img.src = `${BASE}${name}_${i}.webp`;
    f.img = img;
  });
}
const setReady = (...names) => names.every(n => !SETS[n].bad && SETS[n].got === SETS[n].frames.length);

// ── 타자가 기다리며 방망이를 흔드는 동작(영상에서 처음과 끝이 이어지는 짧은 구간을 프레임마다 다, 1초 IDLE_FPS장) ──
// 경기 그림을 다 받은 뒤에 받고, 못 받았으면 준비 자세(스윙 그림 0번)로 서 있는다. 0.7배로 줄여 저장했다(res)
const IDLE = {
  batter_back_idle: { res: 0.7, pingpong: true, frames: [
  { w: 220, h: 463, ax: 101, ay: 463 },
  { w: 225, h: 474, ax: 99, ay: 473 },
  { w: 228, h: 482, ax: 97, ay: 481 },
  { w: 230, h: 486, ax: 95, ay: 486 },
  { w: 233, h: 488, ax: 98, ay: 487 },
  { w: 238, h: 487, ax: 100, ay: 486 },
  { w: 236, h: 482, ax: 103, ay: 482 },
  { w: 231, h: 478, ax: 105, ay: 478 },
  { w: 224, h: 472, ax: 105, ay: 472 },
  { w: 218, h: 465, ax: 105, ay: 465 },
  { w: 214, h: 453, ax: 105, ay: 453 },
  { w: 211, h: 439, ax: 106, ay: 439 },
  { w: 208, h: 426, ax: 106, ay: 426 },
  { w: 209, h: 420, ax: 106, ay: 420 },
  { w: 211, h: 424, ax: 106, ay: 424 },
  { w: 212, h: 438, ax: 106, ay: 438 },
  { w: 218, h: 458, ax: 106, ay: 457 },
  { w: 223, h: 476, ax: 105, ay: 476 },
  { w: 229, h: 487, ax: 105, ay: 486 },
  { w: 236, h: 490, ax: 104, ay: 490 },
  { w: 259, h: 483, ax: 102, ay: 483 },
  { w: 275, h: 469, ax: 98, ay: 469 },
  { w: 290, h: 452, ax: 97, ay: 452 },
  { w: 299, h: 441, ax: 99, ay: 440 },
  ] },
  batter_idle_front: { res: 0.7, raw: true, pingpong: true, frames: [
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 265, h: 465, ax: 123, ay: 465 },
  { w: 267, h: 465, ax: 123, ay: 465 },
  { w: 267, h: 465, ax: 123, ay: 465 },
  { w: 267, h: 465, ax: 123, ay: 465 },
  { w: 267, h: 465, ax: 123, ay: 465 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 267, h: 463, ax: 123, ay: 463 },
  { w: 268, h: 463, ax: 123, ay: 463 },
  { w: 268, h: 463, ax: 123, ay: 463 },
  { w: 268, h: 463, ax: 123, ay: 463 },
  { w: 268, h: 463, ax: 123, ay: 463 },
  { w: 268, h: 463, ax: 123, ay: 463 },
  ] },
};
let idleStarted = false;
function loadIdle() {
  if (idleStarted) return;
  idleStarted = true;
  for (const [name, set] of Object.entries(IDLE)) {
    set.got = 0;
    set.frames.forEach((f, i) => {
      const img = new Image();
      img.onload = () => { set.got++; };
      img.src = `${BASE}${name}_${i}.webp`;
      f.img = img;
    });
  }
}
const idleReady = set => set.got === set.frames.length;
export const spritesReady = () => !failed && loaded === total;

// ── 시간 보간 도우미 ──
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// keys: [[시각, 값]...] 를 시각 t에서 부드럽게 보간
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
// 프레임 순서표: [[시각, 프레임]...] → 지금 보여줄 두 프레임과 겹침 정도.
// 각 구간의 앞쪽 hold 비율만큼은 앞 프레임에 머물고, 나머지 동안 다음 프레임으로 겹쳐 넘어간다.
function frameMix(keys, t, hold = 0.4) {
  if (t <= keys[0][0]) return { a: keys[0][1], b: keys[0][1], mix: 0, s: 0, i: 0 };
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, a] = keys[i], [t1, b] = keys[i + 1];
    if (t <= t1) {
      const s = (t - t0) / (t1 - t0);
      return { a, b, mix: smooth((s - hold) / (1 - hold)), s, i };
    }
  }
  const last = keys[keys.length - 1][1];
  return { a: last, b: last, mix: 0, s: 1, i: keys.length - 1 };
}

// 겹침 정도 → 앞/뒤 프레임 투명도. 가운데선 둘 다 진하게(배경이 비쳐 보이지 않게), 끝에선 앞 프레임이 완전히 사라진다
const fade = mix => mix <= 0 ? [1, 0] : [Math.min(1, 2 * (1 - mix)), Math.min(1, 2 * mix)];

// ── 팀 색 입히기: 파란 부분 → 구단색, 원정은 흰 유니폼 → 회색 ──
const SAMSUNG = '#074CA1';
const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
};
const rgb = (h, s, v) => {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};
const tintCache = new Map();
function tinted(f, uni) {
  const away = uni.jersey !== '#f4f6f9';
  if (uni.trim === SAMSUNG && !away) return f.img;
  const key = f.img.src + '|' + uni.trim + '|' + away;
  if (tintCache.has(key)) return tintCache.get(key);
  const c = document.createElement('canvas');
  c.width = f.w; c.height = f.h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(f.img, 0, 0);
  const n = parseInt(uni.trim.slice(1), 16);
  const [th, ts, tv] = hsv(n >> 16, (n >> 8) & 255, n & 255);
  const d = x.getImageData(0, 0, f.w, f.h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const [h, s, v] = hsv(p[i], p[i + 1], p[i + 2]);
    let o = null;
    if (h > 195 && h < 255 && s > 0.3 && v > 0.08) o = rgb(th, ts * Math.min(1, s / 0.8), Math.min(1, v * Math.max(tv, 0.12) / 0.63));
    else if (away && s < 0.16 && v > 0.35) o = [p[i] * 0.6, p[i + 1] * 0.61, p[i + 2] * 0.64];
    if (o) { p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2]; }
  }
  x.putImageData(d, 0, 0);
  tintCache.set(key, c);
  return c;
}

// ── 타구 장면(3D)용 수비수·주자 그림: 1피트 = FIELD_PX 픽셀로 줄여 저장. 옆모습은 오른쪽을 본다 ──
// 투수·타자 그림과 따로 불러와서, 못 불러온 그림만 코드로 그린 사람으로 대신한다
export const FIELD_PX = 50;
const rep = (n, f) => Array.from({ length: n }, () => ({ ...f }));   // 영상에서 뽑은 그림은 프레임마다 크기·기준점이 같다
const FIELD = {
  frun: rep(8, { w: 207, h: 290, ax: 94 }),   // 달리기(영상에서 8장, 옆모습)
  frun_front: rep(8, { w: 129, h: 308, ax: 67 }),   // 달리기 앞모습(카메라 쪽으로)
  frun_back: rep(8, { w: 149, h: 308, ax: 83 }),   // 달리기 뒷모습
  runner: rep(8, { w: 183, h: 292, ax: 89 }),   // 주자 달리기(옆모습)
  runner_front: rep(8, { w: 119, h: 305, ax: 59 }),   // 주자 달리기 앞모습
  runner_back: rep(8, { w: 125, h: 304, ax: 57 }),   // 주자 달리기 뒷모습
  fielder: [{ w: 186, h: 250, ax: 92, hx: 95 }, { w: 177, h: 194, ax: 88, hx: 88 }, { w: 113, h: 330, ax: 56, hx: 64 }, { w: 117, h: 303, ax: 55, hx: 52 }],   // 준비, 땅볼, 뜬공, 서서 보기(정면)
  fthrow: [{ w: 234, h: 256, ax: 116, hx: 153 }, { w: 243, h: 263, ax: 118, hx: 133 }, { w: 243, h: 263, ax: 105, hx: 165 }, { w: 320, h: 171, ax: 22, hx: 238 }],   // 내딛기, 던질 준비, 릴리스, 다이빙
  rbase: [{ w: 75, h: 306, ax: 44, hx: 44 }, { w: 202, h: 249, ax: 99, hx: 158 }, { w: 268, h: 204, ax: 158, hx: 73 }, { w: 340, h: 152, ax: 12, hx: 239 }],   // 서 있기, 리드, 발 슬라이딩, 머리 슬라이딩
  ump: [{ w: 104, h: 301, ax: 52, hx: 53 }, { w: 163, h: 246, ax: 81, hx: 82 }, { w: 136, h: 312, ax: 53, hx: 74 }],   // 심판 뒷모습: 서 있기, 앉기, 콜
};
// 투수·타자 그림(첫 화면)을 다 받은 뒤에 불러온다. 같이 받으면 첫 화면이 늦게 뜬다
let fieldStarted = false;
function loadField() {
  if (fieldStarted) return;
  fieldStarted = true;
  for (const [name, frames] of Object.entries(FIELD)) {
    frames.forEach((f, i) => {
      const img = new Image();
      img.onload = () => { f.ok = true; };
      img.src = `${BASE}${name}_${i}.webp`;
      f.img = img;
    });
  }
}
setTimeout(() => { loadIdle(); loadField(); }, 8000);                             // 첫 화면 그림이 끝내 안 오더라도 타구 장면 그림은 받는다
export const fieldCount = name => FIELD[name]?.length || 0;
export const fieldReady = () => Object.values(FIELD).every(fr => fr.every(f => f.ok));   // 미리보기에서 다 불러올 때까지 기다리는 용도
// 그림 한 장(uni가 있으면 팀 색을 입힌다). 없는 그림이거나 아직 못 불러왔으면 null
export function fieldSprite(name, i, uni) {
  const f = FIELD[name]?.[i];
  if (!f || !f.ok) return null;
  return { img: uni ? tinted(f, uni) : f.img, w: f.w, h: f.h, ax: f.ax, hx: f.hx };
}

function shadowAt(ctx, w) {
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.scale(1, 0.2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

// ── 투수 ──
// 와인드업 u(0~1): 셋 → … → 릴리스(6). 릴리스 뒤: 팔로스루(7) → (잠시 뒤) 다시 셋.
// 영상에서 고르게 뽑은 18장이라 와인드업 시간에 고르게 나눈다. 릴리스 뒤 7장은 점점 느려지며 마무리
const REL = 17;
const WIND_KEYS = Array.from({ length: REL + 1 }, (_, i) => [i / REL, i]);
const AFTER_KEYS = [[0, REL], [40, 18], [90, 19], [160, 20], [250, 21], [370, 22], [520, 23], [700, 24], [950, 24], [1250, 0]];
function pitchState(now, releaseAt, windMs) {
  if (releaseAt == null) return { a: 0, b: 0, mix: 0, idle: true };
  if (now < releaseAt) {
    const u = (now - (releaseAt - windMs)) / windMs;
    if (u < 0) return { a: 0, b: 0, mix: 0, idle: true };
    return frameMix(WIND_KEYS, u, 0.4);
  }
  const dt = now - releaseAt;
  return frameMix(AFTER_KEYS, dt, dt < 700 ? 0.25 : 0.5);
}

// 공이 손을 떠나는 위치(포즈 단위, 투수 발 기준). 스프라이트를 못 쓰면 null
export function spriteReleaseOffset(back, throws) {
  if (!setReady(back ? 'pitcher_back' : 'pitcher_front')) return null;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const f = set.frames.find(q => q.hand), su = (STAND / set.h0) * (f.sc ?? 1) * (f.k || 1), flip = throws === 'L' ? -1 : 1;
  return [(f.hand[0] - f.ax) * su * flip, (f.hand[1] - (f.ay ?? f.h)) * su + (f.dy ?? 0)];
}

function drawPitcherFrame(ctx, f, img, su, flip, alpha, back, player, uni, txt = 1) {
  if (alpha <= 0.01) return;
  const k = f.k || 1;
  ctx.save(); ctx.globalAlpha = alpha; ctx.scale(flip * su * k, su * k);
  const ay = f.ay ?? f.h;                              // 기준점(발) 세로 위치. 영상 그림은 발이 그림 밖에 있을 수도 있다
  ctx.drawImage(img, -f.ax, -ay);
  if (back && player && f.num) {                       // 등 이름·번호(그림 배율과 상관없이 같은 크기)
    ctx.translate(f.num[0] - f.ax, f.num[1] - ay); ctx.scale(flip * txt / k, txt / k);
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '800 17px "Pretendard Variable",system-ui,sans-serif';
    ctx.fillStyle = uni.num; ctx.fillText(player.name, 0, -30);
    if (player.num != null) {
      ctx.font = '900 54px system-ui,sans-serif';
      ctx.lineWidth = 6; ctx.strokeStyle = uni.numEdge; ctx.strokeText(String(player.num), 0, 22);
      ctx.fillStyle = uni.num; ctx.fillText(String(player.num), 0, 22);
    }
  }
  ctx.restore();
}

export function drawPitcherSprite(ctx, { x, y, scale, back, uni, player, throws, now, releaseAt, windMs }) {
  if (!setReady(back ? 'pitcher_back' : 'pitcher_front')) return false;
  const set = SETS[back ? 'pitcher_back' : 'pitcher_front'];
  const st = pitchState(now, releaseAt, windMs);
  const A = set.frames[st.a], B = set.frames[st.b];
  const k = st.a === st.b ? 0 : smooth(st.s ?? 0);   // 몸 이동은 구간 전체에 걸쳐 부드럽게
  const dy = lerp(A.dy ?? 0, B.dy ?? 0, k), sc = lerp(A.sc ?? 1, B.sc ?? 1, k);
  const breathe = st.idle ? 1 + Math.sin(now / 420) * 0.006 : 1;
  const su = (STAND / set.h0) * sc, flip = throws === 'L' ? -1 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  shadowAt(ctx, 50);
  ctx.translate(0, dy); ctx.scale(1, breathe);
  // 영상 그림(cut)은 촘촘해서 겹치지 않고 바로 넘긴다(겹치면 몸이 두 겹으로 보인다). 마무리 → 셋 자세로 돌아갈 때만 겹친다
  const [aA, aB] = set.cut && !(st.b === 0 && st.a !== 0) ? (st.mix < 0.5 ? [1, 0] : [0, 1]) : fade(st.mix);
  drawPitcherFrame(ctx, A, tinted(A, uni), su, flip, aA, back, player, uni, set.txt);
  drawPitcherFrame(ctx, B, tinted(B, uni), su, flip, aB, back, player, uni, set.txt);
  ctx.restore();
  return true;
}

// ── 타자 ── (facing: +1 = 투수가 화면 오른쪽)
// 스윙 시각표(ms): 스윙 시작 → 임팩트(SWING_CONTACT_MS)까지 7장을 빠르게, 팔로스루는 점점 느리게, 마무리에서 머문 뒤 준비 자세로 돌아온다
export const SWING_CONTACT_MS = 70;                     // 스윙 시작 → 방망이가 공에 닿는 순간
const SWING_FRAMES = [
  ...Array.from({ length: 8 }, (_, i) => [i * SWING_CONTACT_MS / 7, 7 + i]),   // 0~70ms: 7 → 14(임팩트)
  [90, 15], [110, 16], [130, 17], [150, 18], [175, 19], [200, 20], [230, 21], [260, 22], [295, 23], [330, 24],
  [390, 25], [480, 26], [600, 27], [760, 28], [1050, 28], [1350, 0]];
// 공이 오는 동안(투구 진행 비율): 준비 → 다리 들고 내딛기 → 내딛은 자세(스윙을 안 하면 여기서 멈춘다)
const LOAD_KEYS = [[0, 0], [0.12, 1], [0.24, 2], [0.36, 3], [0.47, 4], [0.57, 5], [0.65, 6]];

function batterState(now, swingAt, pitchStart, travelMs) {
  if (swingAt != null && now >= swingAt) return { ...frameMix(SWING_FRAMES, now - swingAt, 0), t: now - swingAt };
  const u = pitchStart != null && now >= pitchStart ? (now - pitchStart) / Math.max(1, travelMs) : 0;
  return { ...frameMix(LOAD_KEYS, u, 0), t: -1 };
}

function drawBatterFrame(ctx, f, img, su, alpha, raw) {   // su: 그림 1픽셀 → 포즈 단위
  if (alpha <= 0.01) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.scale(raw ? su : -su, su);   // 옆모습은 왼쪽을 보므로 뒤집어서 +x(투수 쪽)를 보게
  ctx.drawImage(img, -f.ax, -(f.ay ?? f.h));
  ctx.restore();
}

const IDLE_FPS = 24;                                     // 영상 그대로
const IDLE_OUT = 0.12;                                   // 공이 손을 떠난 뒤(투구 진행 비율) 흔들던 자세 → 다리 들기로 넘어가는 구간
const idleAt = {};                                       // 묶음별: 기다리기 시작한 시각, 마지막으로 그린 흔들기 프레임

// front: 투수 시점(앞에서 본 그림). 두 묶음은 프레임 순서가 같아서 같은 시각표를 쓴다
export function drawBatterSprite(ctx, { x, y, scale, facing, uni, now, swingAt, pitchStart, travelMs, front = false }) {
  const name = front ? 'batter_front' : 'batter_back';
  if (!setReady(name)) return false;
  const set = SETS[name], su = STAND / set.h0;
  const iset = IDLE[front ? 'batter_idle_front' : 'batter_back_idle'];
  const st = batterState(now, swingAt, pitchStart, travelMs);
  const u = st.t < 0 && pitchStart != null && now >= pitchStart ? (now - pitchStart) / Math.max(1, travelMs) : -1;
  const ia = idleAt[name] || (idleAt[name] = { since: null, i: 0 });
  let layers;                                            // [묶음, 프레임, 투명도]
  if (st.t < 0 && u < 0 && idleReady(iset)) {            // 기다리는 중: 방망이 흔들기를 반복(겹치지 않고 바로 넘긴다 — 겹치면 방망이가 두 개로 보인다)
    if (ia.since == null) ia.since = now;
    const n = iset.frames.length, c = Math.floor(Math.max(0, now - ia.since) / 1000 * IDLE_FPS);
    const pp = c % Math.max(1, 2 * n - 2);                 // pingpong: 끝까지 갔다가 거꾸로 되돌아온다
    ia.i = iset.pingpong && n > 1 ? (pp < n ? pp : 2 * n - 2 - pp) : c % n;
    layers = [[iset, ia.i, 1]];
  } else {
    if (st.t >= 0 || u >= IDLE_OUT) ia.since = null;      // 다음에 기다릴 땐 흔들기를 처음(준비 자세)부터
    if (u >= 0 && u < IDLE_OUT && ia.since != null && idleReady(iset)) {   // 흔들던 자세 → 다리 들기
      const [a0, a1] = fade(smooth(u / IDLE_OUT));
      layers = [[iset, ia.i, a0], [set, 1, a1]];
    } else {
      // 영상 그림은 촘촘해서 겹치지 않고 바로 넘긴다(겹치면 몸·방망이가 두 겹). 마무리 → 준비 자세로 돌아갈 때만 겹친다
      const [aA, aB] = st.b === 0 && st.a !== 0 ? fade(st.mix) : st.mix < 0.5 ? [1, 0] : [0, 1];
      layers = [[set, st.a, aA], [set, st.b, aB]];
    }
  }
  const idle = st.t < 0 && u < 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale); ctx.translate(BAT_SHIFT, 0);
  shadowAt(ctx, 60);
  if (idle && !idleReady(iset)) ctx.scale(1, 1 + Math.sin(now / 520) * 0.004);   // 흔들기 그림이 아직 없으면 숨쉬기만
  for (const [q, k, al] of layers) {
    const f = q.frames[k];
    drawBatterFrame(ctx, f, tinted(f, uni), su / (q.res || 1), al, q.raw);
  }
  ctx.restore();
  return true;
}

// ── 포수 + 심판 (투구 시점). 포수는 제자리, 겨냥 위치는 노란 원으로만 표시 ──
export function drawCatcherSprite(ctx, V, mitt, now = 0) {
  if (!setReady('catcher', 'umpire')) return false;
  const base = V.feetY - V.zh * 0.05;
  // 타자(V.figH)에 맞춰 포수·심판도 같은 비율로 키운다(예전 타자 키 1.35zh 기준 크기 × k)
  // 심판은 포수 뒤(카메라에서 더 멀다)라 덜 키운다
  const k = (V.figH || V.zh * 1.35) / (V.zh * 1.35), ku = 1 + (k - 1) * 0.4;
  const um = SETS.umpire.frames[0], us = (V.zh * 1.35 * ku) / um.h;
  ctx.drawImage(um.img, V.cx + V.zw * 0.3 * ku - um.ax * us, base - V.zh * 0.2 * ku - um.h * us, um.w * us, um.h * us);
  const c = SETS.catcher.frames[0], cs = (V.zh * 0.86 * k) / c.h;
  const breathe = Math.sin(now / 480) * V.zh * 0.004;
  ctx.save(); ctx.translate(V.cx, base); shadowAt(ctx, V.zw * 0.6); ctx.restore();
  ctx.drawImage(c.img, V.cx - c.ax * cs, base - c.h * cs + breathe, c.w * cs, c.h * cs);
  if (mitt) {
    const [tx, ty] = toS(V, mitt.x, mitt.y), r = V.zw * 0.16;
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(241,196,15,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx - r * 0.45, ty); ctx.lineTo(tx + r * 0.45, ty); ctx.moveTo(tx, ty - r * 0.45); ctx.lineTo(tx, ty + r * 0.45); ctx.stroke();
    ctx.restore();
  }
  return true;
}
