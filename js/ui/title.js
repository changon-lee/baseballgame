// 게임 메인 화면: 시즌모드 · 육성모드 · 대결모드 중 하나를 고른다
import { USER_TEAM_ID } from '../data/rosters.js';
import { badge } from './hub.js';

const asset = path => new URL('../../assets/' + path, import.meta.url).href;

// info: { season: 시즌모드 한 줄, raise: 육성모드 한 줄 }, on: { season, raise, versus }
export function showTitle(root, { info = {}, on }) {
  const modes = [
    ['season', '🏆', '시즌모드', '삼성을 이끌고 정규시즌과 가을야구 우승에 도전해요', info.season],
    ['raise', '🌱', '육성모드', '삼성 선수 한 명을 골라 훈련·휴식·경기로 끝없이 키워요', info.raise],
    ['versus', '📱', '대결모드', '같은 와이파이의 폰 두 대로 1:1로 겨뤄요', null],
  ];
  root.innerHTML = `
  <div class="screen hub title">
    <header class="top-hero">
      <img class="hero-man" alt="" src="${asset('sprites/batter_idle_front_0.webp')}">
      <div class="eyebrow">KBO LEAGUE</div>
      <div class="hero-row">${badge(USER_TEAM_ID, 'xl')}<div class="hero-text"><h1>삼성 라이온즈</h1><p class="sub">모드를 골라 주세요</p></div></div>
    </header>
    <main class="modes">${modes.map(([k, icon, name, desc, now]) => `
      <button class="mode-card" data-mode="${k}"><i>${icon}</i><span><b>${name}</b><small>${desc}</small>${now ? `<em>${now}</em>` : ''}</span><u>›</u></button>`).join('')}
    </main>
  </div>`;
  root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => on[b.dataset.mode](); });
}
