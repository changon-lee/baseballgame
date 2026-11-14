// 컴퓨터끼리 한 경기를 끝까지 돌린다 (시즌의 다른 경기, 내 경기 자동 진행)
import { createMatch, matchup, playUserPitch, cpuMaybeChangePitcher } from './match.js';
import { cpuChoosePitch } from './ai.js';
import { defaultLineup } from './team.js';

export function simulateGame({ home, away, innings, rng, homeLineup, homeStarterId, awayStarterId, bat = null }) {
  const hl = homeLineup || defaultLineup(home);
  const userLineup = homeStarterId ? { ...hl, starterId: homeStarterId } : hl;
  let m = createMatch({ userTeam: home, cpuTeam: away, userLineup, innings, rng, cpuStarterId: awayStarterId, bat });
  for (let i = 0; i < 4000 && !m.game.over; i++) {
    m = cpuMaybeChangePitcher(m, rng, 'away');
    m = cpuMaybeChangePitcher(m, rng, 'home');
    const mu = matchup(m);
    const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: m.game.balls, strikes: m.game.strikes, rng });
    m = playUserPitch(m, c, rng).match;
  }
  return { score: { ...m.game.score }, result: m.game.result || 'draw', log: m.log, innings: m.game.inning };
}
