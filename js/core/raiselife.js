// 육성모드 생활: 쇼핑(트레이너·장비·생활), 인기, 부상, 랜덤 이벤트. 돈은 만원 단위, 현금은 slot.assets
// 확률은 슬롯 상태(연도·날짜)로 만든 따로 된 난수를 써서 경기 시뮬레이션 난수와 섞이지 않는다
import { createRng } from './rng.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const LIFE = {
  // 부상: 경기에 나간 날, 피로가 safe를 넘은 만큼 × perFatigue 확률로 다친다. 영양사가 있으면 × nutriInjury
  injury: { safe: 60, perFatigue: 0.003, nutriInjury: 0.5, bad: 0.25, minor: [2, 4], major: [6, 12] },
  rehabCost: 2000,          // 프리미엄 재활 하루(2000만): 부상이 이틀치 낫는다
  eventChance: 0.3,         // 하루에 이벤트가 생길 확률
  houseRecover: 3,          // 집이 있으면 매일 피로 -3
  bedRest: 10,              // 수면 캡슐 침대: 휴식 피로 회복 +10
  nutriLoad: 0.7,           // 영양사: 경기 출전 피로 × 0.7
  fans: { min: 20, max: 60, per: 5000 },   // 시작 인기 = 20 + 연봉(만원)/5000 (20~60)
  adsPer: 3,                // 시즌 끝 광고 수입 = 인기² × 3만원 (인기 50 → 7500만, 100 → 3억)
};

// ── 쇼핑 ──
// season: 그 시즌만(다음 시즌엔 다시 계약), once: 한 번 사면 계속, repeat: 몇 번이든
export const SHOP = [
  { id: 'trainer', group: 'staff', type: 'season', name: '전담 트레이너', icon: '🧑‍🏫', price: 10000, desc: '훈련 경험치 +25%', xp: 1.25 },
  { id: 'coach', group: 'staff', type: 'season', name: '메이저리그 출신 코치', icon: '🎓', price: 50000, desc: '훈련 경험치 +60%', xp: 1.6 },
  { id: 'nutri', group: 'staff', type: 'season', name: '전담 영양사', icon: '🥗', price: 15000, desc: '경기 피로 -30% · 부상 위험 절반' },
  { id: 'gBat', group: 'gear', type: 'once', kind: 'bat', name: '맞춤 제작 배트', icon: '🏏', price: 8000, desc: '파워 +2 · 컨택 +1', gear: { power: 2, contact: 1 } },
  { id: 'gGoggle', group: 'gear', type: 'once', kind: 'bat', name: '고성능 스포츠 고글', icon: '🥽', price: 4000, desc: '선구안 +2', gear: { eye: 2 } },
  { id: 'gSpike', group: 'gear', type: 'once', kind: 'bat', name: '경량 스파이크', icon: '👟', price: 3000, desc: '주력 +3', gear: { speed: 3 } },
  { id: 'gGlove', group: 'gear', type: 'once', kind: 'pitch', name: '맞춤 글러브', icon: '🧤', price: 5000, desc: '제구 +2', gear: { control: 2 } },
  { id: 'gPSpike', group: 'gear', type: 'once', kind: 'pitch', name: '투구용 스파이크', icon: '👟', price: 4000, desc: '구속 +1km', gear: { velo: 1 } },
  { id: 'gBand', group: 'gear', type: 'once', kind: 'pitch', name: '트레이닝 밴드 세트', icon: '🪢', price: 3000, desc: '체력 +2', gear: { stamina: 2 } },
  { id: 'bed', group: 'life', type: 'once', name: '수면 캡슐 침대', icon: '🛏️', price: 2000, desc: '휴식할 때 피로가 10 더 풀려요' },
  { id: 'car', group: 'life', type: 'once', name: '스포츠카', icon: '🏎️', price: 40000, desc: '출근길이 화제 · 인기 +5', fans: 5 },
  { id: 'house', group: 'life', type: 'once', name: '대구 단독주택', icon: '🏡', price: 200000, desc: '매일 피로 -3 · 연고지 팬 인기 +10', fans: 10 },
  { id: 'donate', group: 'life', type: 'repeat', name: '어린이 야구단 기부', icon: '💝', price: 10000, desc: '인기 +8 · 몇 번이든', fans: 8 },
];
export const SHOP_GROUPS = [['staff', '🧑‍🏫 이번 시즌 계약', '시즌이 끝나면 계약도 끝나요'], ['gear', '🎒 장비', '한 번 사면 계속 써요'], ['life', '🏠 생활', '']];
export const itemOf = id => SHOP.find(x => x.id === id);

