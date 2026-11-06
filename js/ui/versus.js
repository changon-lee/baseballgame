// 1:1 대결 로비: 내 팀 고르기 → 방 만들기(이닝·난이도, 4자리 코드) 또는 코드로 들어가기 → 둘 다 모이면 경기 시작
// 두 폰 모두 같은 와이파이에서 이 컴퓨터(server.mjs)의 주소로 접속해야 한다. 기록·성장에는 반영되지 않는다.
import { TEAMS, USER_TEAM_ID, getTeam } from '../data/rosters.js';
import { loadLineup } from '../core/team.js';
import { LEVELS, LEVEL_NAME } from './prefs.js';
import { connect } from './net.js';

const KEY = 'bb.versus';
const load = () => { try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = v => { try { window.localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 무시 */ } };

export function showVersus(root, { storage, loadGame, onBack }) {
  const saved = load();
  let team = getTeam(saved.team) ? saved.team : USER_TEAM_ID;
  let innings = [1, 3, 5, 9].includes(saved.innings) ? saved.innings : 3;
  let level = LEVELS.includes(saved.level) ? saved.level : 'normal';
  let conn = null, state = 'connecting', code = '', error = '';

  const lineupOf = id => loadLineup(storage, getTeam(id));
  function open() {
    state = 'connecting'; render();
    conn = connect({
      onOpen: () => { state = 'lobby'; render(); },
      onClose: () => { conn = null; state = 'offline'; render(); },
      onMessage: m => {
        if (m.t === 'error') { error = m.msg; if (state === 'joining') state = 'lobby'; render(); }
        else if (m.t === 'created') { code = m.code; state = 'waiting'; render(); }
        else if (m.t === 'start') startGame(m);
      },
    });
  }

  async function startGame(m) {
    const mod = await loadGame();
    if (!mod) { conn.close(); return onBack(); }
    const home = getTeam(m.home.team), away = getTeam(m.away.team), me = m.side === 'home' ? home : away;
    mod.showGame(root, {
      userTeam: home, cpuTeam: away, lineup: m.home.lineup, cpuLineup: m.away.lineup, cpuStarterId: m.away.lineup.starterId,
      innings: m.innings, title: `1:1 대결 · 나: ${me.short}`,
      net: { side: m.side, level: m.level, conn },
    }, () => { conn = null; showVersus(root, { storage, loadGame, onBack }); });
  }

  function render() {
    const offline = state === 'offline';
    root.innerHTML = `
    <div class="screen menu versus">
      <header class="bar"><button class="ghost small" id="back">←</button><h2>1:1 대결</h2></header>
      <p class="hint">같은 와이파이의 폰 두 대로 겨뤄요. 기록·성장에는 반영되지 않아요.</p>
      ${offline ? `<section class="card slim">
        <div class="card-h">서버에 연결되지 않았어요</div>
        <p class="hint">컴퓨터에서 <b>node server.mjs</b>를 실행하고, 두 폰 모두 그때 나오는 주소(예: http://192.168.0.10:8000)로 접속해 주세요.
          깃허브 페이지 주소에서는 대결을 할 수 없어요.</p>
        <div class="actions"><button class="primary" data-act="retry">다시 연결</button></div>
      </section>` : state === 'connecting' ? '<p class="hint">서버에 연결하는 중…</p>' : state === 'waiting' ? `<section class="card vs-wait">
        <div class="card-h center">상대에게 이 코드를 알려 주세요</div>
        <div class="vs-code">${code}</div>
        <p class="hint" style="text-align:center">상대가 들어오면 바로 시작해요 · 나: ${getTeam(team).short}(홈) · ${innings}이닝 · ${LEVEL_NAME[level]}</p>
        <div class="actions"><button class="ghost" data-act="cancel">취소</button></div>
      </section>` : `
      <section>
        <div class="label">내 팀</div>
        <div class="team-grid">${TEAMS.map(t => `
          <button class="team-btn${t.id === team ? ' on' : ''}" data-team="${t.id}" style="--c:${t.colors.main};--s:${t.colors.sub}">${t.short}</button>`).join('')}
        </div>
      </section>
      <section class="card slim">
        <div class="card-h">방 만들기 <small style="font-weight:500">· 내가 홈팀(말 공격)</small></div>
        <div class="label">이닝</div>
        <div class="seg">${[1, 3, 5, 9].map(n => `<button data-inn="${n}" class="${n === innings ? 'on' : ''}">${n}이닝</button>`).join('')}</div>
        <div class="label">난이도 <small>(둘 다 같게)</small></div>
        <div class="seg">${LEVELS.map(l => `<button data-lv="${l}" class="${l === level ? 'on' : ''}">${LEVEL_NAME[l]}</button>`).join('')}</div>
        <div class="actions"><button class="primary" data-act="create">방 만들기</button></div>
      </section>
      <section class="card slim">
        <div class="card-h">방 들어가기 <small style="font-weight:500">· 원정팀(초 공격)</small></div>
        <div class="vs-join"><input id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="코드 4자리" autocomplete="off">
          <button class="primary" data-act="join"${state === 'joining' ? ' disabled' : ''}>들어가기</button></div>
        ${error ? `<p class="hint vs-err">${error}</p>` : ''}
      </section>`}
    </div>`;
    const $ = s => root.querySelector(s);
    const act = (a, fn) => { const el = root.querySelector(`[data-act=${a}]`); if (el) el.onclick = fn; };
    $('#back').onclick = () => { if (conn) conn.close(); conn = null; onBack(); };
    root.querySelectorAll('[data-team]').forEach(b => { b.onclick = () => { team = b.dataset.team; error = ''; save({ team, innings, level }); render(); }; });
    root.querySelectorAll('[data-inn]').forEach(b => { b.onclick = () => { innings = +b.dataset.inn; save({ team, innings, level }); render(); }; });
    root.querySelectorAll('[data-lv]').forEach(b => { b.onclick = () => { level = b.dataset.lv; save({ team, innings, level }); render(); }; });
    act('retry', open);
    act('create', () => { error = ''; conn && conn.send({ t: 'create', team, lineup: lineupOf(team), innings, level }); });
    act('cancel', () => { if (conn) conn.close(); open(); });
    act('join', () => {
      const v = ($('#code').value || '').trim();
      if (!/^\d{4}$/.test(v)) { error = '코드 4자리를 넣어 주세요'; return render(); }
      error = ''; state = 'joining';
      conn && conn.send({ t: 'join', code: v, team, lineup: lineupOf(team) });
      render(); const c = $('#code'); if (c) c.value = v;
    });
    const c = $('#code');
    if (c) c.onkeydown = e => { if (e.key === 'Enter') root.querySelector('[data-act=join]').click(); };
  }
  open();
}
