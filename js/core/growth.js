// 선수 성장과 기록. 경기 타석 기록(log)에서 경험치를 쌓고, 일정량마다 능력치 +1.
// 성장은 내 팀(삼성) 선수만. 능력치 상한: 타자·제구·체력 99, 구속 162km.

const STEP = 12;                                    // 이만큼 쌓이면 +1
const CAP = { power: 99, contact: 99, eye: 99, control: 99, stamina: 99, velo: 162 };

// 타석 결과별로 어느 능력치에 경험치가 쌓이는지
const BAT_XP = {
  SINGLE: { contact: 3 }, DOUBLE: { power: 2, contact: 2 }, TRIPLE: { contact: 3, power: 2 }, HR: { power: 5 },
  WALK: { eye: 3 }, SAC_FLY: { power: 1 }, OUT: { contact: 0.5 }, STRIKEOUT: { eye: 0.3 }, DOUBLE_PLAY: { contact: 0.3 },
};

export const createGrowth = () => ({ xp: {}, delta: {} });

function add(gr, id, stat, amount, ups) {
  const xp = { ...(gr.xp[id] || {}) }, delta = { ...(gr.delta[id] || {}) };
  xp[stat] = (xp[stat] || 0) + amount;
  while (xp[stat] >= STEP) { xp[stat] -= STEP; delta[stat] = (delta[stat] || 0) + 1; ups.push({ id, stat }); }
  return { xp: { ...gr.xp, [id]: xp }, delta: { ...gr.delta, [id]: delta } };
}

export function gainFromLog(growth, log, teamId) {
  let gr = growth || createGrowth();
  const ups = [], mine = id => id.startsWith(teamId + '-');
  for (const e of log) {
    if (mine(e.batterId)) for (const [stat, v] of Object.entries(BAT_XP[e.event] || {})) gr = add(gr, e.batterId, stat, v, ups);
    if (mine(e.pitcherId)) {
      const outs = e.outs ?? (OUTS_OF[e.event] || 0);
      if (outs) { gr = add(gr, e.pitcherId, 'stamina', 0.5 * outs, ups); gr = add(gr, e.pitcherId, 'control', 0.5 * outs, ups); }
      if (e.event === 'STRIKEOUT') gr = add(gr, e.pitcherId, 'velo', 0.6, ups);
    }
  }
  // 같은 선수·같은 능력치는 한 줄로 묶는다
  const merged = [];
  for (const u of ups) {
    const m = merged.find(x => x.id === u.id && x.stat === u.stat);
    if (m) m.n++; else merged.push({ ...u, n: 1 });
  }
  return { growth: gr, ups: merged };
}

const boost = (p, d) => {
  if (!d) return p;
  const q = { ...p };
  for (const [stat, n] of Object.entries(d)) if (stat in q) q[stat] = Math.min(CAP[stat], q[stat] + n);
  return q;
};

export function applyGrowth(team, growth) {
  if (!growth) return team;
  return { ...team, batters: team.batters.map(b => boost(b, growth.delta[b.id])), pitchers: team.pitchers.map(p => boost(p, growth.delta[p.id])) };
}

// 기록 누적: { bat: {id: {pa, ab, h, d2, d3, hr, bb, so, rbi}}, pit: {id: {bf, outs, h, hr, bb, so, r}} }
const OUTS_OF = { STRIKEOUT: 1, OUT: 1, SAC_FLY: 1, DOUBLE_PLAY: 2 };
const HIT = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];

export function playerLine(prev, log) {
  const bat = { ...(prev.bat || {}) }, pit = { ...(prev.pit || {}) };
  for (const e of log) {
    const b = { pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, bb: 0, so: 0, rbi: 0, ...bat[e.batterId] };
    const p = { bf: 0, outs: 0, h: 0, hr: 0, bb: 0, so: 0, r: 0, ...pit[e.pitcherId] };
    b.pa++; p.bf++;
    if (e.event !== 'WALK' && e.event !== 'SAC_FLY') b.ab++;
    if (HIT.includes(e.event)) { b.h++; p.h++; }
    if (e.event === 'DOUBLE') b.d2++;
    if (e.event === 'TRIPLE') b.d3++;
    if (e.event === 'HR') { b.hr++; p.hr++; }
    if (e.event === 'WALK') { b.bb++; p.bb++; }
    if (e.event === 'STRIKEOUT') { b.so++; p.so++; }
    if (e.event !== 'DOUBLE_PLAY') b.rbi += e.runs || 0;
    p.r += e.runs || 0;
    p.outs += e.outs ?? (OUTS_OF[e.event] || 0);
    bat[e.batterId] = b; pit[e.pitcherId] = p;
  }
  return { bat, pit };
}

export const avg = b => (b && b.ab ? (b.h / b.ab).toFixed(3).replace(/^0/, '') : '.000');
export const era = p => (p && p.outs ? ((p.r * 27) / p.outs).toFixed(2) : '-');
export const ip = p => (p ? `${Math.floor(p.outs / 3)}${p.outs % 3 ? ' ' + (p.outs % 3) + '/3' : ''}` : '0');