const owned = slot => slot.owned || {};
// 지금 효과가 있는지(시즌 계약은 그 해만)
export function has(slot, id) {
  const it = itemOf(id), v = owned(slot)[id];
  if (!it || !v) return false;
  return it.type === 'season' ? v === slot.year : true;
}
export function canBuy(slot, id) {
  const it = itemOf(id);
  if (!it || (it.kind && it.kind !== slot.kind)) return { ok: false, reason: 'kind' };
  if (it.type !== 'repeat' && has(slot, id)) return { ok: false, reason: 'owned' };
  if (id === 'trainer' && has(slot, 'coach')) return { ok: false, reason: 'owned' };   // 코치가 있으면 트레이너는 필요 없다
  if ((slot.assets || 0) < it.price) return { ok: false, reason: 'cash' };
  return { ok: true };
}
export function buyItem(slot, id) {
  const it = itemOf(id), c = canBuy(slot, id);
  if (!c.ok) return slot;
  const val = it.type === 'season' ? slot.year : it.type === 'repeat' ? (owned(slot)[id] || 0) + 1 : true;
  return { ...slot, assets: slot.assets - it.price, owned: { ...owned(slot), [id]: val }, fans: clamp(fansOf(slot) + (it.fans || 0), 0, 100) };
}
// 장비로 붙는 능력치
export function gearBonus(slot, stat) {
  return SHOP.reduce((a, it) => a + (it.gear && it.gear[stat] && has(slot, it.id) ? it.gear[stat] : 0), 0);
}
export const trainMult = slot => (has(slot, 'coach') ? itemOf('coach').xp : has(slot, 'trainer') ? itemOf('trainer').xp : 1);

// ── 인기 ──
export function fansOf(slot) {
  if (slot.fans != null) return slot.fans;
  const f = LIFE.fans, sal = slot.salary ?? 0;
  return Math.round(clamp(f.min + sal / f.per, f.min, f.max));
}
export const adsOf = slot => Math.round(fansOf(slot) ** 2 * LIFE.adsPer);

