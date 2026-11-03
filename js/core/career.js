// 커리어 = 여러 시즌에 걸친 진행 상태 (현재 시즌, 선수 성장, 시즌 기록, 역대 성적). 브라우저 저장소에 보관.
import { USER_TEAM_ID, getTeam } from '../data/rosters.js';
import { createSeason, recordRound, recordPostGame, seasonSummary } from './season.js';
import { createGrowth, gainFromLog, applyGrowth, playerLine } from './growth.js';

const KEY = 'baseball.career.v1';
const ME = USER_TEAM_ID;

export const newCareer = () => ({ v: 1, nextYear: 2027, season: null, growth: createGrowth(), stats: {}, total: {}, history: [] });

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
const teamGetter = c => id => (id === ME ? userTeamNow(c) : getTeam(id));

export function startSeason(c, { cycles, innings }) {
  return { ...c, season: createSeason({ cycles, innings, year: c.nextYear }), stats: {} };
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
  return { career: { ...c, season, growth, stats, total }, ups, game: game && { ...game, log: undefined } };
}

export const applyAutoGame = (c, rng, opts) => applyUserGame(c, null, rng, opts);

export function finishSeason(c) {
  if (!c.season || c.season.phase !== 'done') return c;
  const sum = seasonSummary(c.season);
  return { ...c, history: [...c.history, sum], season: null, nextYear: c.season.year + 1, lastStats: c.stats, stats: {} };
}
