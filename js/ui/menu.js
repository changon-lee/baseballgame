// 메뉴: 상대팀, 이닝 수, 경기 시작, 타순 편집
import { TEAMS, USER_TEAM_ID } from '../data/rosters.js';

export function showMenu(root, settings, { onStart, onLineup }) {
  let { cpuTeamId, innings } = settings;
  const rivals = TEAMS.filter(t => t.id !== USER_TEAM_ID);
  root.innerHTML = `
  <div class="screen menu">
    <header class="hero">
      <div class="hero-tag">KBO · 개인용</div>
      <h1>삼성 라이온즈<br><span>야구</span></h1>
    </header>
    <section>
      <h2>상대 팀</h2>
      <div class="team-grid">${rivals.map(t => `
        <button class="team-btn" data-team="${t.id}" style="--c:${t.colors.main};--s:${t.colors.sub}">${t.short}</button>`).join('')}
      </div>
    </section>
    <section>
      <h2>이닝</h2>
      <div class="seg">${[3, 5, 9].map(n => `<button data-inn="${n}">${n}이닝</button>`).join('')}</div>
    </section>
    <div class="menu-actions">
      <button class="ghost" id="edit-lineup">타순 편집</button>
      <button class="primary" id="start">경기 시작</button>
    </div>
  </div>`;
  const sync = () => {
    root.querySelectorAll('[data-team]').forEach(b => b.classList.toggle('on', b.dataset.team === cpuTeamId));
    root.querySelectorAll('[data-inn]').forEach(b => b.classList.toggle('on', +b.dataset.inn === innings));
  };
  root.querySelectorAll('[data-team]').forEach(b => { b.onclick = () => { cpuTeamId = b.dataset.team; sync(); }; });
  root.querySelectorAll('[data-inn]').forEach(b => { b.onclick = () => { innings = +b.dataset.inn; sync(); }; });
  root.querySelector('#start').onclick = () => onStart({ cpuTeamId, innings });
  root.querySelector('#edit-lineup').onclick = () => onLineup({ cpuTeamId, innings });
  sync();
}
