// 선으로 그린 아이콘(24×24, 글자색을 따라간다). 이모지는 기기마다 모양이 달라서 메뉴·탭에는 이걸 쓴다
const P = {
  home: '<path d="M3 11.2 12 4l9 7.2"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-8"/><path d="M21 20H3"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.5-3.6 2.9-5.6 6.2-5.6s5.700 2 6.200 5.600"/><path d="M15.500 5.200a3 3 0 0 1 0 5.800"/><path d="M17.800 14.800c1.900.7 3.100 2.400 3.400 5.200"/>',
  train: '<path d="M6.500 7v10"/><path d="M17.500 7v10"/><path d="M3.500 9.500v5"/><path d="M20.500 9.500v5"/><path d="M6.500 12h11"/>',
  trophy: '<path d="M8 4h8v5.500a4 4 0 0 1-8 0z"/><path d="M8 5.500H4.500V7A3.500 3.500 0 0 0 8 10.500"/><path d="M16 5.500h3.500V7A3.500 3.500 0 0 1 16 10.500"/><path d="M12 13.500V17"/><path d="M8.500 20h7"/><path d="M9.500 17h5v3h-5z"/>',
  grow: '<path d="M12 20v-8"/><path d="M12 14c0-4.200-2.600-6.400-7-6.400C5 11.800 7.600 14 12 14z"/><path d="M12 11.500c0-3.600 2.300-5.800 6.500-6 .1 3.900-2.200 6-6.500 6z"/><path d="M7 20h10"/>',
  versus: '<rect x="3" y="5" width="7" height="14" rx="1.800"/><rect x="14" y="5" width="7" height="14" rx="1.800"/><path d="M11.300 10.500h1.400M11.300 13.500h1.400"/>',
  play: '<path d="M8 5.500v13l10.500-6.500z" fill="currentColor"/>',
  chev: '<path d="m9.500 5.500 6.500 6.500-6.500 6.500"/>',
  back: '<path d="M14.500 5.500 8 12l6.500 6.500"/>',
  ball: '<circle cx="12" cy="12" r="8.500"/><path d="M6.200 6c2 1.700 3 3.700 3 6s-1 4.300-3 6"/><path d="M17.800 6c-2 1.700-3 3.700-3 6s1 4.300 3 6"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
