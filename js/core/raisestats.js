// 육성모드 시즌 기록: 리그 전체 선수 기록을 쌓아 두고, 내 기록이 리그에서 상위 몇 %인지 낸다.
// league = { bat: { id: 타자 한 줄 }, pit: { id: 투수 한 줄 } } (growth.js playerLine 모양). 시즌마다 새로 쌓는다
import { playerLine, ip } from './growth.js';
import { TEAMS } from '../data/rosters.js';

export const emptyLeague = () => ({ bat: {}, pit: {} });

// 그날 모든 경기 기록(log 배열들)을 더한다
export function leagueAdd(league, logs) {
  let lg = { bat: { ...((league && league.bat) || {}) }, pit: { ...((league && league.pit) || {}) } };
  for (const log of logs) lg = playerLine(lg, log || []);
  return lg;
}

const rate = v => v.toFixed(3).replace(/^0/, '');
const per = (a, b) => (b ? a / b : null);
// 비교 대상: 규정(팀 경기 수 × 이만큼)을 채운 선수. 선발은 선발끼리, 마무리는 불펜끼리
export const QUALIFY = { bat: 2, SP: 1.5, RP: 0.5 };   // 타석 / 아웃 수
export const MIN_POOL = 5;                              // 비교할 선수가 이보다 적으면 %를 내지 않는다

// low: 낮을수록 좋은 기록
export const STAT_DEFS = {
  bat: [
    { key: 'avg', name: '타율', val: b => per(b.h, b.ab), fmt: rate, info: '안타 ÷ 타수. 타석에서 얼마나 자주 안타를 치는지예요.' },
    { key: 'hr', name: '홈런', val: b => b.hr, fmt: String, info: '이번 시즌에 친 홈런 수예요.' },
    { key: 'rbi', name: '타점', val: b => b.rbi, fmt: String, info: '내 타격으로 홈을 밟은 주자 수예요.' },
    { key: 'obp', name: '출루율', val: b => per(b.h + b.bb, b.ab + b.bb), fmt: rate, info: '(안타 + 볼넷) ÷ (타수 + 볼넷). 아웃되지 않고 살아 나가는 비율이에요.' },
    { key: 'slg', name: '장타율', val: b => per(b.h + b.d2 + 2 * b.d3 + 3 * b.hr, b.ab), fmt: rate, info: '루타 ÷ 타수. 한 타수에 평균 몇 루를 가는지, 힘을 보여 줘요.' },
    { key: 'ops', name: 'OPS', val: b => (b.ab ? per(b.h + b.bb, b.ab + b.bb) + per(b.h + b.d2 + 2 * b.d3 + 3 * b.hr, b.ab) : null), fmt: rate, info: '출루율 + 장타율. 타자의 공격력을 한 숫자로 본 거예요. .800이 넘으면 좋은 타자예요.' },
  ],
  pit: [
    { key: 'era', name: '평균자책점', low: true, val: p => per(p.r * 27, p.outs), fmt: v => v.toFixed(2), info: '9이닝 동안 내주는 점수예요(실점 기준). 낮을수록 좋아요.' },
    { key: 'ip', name: '이닝', val: p => p.outs, fmt: v => ip({ outs: v }), info: '던진 이닝 수예요. 1/3은 아웃 하나예요.' },
    { key: 'so', name: '탈삼진', val: p => p.so, fmt: String, info: '삼진으로 잡은 타자 수예요.' },
    { key: 'whip', name: 'WHIP', low: true, val: p => per((p.h + p.bb) * 3, p.outs), fmt: v => v.toFixed(2), info: '한 이닝에 내보낸 주자(안타 + 볼넷) 수예요. 낮을수록 좋아요. 1.20보다 낮으면 좋은 투수예요.' },
    { key: 'k9', name: '9이닝당 탈삼진', val: p => per(p.so * 27, p.outs), fmt: v => v.toFixed(1), info: '9이닝 동안 잡는 삼진 수예요. 높을수록 타자를 압도해요.' },
  ],
};

const ROLE = new Map(TEAMS.flatMap(t => t.pitchers.map(p => [p.id, p.role])));
const isSP = id => ROLE.get(id) === 'SP';
const WHO = new Map(TEAMS.flatMap(t => [...t.batters, ...t.pitchers].map(p => [p.id, { name: p.name, team: t.short }])));

