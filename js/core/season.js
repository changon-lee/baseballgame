// 시즌: 일정, 결과 기록, 순위, 선발 로테이션, 포스트시즌(와일드카드 → 준PO → PO → 한국시리즈)
import { TEAMS, USER_TEAM_ID, getTeam } from '../data/rosters.js';
import { simulateGame } from './sim.js';

const ME = USER_TEAM_ID;

// 원형 방식 라운드로빈. 삼성 경기는 항상 삼성 홈(경기 화면이 삼성=말 공격을 전제로 함)
export function createSeason({ cycles, innings, year }) {
  const others = TEAMS.map(t => t.id).filter(id => id !== ME);
  const schedule = [];
  for (let c = 0; c < cycles; c++) {
    for (let r = 0; r < others.length; r++) {
      const rot = [...others.slice(r), ...others.slice(0, r)];
      const list = [ME, ...rot];
      const round = [];
      for (let i = 0; i < 5; i++) {
        const a = list[i], b = list[9 - i];
        if (a === ME) round.push([ME, b]);
        else round.push((r + c + i) % 2 ? [a, b] : [b, a]);
      }
      schedule.push(round);
    }
  }
  return { year, innings, cycles, schedule, round: 0, results: [], phase: 'regular', rotation: {}, post: null, champion: null };
}

const spsOf = (id, getT) => getT(id).pitchers.filter(p => p.role === 'SP');

export function nextStarter(s, teamId, getT = getTeam) {
  const sps = spsOf(teamId, getT);
  return sps[(s.rotation[teamId] || 0) % sps.length].id;
}

function advanceRotation(rotation, teamId, starterId, getT) {
  const sps = spsOf(teamId, getT);
  const i = sps.findIndex(p => p.id === starterId);
  return { ...rotation, [teamId]: (i >= 0 ? i : (rotation[teamId] || 0)) + 1 };
}

export function nextUserGame(s) {
  if (s.phase === 'post') return nextPostGame(s);
  if (s.phase !== 'regular') return null;
  const [home, away] = s.schedule[s.round].find(g => g.includes(ME));
  return { home, away, opponentId: away, userGame: true, label: `정규시즌 ${s.round + 1}/${s.schedule.length}경기` };
}

// 한 경기: 결과가 주어지면(사용자가 직접 한 경기) 그대로, 아니면 시뮬레이션
function playOne(s, home, away, given, rng, { getT = getTeam, userLineup, userStarterId } = {}) {
  const mine = home === ME && ((given && given.starterId) || userStarterId);
  const hsid = mine || nextStarter(s, home, getT);
  const asid = nextStarter(s, away, getT);
  let hs, as, log = given && given.log ? given.log : [];
  if (given) { hs = given.home; as = given.away; }
  else {
    const r = simulateGame({ home: getT(home), away: getT(away), innings: s.innings, rng,
      homeLineup: home === ME ? userLineup : undefined, homeStarterId: hsid, awayStarterId: asid });
    hs = r.score.home; as = r.score.away; log = r.log;
  }
  let rotation = advanceRotation(s.rotation, home, hsid, getT);
  rotation = advanceRotation(rotation, away, asid, getT);
  return { game: { home, away, hs, as, log }, rotation };
}

// 이번 라운드 기록: 삼성 경기는 userResult({home, away, starterId?, log?}) 또는 null(자동 진행)
export function recordRound(s, userResult, rng, opts = {}) {
  if (s.phase !== 'regular') return { season: s, games: [] };
  let rotation = s.rotation;
  const games = [];
  for (const [home, away] of s.schedule[s.round]) {
    const mine = home === ME || away === ME;
    const r = playOne({ ...s, rotation }, home, away, mine ? userResult : null, rng, opts);
    rotation = r.rotation; games.push(r.game);
  }
  const results = [...s.results, ...games.map(({ home, away, hs, as }) => ({ round: s.round, home, away, hs, as }))];
  let next = { ...s, rotation, results, round: s.round + 1 };
  if (next.round >= s.schedule.length) next = { ...next, phase: 'post', post: createPost(standings(next)) };
  return { season: next, games };
}

