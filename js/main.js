// 화면 전환: 시즌 허브 ↔ 경기 / 결과 / 타순 / 친선 경기
import { USER_TEAM_ID, getTeam } from './data/rosters.js';
import { loadLineup } from './core/team.js';
import { createRng } from './core/rng.js';
import { nextUserGame, nextStarter } from './core/season.js';
import { newCareer, loadCareer, saveCareer, startSeason, applyUserGame, applyAutoGame, finishSeason, userTeamNow, userTeamTired } from './core/career.js';
import { PRACTICE, applyPractice } from './core/practice.js';
import { showMenu } from './ui/menu.js';
import { showLineup } from './ui/lineup.js';
import { showHub, showResult, showPracticeResult } from './ui/hub.js';
import './ui/art/sprites.js';   // 경기 그림을 홈 화면에서 미리 불러 둔다
import './ui/art/stadium.js';

const app = document.getElementById('app');
const storage = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
let career = loadCareer(storage);
let lineup = loadLineup(storage, getTeam(USER_TEAM_ID));
let exhibition = { cpuTeamId: 'lg', innings: 9 };
let saveOk = true;
const hubCtx = { tab: 'home', setup: { cycles: 2, innings: 9 }, starterId: null };

const persist = () => { saveOk = saveCareer(storage, career); };
const scrollTop = () => { const sc = app.querySelector('.screen'); if (sc) sc.scrollTop = 0; };

function hub() {
  showHub(app, Object.assign(hubCtx, {
    career, saveOk,
    on: {
      startSeason: set => { career = startSeason(career, set); hubCtx.starterId = null; persist(); hub(); scrollTop(); },
      play: starterId => playSeasonGame(starterId),
      auto: starterId => {
        const title = nextUserGame(career.season).label;
        const r = applyAutoGame(career, rng, { userLineup: lineup, userStarterId: starterId });
        afterGame(r, title);
      },
      autoMany: starterId => {
        // 정규시즌이면 남은 정규시즌 전부, 포스트시즌이면 끝까지(삼성 경기가 오면 멈춤)
        const phase = career.season.phase;
        const ups = [];
        for (let i = 0; i < 2000 && career.season.phase === phase; i++) {
          const g = nextUserGame(career.season);
          if (phase === 'post' && g.userGame) break;
          const r = applyAutoGame(career, rng, { userLineup: lineup, userStarterId: i === 0 ? starterId : undefined });
          career = r.career; ups.push(...r.ups);
        }
        hubCtx.starterId = null; persist();
        const heading = phase === 'regular' ? '정규시즌 종료' : career.season.phase === 'done' ? '시즌 종료' : '자동 진행';
        showResult(app, { career, game: null, ups: mergeUps(ups), title: '자동 진행 완료', heading }, hub);
      },
      finish: () => { career = finishSeason(career); hubCtx.tab = 'records'; persist(); hub(); },
      lineup: () => showLineup(app, userTeamNow(career), storage, lineup, l => { lineup = l; hub(); }),
      exhibition: () => exhibitionMenu(),
      practice: (kind, playerId, stat) => playPractice(kind, playerId, stat),
      versus: () => versusMenu(),
      reset: () => { career = newCareer(); hubCtx.tab = 'home'; persist(); hub(); },
    },
  }));
}

function mergeUps(ups) {
  const out = [];
  for (const u of ups) { const m = out.find(x => x.id === u.id && x.stat === u.stat); if (m) m.n += u.n; else out.push({ ...u }); }
  return out;
}

function afterGame(r, title) {
  career = r.career; hubCtx.starterId = null; persist();
  showResult(app, { career, game: r.game, ups: r.ups, achv: r.achv, title }, () => { hubCtx.tab = 'home'; hub(); });
}

async function loadGame() {
  try { return await import('./ui/game.js'); } catch (e) { return null; }
}

// 연습장: 투구 연습은 내가 던지고, 타격 연습은 내가 친다. 정해진 공 수를 채우면 경험치가 쌓인다
async function playPractice(kind, playerId, stat) {
  const mod = await loadGame();
  if (!mod) return hub();
  const team = userTeamNow(career), base = loadLineup(storage, team);
  const player = kind === 'pitch' ? team.pitchers.find(p => p.id === playerId) : team.batters.find(b => b.id === playerId);
  if (!player) return hub();
  const lu = kind === 'pitch' ? { ...base, starterId: playerId } : { ...base, order: Array(9).fill(playerId) };
  mod.showGame(app, {
    userTeam: team, cpuTeam: getTeam('lg'), lineup: lu, innings: 99, title: `${kind === 'pitch' ? '투구' : '타격'} 연습장 · ${player.name}`,
    practice: { kind, playerId, stat, goal: PRACTICE.goal[kind] },
  }, result => {
    const pr = result && result.practice;
    if (!pr) return hub();
    const r = applyPractice(career, pr);
    career = r.career; persist();
    showPracticeResult(app, { career, kind, playerId, stat, n: pr.n, pts: pr.pts, xp: r.xp, ups: r.ups, saved: r.xp > 0 }, () => { hubCtx.tab = 'practice'; hub(); });
  });
}

async function playSeasonGame(starterId) {
  const s = career.season, g = nextUserGame(s);
  const mod = await loadGame();
  if (!mod) return hub();
  const opp = getTeam(g.opponentId);
  const sid = starterId || nextStarter(s, USER_TEAM_ID);
  mod.showGame(app, {
    userTeam: userTeamTired(career), cpuTeam: opp, lineup: { ...lineup, starterId: sid },
    innings: s.innings, cpuStarterId: nextStarter(s, opp.id), title: g.label, stats: career.stats,
  }, result => {
    if (!result) return hub();
    afterGame(applyUserGame(career, result, rng, { userLineup: lineup }), g.label);
  });
}

function exhibitionMenu() {
  showMenu(app, exhibition, {
    onStart: async set => {
      exhibition = set;
      const mod = await loadGame();
      if (!mod) return hub();
      mod.showGame(app, { userTeam: userTeamNow(career), cpuTeam: getTeam(set.cpuTeamId), lineup, innings: set.innings, title: '친선 경기', stats: career.stats }, () => exhibitionMenu());
    },
    onLineup: set => { exhibition = set; showLineup(app, userTeamNow(career), storage, lineup, l => { lineup = l; exhibitionMenu(); }); },
    onBack: hub,
  });
}

async function versusMenu() {
  const { showVersus } = await import('./ui/versus.js');
  showVersus(app, { storage, loadGame, onBack: hub });
}

// 개발용 주소: #game[-팀] 1이닝 친선 경기, #lineup 타순 화면, #vs 1:1 대결
if (location.hash.startsWith('#game')) {
  loadGame().then(mod => mod && mod.showGame(app, { userTeam: userTeamNow(career), cpuTeam: getTeam(location.hash.split('-')[1] || 'lg'), lineup, innings: 1, stats: career.stats }, hub));
} else if (location.hash === '#vs') versusMenu();
else if (location.hash === '#lineup') showLineup(app, userTeamNow(career), storage, lineup, l => { lineup = l; hub(); });
else hub();