// 비교 무리: 내 기록(mine)과 규정을 채운 같은 무리 선수들(others: [{ id, line }])
function group(slot) {
  const kind = slot.kind === 'pitch' ? 'pit' : 'bat', id = slot.playerId, st = slot.stats || {};
  const lg = slot.league || emptyLeague(), games = (slot.season && slot.season.round) || 0;
  const zero = kind === 'bat' ? { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: 0 } : { bf: 0, outs: 0, h: 0, hr: 0, bb: 0, so: 0, r: 0 };
  const mine = { ...zero, ...(st[kind] || lg[kind][id] || {}) };
  const sp = slot.role === 'SP';
  const need = kind === 'bat' ? QUALIFY.bat * games : (sp ? QUALIFY.SP : QUALIFY.RP) * games;
  const amount = l => (kind === 'bat' ? l.pa : l.outs);
  const sameGroup = pid => kind === 'bat' || isSP(pid) === sp;
  const others = Object.entries(lg[kind]).filter(([pid, l]) => pid !== id && sameGroup(pid) && amount(l) >= need && amount(l) > 0).map(([pid, line]) => ({ id: pid, line }));
  const qualified = amount(mine) > 0 && amount(mine) >= need;
  return { kind, id, st, mine, sp, qualified, others, pool: qualified ? others.length + 1 : others.length };
}
const beats = (d, a, b) => (d.low ? a < b : a > b);

// 내 시즌 기록 카드: { kind, qualified, pool, need, extra, rows: [{ key, name, info, text, pct, rank }] }
// pct: 상위 몇 %(1~100, 작을수록 잘함), rank: 리그 몇 위. 규정 미달이거나 비교할 선수가 적으면 null
export function seasonCard(slot) {
  const { kind, st, mine, sp, qualified, others, pool } = group(slot);
  const rows = STAT_DEFS[kind].map(d => {
    const v = d.val(mine);
    let pct = null, rank = null;
    if (qualified && v != null && pool >= MIN_POOL) {
      const vals = others.map(o => d.val(o.line)).filter(x => x != null);
      const better = vals.filter(x => beats(d, x, v)).length, same = vals.filter(x => x === v).length;
      // 같은 기록끼리는 그 무리의 가운데 순위(0홈런이 대부분이면 0홈런은 상위권이 아니다)
      pct = Math.max(1, Math.ceil(((better + 1 + same / 2) / (vals.length + 1)) * 100));
      rank = better + 1;
    }
    return { key: d.key, name: d.name, info: d.info, text: v == null ? '-' : d.fmt(v), pct, rank };
  });
  const extra = kind === 'bat'
    ? `${st.g || 0}경기 · ${mine.pa}타석 ${mine.h}안타 · 볼넷 ${mine.bb} · 삼진 ${mine.so}`
    : `${st.g || 0}경기 · ${st.w || 0}승 ${st.l || 0}패${slot.role === 'CL' ? ` ${st.sv || 0}세이브` : ''}`;
  const needText = kind === 'bat' ? `팀 경기 수 × ${QUALIFY.bat}타석` : `팀 경기 수 × ${sp ? QUALIFY.SP : QUALIFY.RP}아웃`;
  return { kind, qualified, pool, need: needText, extra, rows };
}

// 리그 순위표(기록 하나): 규정을 채운 같은 무리 선수들을 잘한 순서로. 위에서 top명 + (그 밖이면) 나
// { key, name, low, pool, myRank, rows: [{ rank, tie, id, name, team, text, me }] }. 같은 기록은 같은 순위(공동)
export const BOARD_TOP = 10;
export function leaderboard(slot, key, top = BOARD_TOP) {
  const g = group(slot), d = STAT_DEFS[g.kind].find(x => x.key === key);
  const list = g.others.map(o => ({ id: o.id, v: d.val(o.line), me: false }));
  if (g.qualified) list.push({ id: g.id, v: d.val(g.mine), me: true });
  const ranked = list.filter(x => x.v != null).sort((a, b) => (a.v === b.v ? a.me - b.me : beats(d, a.v, b.v) ? -1 : 1));
  const who = id => WHO.get(id) || { name: id, team: '' };
  const row = (x, rank, tie) => ({ rank, tie, id: x.id, name: who(x.id).name, team: who(x.id).team, text: x.v == null ? '-' : d.fmt(x.v), me: x.me });
  const all = ranked.map(x => {
    const better = ranked.filter(y => beats(d, y.v, x.v)).length, same = ranked.filter(y => y.v === x.v).length;
    return row(x, better + 1, same > 1);
  });
  const rows = all.slice(0, top);
  const mine = all.find(r => r.me);
  if (mine && !rows.includes(mine)) rows.push({ ...mine, gap: all.indexOf(mine) > top });   // gap: 10위와 나 사이에 다른 선수가 있다
  if (!g.qualified) rows.push(row({ id: g.id, v: d.val(g.mine), me: true }, null, false));
  return { key, name: d.name, low: !!d.low, pool: g.pool, myRank: mine ? mine.rank : null, rows };
}
