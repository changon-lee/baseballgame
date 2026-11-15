// 육성모드 커스텀 선수: 이름·얼굴·포지션(역할)·손·처음 능력치를 직접 정해 삼성에 새로 들어온다.
// 능력치는 정해진 포인트 안에서 나눈다(구속은 145km = 50점, 1km = 3점으로 셈). 연봉은 최저 연봉에서 시작
// slot.custom = { kind, name, face, pos | role, bats | throws, 능력치들 }

export const CUSTOM_ID = { bat: 'samsung-b99', pitch: 'samsung-p99' };
export const NAME_MAX = 8;
export const FACES = 9;                                   // assets/faces 의 b_0~8 / p_0~8
export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const POS_KO = { C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자' };

// 능력치 범위와 포인트(삼성 주전급 정도: 김영웅 247점, 원태인 235점, 김재윤 161점)
export const CUSTOM = {
  bat: { budget: 250, stats: { power: [25, 85], contact: [25, 85], eye: [25, 85], speed: [25, 85] } },
  SP: { budget: 215, stats: { velo: [135, 156], control: [30, 85], stamina: [50, 95] } },
  CL: { budget: 175, stats: { velo: [135, 156], control: [30, 85], stamina: [25, 50] } },
};
export const groupOf = c => (c.kind === 'bat' ? 'bat' : c.role === 'SP' ? 'SP' : 'CL');
export const pointsOf = (stat, v) => (stat === 'velo' ? 50 + (v - 145) * 3 : v);
export const usedPoints = c => Object.keys(CUSTOM[groupOf(c)].stats).reduce((a, k) => a + pointsOf(k, c[k]), 0);

// 처음 화면에 보여 줄 기본값(고르게 낮게 두고 포인트를 50쯤 남겨 둔다 — 원하는 데 올리면 된다)
export function defaultCustom(kind, role = 'SP') {
  if (kind === 'bat') return { kind, name: '', face: 0, pos: 'CF', bats: 'R', power: 50, contact: 50, eye: 50, speed: 50 };
  return role === 'SP' ? { kind, name: '', face: 0, role, throws: 'R', velo: 143, control: 55, stamina: 70 }
    : { kind, name: '', face: 0, role, throws: 'R', velo: 146, control: 60, stamina: 30 };
}

export function validCustom(c) {
  if (!c || typeof c !== 'object' || (c.kind !== 'bat' && c.kind !== 'pitch')) return false;
  const name = typeof c.name === 'string' ? c.name.trim() : '';
  if (!name || name.length > NAME_MAX) return false;
  if (!Number.isInteger(c.face) || c.face < 0 || c.face >= FACES) return false;
  if (c.kind === 'bat' ? !POSITIONS.includes(c.pos) || !['L', 'R', 'S'].includes(c.bats) : !['SP', 'CL'].includes(c.role) || !['L', 'R'].includes(c.throws)) return false;
  const g = CUSTOM[groupOf(c)];
  for (const [k, [lo, hi]] of Object.entries(g.stats)) if (!Number.isInteger(c[k]) || c[k] < lo || c[k] > hi) return false;
  return usedPoints(c) <= g.budget;
}

// 경기에 쓰는 선수 모양(rosters.js build 와 같게)
export function customPlayer(c) {
  const base = { id: CUSTOM_ID[c.kind], name: c.name.trim(), num: null, face: c.face, custom: true };
  if (c.kind === 'bat') return { ...base, pos: c.pos, bats: c.bats, power: c.power, contact: c.contact, eye: c.eye, speed: c.speed };
  return { ...base, throws: c.throws, role: c.role === 'SP' ? 'SP' : 'RP', velo: c.velo, control: c.control, stamina: c.stamina,
    pitches: c.role === 'SP' ? ['FB', 'SL', 'CH', 'CU'] : ['FB', 'SL', 'FO'] };
}

// 삼성 팀에 커스텀 선수를 넣는다(없으면 그대로)
export const withCustom = (team, c) => (!c ? team
  : c.kind === 'bat' ? { ...team, batters: [...team.batters, customPlayer(c)] } : { ...team, pitchers: [...team.pitchers, customPlayer(c)] });
