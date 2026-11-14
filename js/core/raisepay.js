// 육성모드 연봉·자산. 돈은 모두 만원 단위.
// 한 해가 끝나면(다음 시즌으로 넘어갈 때) 그 해 연봉이 자산에 쌓이고, 시즌 성적으로 다음 해 연봉이 정해진다.
//
// 시작 연봉: 2026 KBO 연봉(구단 발표·보도 기준, 외국인은 달러 계약을 1달러 ≈ 1400원으로). '추정'은 보도를 못 찾아 비슷한 선수로 잡은 값
// 성적 → 연봉 기준: 실제 KBO 시세(리그 평균 약 1.7억, 최고 30~42억, 김도영 1억 → 5억)를 따르되,
// 육성모드 선수는 직접 조작이라 성적이 잘 나오기 쉬워서 조금 보수적으로(× scale) 잡았다
const START = {
  'samsung-b01': 23000,   // 김지찬 2억 3000만
  'samsung-b02': 20000,   // 김성윤 2억
  'samsung-b03': 200000,  // 구자욱 20억(2025 발표 기준)
  'samsung-b04': 224000,  // 디아즈 160만 달러
  'samsung-b05': 40000,   // 최형우 4억
  'samsung-b06': 22000,   // 김영웅 2억 2000만
  'samsung-b07': 30000,   // 강민호 3억
  'samsung-b08': 29000,   // 이재현 2억 9000만
  'samsung-b09': 70000,   // 류지혁 7억
  'samsung-b10': 8000,    // 이성규 (추정)
  'samsung-b11': 7000,    // 전병우 (추정)
  'samsung-b12': 10000,   // 김헌곤 1억
  'samsung-p01': 100000,  // 원태인 10억
  'samsung-p02': 238000,  // 후라도 170만 달러
  'samsung-p03': 160000,  // 최원태 16억
  'samsung-p04': 15000,   // 이승현 1억 5000만
  'samsung-p05': 80000,   // 김재윤 8억
  'samsung-p06': 9000,    // 배찬승 9000만
  'samsung-p07': 10000,   // 이호성 1억
  'samsung-p08': 12000,   // 김태훈 (추정)
  'samsung-p09': 20000,   // 백정현 (추정)
};

export const PAY = {
  min: 3000,              // 최저 연봉 3000만
  raiseMax: 3,            // 한 번에 최대 3배(+200%)
  cutMax: 0.4,            // 한 번에 최대 40% 삭감
  toward: 0.7,            // 성적 기준 연봉 쪽으로 이만큼 다가간다(협상)
  scale: 0.85,            // 실제 시세보다 조금 보수적으로
  champBonus: 5000,       // 한국시리즈 우승 보너스(자산으로 바로)
  champPremium: 1.1,      // 우승한 해는 다음 연봉 기준 +10%
  // 성적 → 연봉 기준(억). [기록, 억]을 이어 그은 선
  batOps: [[0.55, 0.4], [0.65, 0.8], [0.75, 1.8], [0.85, 4], [0.95, 8], [1.05, 13], [1.15, 18], [1.3, 24]],
  spEra: [[2.0, 14], [2.5, 11], [3.0, 8], [3.5, 5], [4.0, 3], [4.5, 1.8], [5.0, 1.1], [6.0, 0.6], [8.0, 0.3]],
  rpEra: [[1.5, 5], [2.5, 3.5], [3.5, 2], [4.5, 1.1], [6.0, 0.5], [8.0, 0.3]],
  savePer144: 0.09,       // 마무리: 144경기 기준 세이브 하나에 900만
  // 제대로 뛰었는지: 타자는 팀 경기 × 3.1타석, 선발은 팀 경기 × 1이닝, 불펜은 팀 경기 × 0.4이닝을 채우면 100%
  full: { bat: 3.1, SP: 1, CL: 0.4 },
};

export const startSalary = id => START[id] ?? PAY.min;

function curve(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i], [x0, y0] = points[i - 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

// 이번 시즌 성적으로 본 연봉 기준(만원)
function target(slot) {
  const st = slot.stats || {}, games = slot.season.schedule.length || 1;
  let eok;
  if (slot.kind === 'bat') {
    const b = st.bat;
    if (!b || !b.ab) return PAY.min;
    const ops = (b.h + b.bb) / (b.ab + b.bb) + (b.h + b.d2 + 2 * b.d3 + 3 * b.hr) / b.ab;
    eok = curve(PAY.batOps, ops) * Math.min(1, b.pa / (PAY.full.bat * games));
  } else {
    const p = st.pit;
    if (!p || !p.outs) return PAY.min;
    const era = (p.r * 27) / p.outs, ip = p.outs / 3;
    if (slot.role === 'SP') eok = curve(PAY.spEra, era) * Math.min(1, ip / (PAY.full.SP * games));
    else eok = curve(PAY.rpEra, era) * Math.min(1, ip / (PAY.full.CL * games)) + ((st.sv || 0) * 144 / games) * PAY.savePer144;
  }
  return eok * 10000 * PAY.scale;
}

// 1억 이상은 500만, 그 아래는 100만 단위(f: Math.round / ceil / floor — 한도를 넘지 않게)
const roundPay = (m, f = Math.round) => { const u = m >= 10000 ? 500 : 100; return f(m / u) * u; };

// 다음 해 연봉 협상: { from, to, pct(%), bonus(우승 보너스) }
export function contract(slot) {
  const from = slot.salary ?? startSalary(slot.playerId);
  const champ = slot.season.champion === 'samsung';
  const goal = target(slot) * (champ ? PAY.champPremium : 1);
  let to = from + (goal - from) * PAY.toward;
  const lo = from * (1 - PAY.cutMax), hi = from * PAY.raiseMax;
  to = roundPay(Math.min(hi, Math.max(lo, to)));
  if (to < lo) to = roundPay(lo, Math.ceil);
  if (to > hi) to = roundPay(hi, Math.floor);
  to = Math.max(PAY.min, to);
  return { from, to, pct: Math.round(((to - from) / from) * 100), bonus: champ ? PAY.champBonus : 0 };
}

// 만원 → '20억원', '2억 3000만원', '9000만원'
export function won(m) {
  const a = Math.abs(Math.round(m)), eok = Math.floor(a / 10000), man = a % 10000;
  if (!a) return '0원';
  return (m < 0 ? '-' : '') + (eok ? `${eok}억${man ? ` ${man}만원` : '원'}` : `${man}만원`);
}