// ── 날마다 다른 난수 ──
function dayRng(slot, salt) {
  const s = slot.season || {}, post = s.post ? s.post.series.reduce((a, x) => a + x.games.length, 0) : 0;
  let h = 2166136261;
  for (const ch of `${slot.playerId}|${slot.year}|${s.round}|${post}|${salt}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return createRng(h >>> 0);
}

// ── 부상 ──
const HURT = {
  bat: ['햄스트링 부상', '손목 염좌', '발목 염좌', '옆구리 근육 손상', '허리 통증'],
  pitch: ['어깨 염증', '팔꿈치 통증', '손가락 물집', '허리 통증', '옆구리 근육 손상'],
};
export function injuryChance(slot) {
  const L = LIFE.injury;
  return Math.max(0, slot.fatigue - L.safe) * L.perFatigue * (has(slot, 'nutri') ? L.nutriInjury : 1);
}
// 경기에 나간 날 다쳤는지: { name, left(남은 경기), major } | null
export function rollInjury(slot) {
  const p = injuryChance(slot);
  if (p <= 0) return null;
  const rng = dayRng(slot, 'hurt');
  if (rng() >= p) return null;
  const L = LIFE.injury, major = rng() < L.bad, [lo, hi] = major ? L.major : L.minor;
  const names = HURT[slot.kind];
  return { name: names[Math.floor(rng() * names.length)], left: lo + Math.floor(rng() * (hi - lo + 1)), major };
}

// ── 랜덤 이벤트 ──
// 선택지 효과: cond(컨디션), fat(피로), fans(인기), cash(현금), xp(주 능력치 경험치), gamble: { p, win, lose }
// need: 보여 줄 조건
const MAIN = { bat: 'contact', pitch: 'control' };
export const EVENTS = [
  { id: 'tv', icon: '📺', title: '방송 인터뷰 요청', text: '스포츠 뉴스에서 단독 인터뷰를 하고 싶대요.',
    opts: [{ label: '인터뷰한다', fx: { fans: 5, fat: 5 }, say: '화면발이 잘 받았어요! 인기가 올랐어요.' }, { label: '정중히 거절', fx: { fat: -5 }, say: '조용히 쉬면서 몸을 챙겼어요.' }] },
  { id: 'sign', icon: '✍️', title: '팬 사인회', text: '구단에서 주말 팬 사인회에 나와 달래요.',
    opts: [{ label: '참가한다', fx: { fans: 8, fat: 10 }, say: '줄이 끝이 안 보였어요. 손목은 좀 아파요.' }, { label: '불참한다', fx: { fans: -3 }, say: '팬들이 조금 서운해해요.' }] },
  { id: 'slump', icon: '📉', title: '슬럼프 조짐', text: '요즘 감이 영 안 와요. 어떻게 할까요?', need: s => s.condition <= 0,
    opts: [{ label: '영상 분석 밤샘', fx: { xp: 3, fat: 15 }, say: '문제를 찾았어요! 대신 잠을 못 잤어요.' }, { label: '기분 전환 산책', fx: { cond: 1 }, say: '머리가 맑아졌어요.' }] },
  { id: 'dinner', icon: '🍖', title: '선배의 회식 초대', text: '고참 선배가 고기 사 준다고 나오래요.',
    opts: [{ label: '간다', fx: { cond: 1, fat: 8, fans: 1 }, say: '팀 분위기 최고! 조금 늦게 잤어요.' }, { label: '집에서 쉰다', fx: { fat: -10 }, say: '푹 잤어요.' }] },
  { id: 'cf', icon: '🎬', title: 'CF 광고 제의', text: '음료 회사에서 광고 모델 제의가 왔어요.', need: s => fansOf(s) >= 40,
    opts: [{ label: '찍는다', fx: { cashFans: 100, fat: 15 }, say: '촬영은 힘들었지만 통장이 두둑해졌어요.' }, { label: '시즌에 집중', fx: { cond: 1 }, say: '야구에만 집중하기로 했어요.' }] },
  { id: 'letter', icon: '💌', title: '어린이 팬의 편지', text: '"커서 꼭 형처럼 될 거예요!" 삐뚤빼뚤한 편지가 왔어요.',
    opts: [{ label: '사인볼과 답장 보내기', fx: { fans: 6, cond: 1 }, say: '아이가 SNS에 자랑했대요. 마음이 따뜻해졌어요.' }, { label: '고이 간직한다', fx: { cond: 1 }, say: '사물함에 붙여 뒀어요.' }] },
  { id: 'coin', icon: '🎲', title: '동료의 코인 추천', text: '"이거 무조건 간다니까?" 동료가 신종 코인을 추천해요. 1억이면 된대요.', need: s => (s.assets || 0) >= 10000,
    opts: [{ label: '1억 넣어 본다', fx: { cash: -10000, gamble: { p: 0.35, win: { cash: 30000 }, lose: {} } }, win: '대박! 3억이 됐어요!', lose: '휴지 조각이 됐어요… 1억 날렸어요.' }, { label: '거절한다', fx: {}, say: '그 코인은 일주일 뒤에 사라졌대요.' }] },
  { id: 'coachTip', icon: '🧑‍🏫', title: '코치의 특별 지도', text: '타격·투구 코치가 경기 전에 따로 봐 주겠대요.',
    opts: [{ label: '받는다', fx: { xp: 4, fat: 12 }, say: '감을 하나 잡았어요!' }, { label: '사양한다', fx: {}, say: '오늘은 컨디션 관리를 하기로 했어요.' }] },
  { id: 'rain', icon: '🌧️', title: '우천 지연', text: '비 때문에 경기가 한 시간 늦어진대요.',
    opts: [{ label: '라커룸에서 쉰다', fx: { fat: -12 }, say: '낮잠까지 잤어요.' }, { label: '실내 연습장으로', fx: { xp: 2, fat: 6 }, say: '몸을 미리 풀어 뒀어요.' }] },
  { id: 'troll', icon: '💬', title: '악플 폭탄', text: '지난 경기 뒤로 SNS에 악플이 쏟아져요.',
    opts: [{ label: '무시한다', fx: { cond: -1 }, say: '신경 안 쓰려 해도 쉽지 않네요.' }, { label: 'SNS 쉬기 선언', fx: { cond: 1, fans: -3 }, say: '마음이 편해졌어요.' },
      { label: '센스 있게 받아친다', fx: { gamble: { p: 0.5, win: { fans: 8 }, lose: { fans: -6, cond: -1 } } }, win: '재치 있는 답글이 화제가 됐어요!', lose: '말실수로 논란이 커졌어요…' }] },
  { id: 'gift', icon: '🎁', title: '후원사 선물', text: '용품 후원사에서 선물과 함께 격려금을 보냈어요.',
    opts: [{ label: '감사히 받는다', fx: { cash: 1000, cond: 1 }, say: '격려금 1000만원을 받았어요.' }] },
  { id: 'stiff', icon: '🩺', title: '몸이 찌뿌둥해요', text: '아침부터 몸이 무거워요.', need: s => s.fatigue >= 40,
    opts: [{ label: '병원 검진 (500만)', fx: { cash: -500, fat: -15 }, say: '이상 없대요. 물리치료도 받았어요.' }, { label: '참고 뛴다', fx: { fat: 5 }, say: '괜찮겠죠…?' }] },
  { id: 'charity', icon: '🤝', title: '자선 행사 초대', text: '소아암 어린이 돕기 행사에 와 달래요.',
    opts: [{ label: '참가하고 1000만 기부', fx: { cash: -1000, fans: 10, cond: 1 }, say: '뜻깊은 하루였어요.' }, { label: '사인 유니폼만 보낸다', fx: { fans: 2 }, say: '유니폼이 경매에서 높은 값에 팔렸대요.' }] },
  { id: 'insomnia', icon: '🌙', title: '불면증', text: '어젯밤 잠을 한숨도 못 잤어요.',
    opts: [{ label: '수면 클리닉 (300만)', fx: { cash: -300, cond: 1, fat: -5 }, say: '오랜만에 꿀잠 잤어요.' }, { label: '그냥 버틴다', fx: { cond: -1 }, say: '눈이 침침해요.' }] },
  { id: 'rival', icon: '🔥', title: '라이벌의 도발', text: '상대 팀 선수가 "별거 없더라"며 도발했어요.',
    opts: [{ label: '"그라운드에서 보자"', fx: { fans: 6, cond: 1, fat: 5 }, say: '팬들이 열광해요. 오늘 꼭 보여 줘야죠!' }, { label: '무시한다', fx: {}, say: '실력으로 말하면 돼요.' }] },
];
export const eventOf = id => EVENTS.find(e => e.id === id);
const visible = (slot, e) => !e.need || e.need(slot);

// 그날 이벤트(applyDay 끝에서 다음 날 것을 정한다): id | null
export function rollEvent(slot) {
  const rng = dayRng(slot, 'event');
  if (rng() >= LIFE.eventChance) return null;
  const list = EVENTS.filter(e => visible(slot, e));
  return list.length ? list[Math.floor(rng() * list.length)].id : null;
}
// 선택지를 고를 수 있는지(돈이 모자라면 못 고른다)
export const canPick = (slot, o) => !(o.fx.cash < 0) || (slot.assets || 0) >= -o.fx.cash;

// 이벤트 선택지 고르기: { slot, say, fx(실제로 적용된 효과) }. xp는 호출하는 쪽(raise.js)이 경험치로 바꾼다
export function resolveEvent(slot, k) {
  const e = eventOf(slot.event), o = e && e.opts[k];
  if (!o || !canPick(slot, o)) return null;
  let fx = { ...o.fx }, say = o.say;
  if (fx.gamble) {
    const g = fx.gamble, won = dayRng(slot, 'gamble')() < g.p;
    const extra = won ? g.win : g.lose;
    delete fx.gamble;
    for (const [k2, v] of Object.entries(extra)) fx[k2] = (fx[k2] || 0) + v;
    say = won ? o.win : o.lose;
  }
  if (fx.cashFans) { fx.cash = (fx.cash || 0) + fansOf(slot) * fx.cashFans; delete fx.cashFans; }
  const next = {
    ...slot, event: null,
    condition: clamp(slot.condition + (fx.cond || 0), -2, 2),
    fatigue: clamp(slot.fatigue + (fx.fat || 0), 0, 100),
    fans: clamp(fansOf(slot) + (fx.fans || 0), 0, 100),
    assets: Math.max(0, (slot.assets || 0) + (fx.cash || 0)),
  };
  return { slot: next, say, fx, stat: MAIN[slot.kind] };
}
