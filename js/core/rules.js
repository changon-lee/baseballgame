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

// 땅볼 때 주자 진루: 포스(뒤 베이스가 다 차서 밀려나는) 주자만 다음 베이스로 무조건 뛴다.
// 1루 주자는 늘 포스, 2루 주자는 1루가 차 있을 때만, 3루 주자는 만루일 때만. 나머지는 리드했다가 베이스로 돌아온다.
// 돌려주는 것: 베이스마다 갈 곳(1·2·3 = 그 베이스, 4 = 득점, null = 주자 없음)
export function groundAdvance(bases) {
  const [b1, b2, b3] = bases;
  return [b1 ? 2 : null, b2 ? (b1 ? 3 : 2) : null, b3 ? (b1 && b2 ? 4 : 3) : null];
}

// opts.ground: 땅볼(OUT·DOUBLE_PLAY)이면 주자가 진루한다
export function applyEvent(prev, type, opts = {}) {
  const s = { ...prev, bases: [...prev.bases], score: { ...prev.score }, battingIndex: { ...prev.battingIndex } };
  const b = s.bases;
  let runs = 0, paEnded = false;

  // 땅볼 아웃 뒤 주자 자리(skipFirst: 병살로 1루 주자는 2루에서 아웃)
  const advance = (skipFirst = false) => {
    const to = groundAdvance(b), nb = [false, false, false];
    to.forEach((t, i) => { if (t == null || (skipFirst && i === 0)) return; if (t === 4) runs++; else nb[t - 1] = true; });
    s.bases = nb;
  };
  // 타자가 1루로 가고, 밀려나는 주자만 한 베이스씩(볼넷·내야안타)
  const force = () => {
    if (b[0] && b[1] && b[2]) runs = 1;
    else if (b[0] && b[1]) b[2] = true;
    else if (b[0]) b[1] = true;
    b[0] = true; paEnded = true;
  };
  switch (type) {
    case 'BALL': if (++s.balls >= 4) force(); break;
    case 'HBP': force(); break;                                                    // 몸에 맞는 공: 볼넷처럼 타자 1루, 밀려나는 주자만 진루
    // 폭투(포구 실패): 볼 하나 + 주자 모두 한 베이스. 4구째면 볼넷으로 처리
    case 'WILD': if (++s.balls >= 4) force(); else { runs = +b[2]; s.bases = [false, b[0], b[1]]; } break;
    case 'INFIELD_SINGLE': advance(); s.bases[0] = true; paEnded = true; break;   // 내야안타: 땅볼처럼 주자 진루 + 타자 1루
    case 'ERROR': runs = +b[2]; s.bases = [true, b[0], b[1]]; paEnded = true; break;   // 실책: 타자 1루, 주자 모두 한 베이스
    // 안타 + 홈 보살: 2루 주자가 홈에서 아웃, 3루 주자는 득점, 1루 주자는 2루로
    case 'SINGLE_HOME_OUT': s.outs++; runs = +b[2]; s.bases = [true, b[0], false]; paEnded = true; break;
    // 직선타 병살: 타자 아웃 + 뛰어나갔던 앞쪽 주자(가장 낮은 베이스)가 귀루하지 못해 아웃
    case 'LINE_DP': { s.outs += 2; const i = b.findIndex(Boolean); if (i >= 0) b[i] = false; paEnded = true; break; }
    case 'STRIKE': if (++s.strikes >= 3) { s.outs++; paEnded = true; } break;
    case 'FOUL': if (s.strikes < 2) s.strikes++; break;
    case 'OUT': s.outs++; if (opts.ground) advance(); paEnded = true; break;
    case 'SAC_FLY': s.outs++; if (s.outs < 3 && b[2]) { runs = 1; b[2] = false; } paEnded = true; break;
    case 'DOUBLE_PLAY': s.outs += 2; advance(true); paEnded = true; break;           // 1루 주자·타자 아웃, 나머지는 진루
    case 'SINGLE': runs = +b[2] + +b[1]; s.bases = [true, b[0], false]; paEnded = true; break;
    case 'DOUBLE': runs = +b[2] + +b[1]; s.bases = [false, true, b[0]]; paEnded = true; break;
    case 'TRIPLE': runs = +b[0] + +b[1] + +b[2]; s.bases = [false, false, true]; paEnded = true; break;
    case 'HR': runs = +b[0] + +b[1] + +b[2] + 1; s.bases = [false, false, false]; paEnded = true; break;
    default: throw new Error(`unknown event ${type}`);
  }

  const side = battingSide(s);
  if (s.outs >= 3) runs = 0;
  // 끝내기: 장외 홈런 외에는 결승점까지만 인정 (공식 규칙 7.01(g)(3), 9.06(f))
  if (type !== 'HR' && s.half === 'bottom' && s.inning >= s.innings) {
    const needed = s.score.away - s.score.home + 1;
    if (needed > 0 && runs > needed) runs = needed;
  }
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
