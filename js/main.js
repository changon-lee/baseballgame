// 화면 전환: 메뉴 → (타순) → 경기
import { USER_TEAM_ID, getTeam } from './data/rosters.js';
import { loadLineup } from './core/team.js';
import { showMenu } from './ui/menu.js';
import { showLineup } from './ui/lineup.js';

const app = document.getElementById('app');
const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const userTeam = getTeam(USER_TEAM_ID);
let settings = { cpuTeamId: 'lg', innings: 9 };
let lineup = loadLineup(storage, userTeam);

function menu() {
  showMenu(app, settings, {
    onStart: s => { settings = s; startGame(); },
    onLineup: s => { settings = s; showLineup(app, userTeam, storage, lineup, l => { lineup = l; menu(); }); },
  });
}

async function startGame() {
  let mod = null;
  try { mod = await import('./ui/game.js'); } catch (e) { mod = null; }
  if (!mod) {
    app.innerHTML = '<div class="screen"><h2>경기 화면 준비 중</h2><button class="primary" id="back">메뉴로</button></div>';
    app.querySelector('#back').onclick = menu;
    return;
  }
  mod.showGame(app, { userTeam, cpuTeam: getTeam(settings.cpuTeamId), lineup, innings: settings.innings }, menu);
}

if (location.hash.startsWith("#game")) { settings = { cpuTeamId: location.hash.split("-")[1] || "lg", innings: 1 }; startGame(); }
else if (location.hash === "#lineup") showLineup(app, userTeam, storage, lineup, l => { lineup = l; menu(); });
else menu();
