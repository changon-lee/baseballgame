// 게임 메인 화면: 육성모드(큰 카드) · 시즌모드 · 대결모드 중 하나를 고른다
import { USER_TEAM_ID } from '../data/rosters.js';
import { badge } from './hub.js';
import { icon } from './icons.js';

const asset = path => new URL('../../assets/' + path, import.meta.url).href;

// info: { season: 시즌모드 한 줄, seasonOn: 진행 중인 시즌이 있다, raise: 육성모드 한 줄 }, on: { season, raise, versus }
export function showTitle(root, { info = {}, on }) {
  root.innerHTML = `
  <div class="screen title">
    <div class="t-bg" style="background-image:url('${asset('ui/title_bg.webp')}')"></div>
    <div class="t-flare"></div>
    <img class="t-man" alt="" src="${asset('ui/title_man.webp')}">
    <div class="t-shade"></div>
    <header class="t-head">
      <div class="t-league">${badge(USER_TEAM_ID, 'sm')}<span>KBO LEAGUE</span></div>
      <h1><small>SAMSUNG LIONS</small>삼성<br>라이온즈</h1>
      <p>PRO BASEBALL</p>
    </header>
    <main class="t-modes">
      <button class="t-card main" data-mode="raise">
        <i>${icon('grow')}</i>
        <span><b>육성모드</b><small>${info.raise || '선수 한 명을 골라 끝없이 키워요'}</small></span>
        <em>${info.raise ? '이어하기' : '시작하기'}${icon('play')}</em>
      </button>
      <div class="t-row">
        <button class="t-card" data-mode="season">
          <i>${icon('trophy')}</i>
          <span><b>시즌모드</b><small>${info.season || '팀을 이끌고 우승에 도전'}</small></span>${icon('chev', 'go')}
        </button>
        <button class="t-card" data-mode="versus">
          <i>${icon('versus')}</i>
          <span><b>대결모드</b><small>폰 두 대로 1:1 대결</small></span>${icon('chev', 'go')}
        </button>
      </div>
    </main>
  </div>`;
  root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => on[b.dataset.mode](); });
}
