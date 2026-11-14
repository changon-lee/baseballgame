// 육성모드 재테크: 자산(현금)을 예금·부동산·주식·금·코인에 나눠 넣고, 정규시즌 하루가 지날 때마다 시세가 움직인다.
// 돈은 모두 만원 단위. slot.assets = 현금, slot.invest = { [상품]: { v: 평가액, c: 넣은 돈(원금) } }
// 시세는 (연도, 날짜)로 정해져서 모든 슬롯이 같은 시장을 본다. 정규시즌 N일이 지나면 1년치가 움직인다.
import { createRng, randNormal } from './rng.js';

// mu: 1년 기대 수익(로그), sigma: 1년 변동성, rho: 시장 전체와 같이 움직이는 정도, fee: 살 때 드는 비용
export const PRODUCTS = [
  { id: 'deposit', name: '정기예금', icon: '🏦', mu: 0.03, sigma: 0, rho: 0, fee: 0, risk: 0, desc: '연 3% 이자 · 원금 그대로' },
  { id: 'estate', name: '서울 아파트', icon: '🏢', mu: 0.055, sigma: 0.08, rho: 0.2, fee: 0.03, risk: 1, desc: '천천히 꾸준히 · 살 때 세금·중개비 3%' },
  { id: 'gold', name: '금', icon: '🥇', mu: 0.05, sigma: 0.14, rho: 0, fee: 0, risk: 2, desc: '주식과 따로 움직여요' },
  { id: 'kospi', name: '코스피', icon: '📊', mu: 0.06, sigma: 0.2, rho: 0.7, fee: 0, risk: 2, desc: '한국 대표 주식들' },
  { id: 'snp', name: 'S&P 500', icon: '📈', mu: 0.09, sigma: 0.16, rho: 0.9, fee: 0, risk: 2, desc: '미국 대표 500개 기업' },
  { id: 'nasdaq', name: '나스닥', icon: '🚀', mu: 0.12, sigma: 0.24, rho: 0.9, fee: 0, risk: 3, desc: '미국 기술주 · 크게 오르고 크게 빠져요' },
  { id: 'btc', name: '비트코인', icon: '🪙', mu: 0.2, sigma: 0.7, rho: 0.4, fee: 0, risk: 4, desc: '대박 아니면 쪽박' },
];
export const RISK = ['안전', '낮음', '보통', '높음', '아주 높음'];
export const productOf = id => PRODUCTS.find(p => p.id === id);

const holdings = slot => slot.invest || {};
export const investedValue = slot => Object.values(holdings(slot)).reduce((a, h) => a + h.v, 0);
export const netWorth = slot => (slot.assets || 0) + investedValue(slot);

// 사기: 현금에서 amount만큼(살 때 비용을 빼고 평가액이 된다)
export function buy(slot, id, amount) {
  const p = productOf(id), cash = slot.assets || 0;
  amount = Math.floor(Math.min(amount, cash));
  if (!p || amount <= 0) return slot;
  const h = holdings(slot)[id] || { v: 0, c: 0 };
  return { ...slot, assets: cash - amount, invest: { ...holdings(slot), [id]: { v: h.v + amount * (1 - p.fee), c: h.c + amount } } };
}

// 팔기: 평가액에서 amount만큼 현금으로(원금도 그 비율만큼 줄어든다). 다 팔면 목록에서 빠진다
export function sell(slot, id, amount) {
  const h = holdings(slot)[id];
  if (!h || amount <= 0) return slot;
  const all = amount >= h.v - 0.5;
  const take = all ? h.v : amount;
  const rest = { ...holdings(slot) };
  if (all) delete rest[id];
  else rest[id] = { v: h.v - take, c: h.c * (1 - take / h.v) };
  return { ...slot, assets: Math.round((slot.assets || 0) + take), invest: rest };
}

// 하루 시세: 상품마다 오늘 곱해질 값. 정규시즌 days일 = 1년
export function marketDay(year, day, days) {
  const rng = createRng((year * 1009 + day * 7919 + 0x5eed) >>> 0);
  const zm = randNormal(rng), out = {};
  for (const p of PRODUCTS) {
    const z = p.rho * zm + Math.sqrt(1 - p.rho * p.rho) * randNormal(rng);
    out[p.id] = Math.exp((p.mu - (p.sigma * p.sigma) / 2) / days + (p.sigma / Math.sqrt(days)) * z);
  }
  return out;
}

// 하루가 지나면: 들고 있는 것 평가액이 움직이고, 올해 시장 흐름(mkt: 상품별 누적 배수)도 쌓인다
// 돌려주는 것: { invest, mkt, change(오늘 평가액 변화) }
export function tickMarket(slot, day, days) {
  const f = marketDay(slot.year, day, days), inv = {};
  let change = 0;
  for (const [id, h] of Object.entries(holdings(slot))) {
    const v = h.v * (f[id] ?? 1);
    change += v - h.v;
    inv[id] = { ...h, v };
  }
  const mkt = Object.fromEntries(PRODUCTS.map(p => [p.id, ((slot.mkt || {})[p.id] ?? 1) * f[p.id]]));
  return { invest: inv, mkt, change };
}
