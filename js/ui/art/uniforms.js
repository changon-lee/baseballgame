// 유니폼 색: 홈 = 흰색 + 구단색, 원정 = 회색 + 구단색 (로고 없음)
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
};

export function uniformFor(team, side) {
  const main = team.colors.main, sub = team.colors.sub;
  const home = side === 'home';
  const jersey = home ? '#f4f6f9' : '#8d939c';
  const pants = home ? '#f1f3f6' : '#959ba4';
  return {
    jersey, jerseyD: shade(jersey, 0.78), jerseyL: shade(jersey, 1.08),
    pants, pantsD: shade(pants, 0.78),
    trim: main, trimD: shade(main, 0.7), accent: sub,
    sleeve: main, sleeveD: shade(main, 0.7),          // 언더셔츠 긴팔
    cap: main, capD: shade(main, 0.65),
    sock: main, belt: shade(main, 0.6),
    num: home ? main : '#ffffff', numEdge: home ? sub === '#FFFFFF' ? '#ffffff' : sub : main,
    glove: '#8a5a2b', gloveD: '#5e3a17',
    batGlove: home ? main : sub,
  };
}
