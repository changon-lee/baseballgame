// 경기 규칙: 볼카운트, 아웃, 주자, 점수, 이닝, 경기 종료
import { CONFIG } from '../config.js';

export function createGameState({ innings }) {
  return {
    innings, maxInnings: innings + CONFIG.EXTRA_INNINGS,
    inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
    bases: [false, false, false],
    score: { away: 0, home: 0 },
    battingIndex: { away: 0, home: 0 },
    over: false, result: null,
  };
}

export const battingSide = s => (s.half === 'top' ? 'away' : 'home');

const leader = s => (s.score.home > s.score.away ? 'home' : s.score.away > s.score.home ? 'away' : null);

export function applyEvent(prev, type) {
  const s = { ...prev, bases: [...prev.bases], score: { ...prev.score }, battingIndex: { ...prev.battingIndex } };
  const b = s.bases;
  let runs = 0, paEnded = false;

  switch (type) {
    case 'BALL':
      if (++s.balls >= 4) {
        if (b[0] && b[1] && b[2]) runs = 1;
        else if (b[0] && b[1]) b[2] = true;
        else if (b[0]) b[1] = true;
        b[0] = true; paEnded = true;
      }
      break;
    case 'STRIKE': if (++s.strikes >= 3) { s.outs++; paEnded = true; } break;
    case 'FOUL': if (s.strikes < 2) s.strikes++; break;
    case 'OUT': s.outs++; paEnded = true; break;
    case 'SAC_FLY': s.outs++; if (s.outs < 3 && b[2]) { runs = 1; b[2] = false; } paEnded = true; break;
    case 'DOUBLE_PLAY': s.outs += 2; b[0] = false; paEnded = true; break;
    case 'SINGLE': runs = +b[2] + +b[1]; s.bases = [true, b[0], false]; paEnded = true; break;
    case 'DOUBLE': runs = +b[2] + +b[1]; s.bases = [false, true, b[0]]; paEnded = true; break;
    case 'TRIPLE': runs = +b[0] + +b[1] + +b[2]; s.bases = [false, false, true]; paEnded = true; break;
    case 'HR': runs = +b[0] + +b[1] + +b[2] + 1; s.bases = [false, false, false]; paEnded = true; break;
    default: throw new Error(`unknown event ${type}`);
  }

  const side = battingSide(s);
  if (s.outs >= 3) runs = 0;
  s.score[side] += runs;
  if (paEnded) { s.balls = 0; s.strikes = 0; s.battingIndex[side] = (s.battingIndex[side] + 1) % 9; }

  // 끝내기
  if (s.half === 'bottom' && s.inning >= s.innings && leader(s) === 'home') {
    s.over = true; s.result = 'home';
    return { state: s, runs, paEnded };
  }

  if (s.outs >= 3) {
    if (s.half === 'top') {
      if (s.inning >= s.innings && leader(s) === 'home') { s.over = true; s.result = 'home'; }
      else s.half = 'bottom';
    } else if (s.inning >= s.innings && leader(s)) { s.over = true; s.result = leader(s); }
    else if (s.inning >= s.maxInnings) { s.over = true; s.result = 'draw'; }
    else { s.inning++; s.half = 'top'; }
    s.outs = 0; s.balls = 0; s.strikes = 0; s.bases = [false, false, false];
  }
  return { state: s, runs, paEnded };
}