export function standings(s) {
  const t = {};
  for (const tm of TEAMS) t[tm.id] = { id: tm.id, w: 0, l: 0, d: 0, rs: 0, ra: 0 };
  for (const r of s.results) {
    const h = t[r.home], a = t[r.away];
    h.rs += r.hs; h.ra += r.as; a.rs += r.as; a.ra += r.hs;
    if (r.hs > r.as) { h.w++; a.l++; } else if (r.hs < r.as) { a.w++; h.l++; } else { h.d++; a.d++; }
  }
  const list = Object.values(t).map(x => ({ ...x, pct: x.w + x.l ? x.w / (x.w + x.l) : 0 }));
  list.sort((a, b) => b.pct - a.pct || b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra));
  const top = list[0];
  return list.map((x, i) => ({ ...x, rank: i + 1, gb: ((top.w - x.w) + (x.l - top.l)) / 2 }));
}

function createPost(st) {
  const seeds = st.slice(0, 5).map(x => x.id);
  return {
    seeds, current: 0,
    series: [
      { name: '와일드카드 결정전', teams: [seeds[3], seeds[4]], wins: [1, 0], need: 2, games: [] },
      { name: '준플레이오프', teams: [seeds[2], null], wins: [0, 0], need: 3, games: [] },
      { name: '플레이오프', teams: [seeds[1], null], wins: [0, 0], need: 3, games: [] },
      { name: '한국시리즈', teams: [seeds[0], null], wins: [0, 0], need: 4, games: [] },
    ],
  };
}

export function nextPostGame(s) {
  if (s.phase !== 'post') return null;
  const ser = s.post.series[s.post.current];
  const [hi, lo] = ser.teams;
  const userGame = hi === ME || lo === ME;
  const home = userGame ? ME : hi, away = userGame ? (hi === ME ? lo : hi) : lo;
  return { home, away, opponentId: userGame ? away : null, userGame, series: ser.name,
    label: `${ser.name} ${ser.games.length + 1}차전` };
}

export function recordPostGame(s, given, rng, opts = {}) {
  const g = nextPostGame(s);
  if (!g) return { season: s, game: null };
  const r = playOne(s, g.home, g.away, given, rng, opts);
  const series = s.post.series.map(x => ({ ...x, teams: [...x.teams], wins: [...x.wins], games: [...x.games] }));
  const ser = series[s.post.current];
  const { hs, as } = r.game;
  ser.games.push({ home: g.home, away: g.away, hs, as });
  let current = s.post.current, phase = 'post', champion = null;
  if (hs !== as) {                                  // 무승부는 재경기(승수에 안 들어감)
    const winner = hs > as ? g.home : g.away;
    const wi = ser.teams.indexOf(winner);
    ser.wins[wi]++;
    if (ser.wins[wi] >= ser.need) {
      if (current === 3) { phase = 'done'; champion = winner; }
      else { series[current + 1].teams[1] = winner; current++; }
    }
  }
  return { season: { ...s, rotation: r.rotation, phase, champion, post: { ...s.post, series, current } }, game: r.game };
}

export const seasonOver = s => s.phase === 'done';

// 삼성의 시즌 성적 요약 (기록실용)
export function seasonSummary(s) {
  const st = standings(s).find(x => x.id === ME);
  let result = '가을야구 실패';
  if (s.post) {
    const idx = s.post.series.map(x => x.teams.includes(ME)).lastIndexOf(true);
    if (idx >= 0) result = s.champion === ME ? '통합 우승' : `${s.post.series[idx].name} 탈락`;
    if (s.champion === ME && st.rank !== 1) result = '한국시리즈 우승';
    if (idx === 3 && s.champion && s.champion !== ME) result = '준우승';
  }
  return { year: s.year, rank: st.rank, w: st.w, l: st.l, d: st.d, result, champion: s.champion };
}
