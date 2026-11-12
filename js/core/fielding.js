// 수비 조작: 상대 타구 중 아슬아슬한 수비(다이빙 캐치·1루 송구·홈 송구)에서 링이 겹칠 때 터치한다.
// 맞추면 아웃(good), 놓치면 안타·세이프(bad). 컴퓨터가 정한 결과가 어느 쪽이었든 내 터치로 다시 정한다
export const FIELD_WIN = { easy: 170, normal: 120, hard: 85 };   // 성공으로 쳐 주는 타이밍 오차(ms, ±)

// 수비 찬스가 되는 타구면 { kind, good, bad } (good/bad = { event, fly, style }), 아니면 null
// dive: 외야수가 몸을 날리는 뜬공(다이빙 캐치 아웃 · 텍사스 안타) / throw: 내야안타 / home: 2루 주자 홈 승부
export function fieldChance(r, bases) {
  if (!r || !r.contact || r.contact.kind !== 'INPLAY') return null;
  const ev = r.event, st = r.style;
  if ((ev === 'OUT' && r.fly && st === 'dive') || (ev === 'SINGLE' && r.fly && st === 'bloop'))
    return { kind: 'dive', good: { event: 'OUT', fly: true, style: 'dive' }, bad: { event: 'SINGLE', fly: true, style: 'dive_miss' } };
  if (ev === 'INFIELD_SINGLE')
    return { kind: 'throw', good: { event: 'OUT', fly: false, style: 'bang' }, bad: { event: 'INFIELD_SINGLE', fly: false, style: null } };
  if (bases && bases[1] && (ev === 'SINGLE_HOME_OUT' || (ev === 'SINGLE' && st === 'home_safe')))
    return { kind: 'home', good: { event: 'SINGLE_HOME_OUT', fly: !!r.fly, style: null }, bad: { event: 'SINGLE', fly: !!r.fly, style: 'home_safe' } };
  return null;
}

// 터치 오차(ms, 빠르면 음수, 안 눌렀으면 null) → 'perfect' | 'good' | 'miss'
export function judgeTap(errMs, level = 'normal') {
  if (errMs == null || !Number.isFinite(errMs)) return 'miss';
  const w = FIELD_WIN[level] || FIELD_WIN.normal, a = Math.abs(errMs);
  return a <= w * 0.4 ? 'perfect' : a <= w ? 'good' : 'miss';
}
