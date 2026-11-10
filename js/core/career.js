// 커리어 = 여러 시즌에 걸친 진행 상태 (현재 시즌, 선수 성장, 시즌 기록, 역대 성적). 브라우저 저장소에 보관.
import { USER_TEAM_ID, getTeam } from '../data/rosters.js';
import { createSeason, recordRound, recordPostGame, seasonSummary } from './season.js';
import { createGrowth, gainFromLog, applyGrowth, playerLine } from './growth.js';
import { fatigueAfterGame, applyFatigue } from './fatigue.js';
import { gameAchievements, seasonAchievements, careerAchievements, award } from './achievements.js';

const KEY = 'baseball.career.v1';
const ME = USER_TEAM_ID;

// day: 지금까지 지난 날 수(경기 한 라운드 = 하루). fatigue: 투수 피로. practice: 오늘 한 연습 횟수
// achv: 업적 { id: { year, n } }, achvNew: 지난 시즌을 마치며 새로 달성한 업적(기록 탭에 NEW로 보인다)
export const newCareer = () => ({ v: 1, nextYear: 2027, season: null, growth: createGrowth(), stats: {}, total: {}, history: [], day: 0, fatigue: {}, practice: { day: -1, used: 0 }, achv: {}, achvNew: [] });

export function loadCareer(storage) {
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.v === 1 && Array.isArray(c.history)) return { ...newCareer(), ...c };
    }
  } catch (e) { /* 저장소 막힘 또는 손상 → 새 커리어 */ }
  return newCareer();
}

export function saveCareer(storage, c) {
  try { storage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
}

export const userTeamNow = c => applyGrowth(getTeam(ME), c.growth);
// 경기에 나가는 우리 팀: 성장 + 투수 피로 반영
export const userTeamTired = c => applyFatigue(userTeamNow(c), c);
const teamGetter = c => id => (id === ME ? userTeamTired(c) : getTeam(id));

export function startSeason(c, { cycles, innings }) {
  return { ...c, season: createSeason({ cycles, innings, year: c.nextYear }), stats: {}, achvNew: [] };
}

const mineOnly = line => {
  const pick = o => Object.fromEntries(Object.entries(o).filter(([id]) => id.startsWith(ME + '-')));
  return { bat: pick(line.bat), pit: pick(line.pit) };
};

// result: { home, away, starterId?, log } (삼성 홈 기준 점수) 또는 null(자동 진행)
export function applyUserGame(c, result, rng, { userLineup, userStarterId } = {}) {
  const s = c.season;
  const opts = { getT: teamGetter(c), userLineup, userStarterId };
  let season, game;
  if (s.phase === 'regular') {
    const r = recordRound(s, result, rng, opts);
    season = r.season; game = r.games.find(g => g.home === ME || g.away === ME);
  } else {
    const r = recordPostGame(s, result, rng, opts);
    season = r.season; game = r.game;
  }
  const mine = game && (game.home === ME || game.away === ME);
  const log = mine ? game.log : [];
  const { growth, ups } = gainFromLog(c.growth, log, ME);
  const stats = mineOnly(playerLine(c.stats, log));
  const total = mineOnly(playerLine(c.total, log));
  const fatigue = mine ? fatigueAfterGame(c, log, ME) : c.fatigue;   // 오늘 던진 투수는 쉬어야 한다
  const { achv, fresh } = award(c.achv, result && mine ? gameAchievements(game, log, ME) : [], s.year);   // 직접 한 경기만
  return { career: { ...c, season, growth, stats, total, fatigue, day: c.day + 1, achv }, ups, achv: fresh, game: game && { ...game, log: undefined } };
}

export const applyAutoGame = (c, rng, opts) => applyUserGame(c, null, rng, opts);

export function finishSeason(c) {
  if (!c.season || c.season.phase !== 'done') return c;
  const sum = seasonSummary(c.season), history = [...c.history, sum];
  const { achv, fresh } = award(c.achv, [...seasonAchievements(sum, c.stats, ME), ...careerAchievements(history, ME)], sum.year);
  return { ...c, history, season: null, nextYear: c.season.year + 1, lastStats: c.stats, stats: {}, achv, achvNew: fresh };
}
