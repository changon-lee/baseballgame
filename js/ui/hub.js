// 시즌 허브: 홈(다음 경기) · 순위 · 선수 · 기록 탭, 새 시즌 설정, 경기 결과 화면
import { USER_TEAM_ID, getTeam } from '../data/rosters.js';
import { standings, nextUserGame, nextStarter } from '../core/season.js';
import { userTeamNow, userTeamTired } from '../core/career.js';
import { avg, era, ip } from '../core/growth.js';
import { PRACTICE, PRACTICE_STATS, practiceLeft } from '../core/practice.js';
import { loadNow, daysToRecover } from '../core/fatigue.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { setAudioOptions } from './feedback.js';
import { volRow, bindVol } from './volume.js';

const ME = USER_TEAM_ID;
const STAT_KO = { power: '파워', contact: '컨택', eye: '선구안', control: '제구', stamina: '체력', velo: '구속' };
const LENGTHS = [[1, '9경기'], [2, '18경기'], [4, '36경기'], [8, '72경기'], [16, '144경기']];

const STAT_ICON = { power: '💪', contact: '⚾', eye: '👀', control: '🎯', stamina: '💚', velo: '🔥' };
const asset = path => new URL('../../assets/' + path, import.meta.url).href;
const hashId = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
// 선수 얼굴(assets/faces: 3x3 격자 사진에서 오린 투수 9명·타자 9명, tools/faces.py). 같은 선수는 늘 같은 얼굴.
// 외국인 선수(이름이 한국 성으로 시작하지 않거나 네 글자 이상)는 외국인 얼굴(4·6번)에서, 나머지는 한국인 얼굴에서 고르고,
// 한 팀 안에서는 명단 번호(id 끝 숫자)대로 돌려 써서 겹치는 얼굴이 적다
const FACE_FOREIGN = [4, 6], FACE_KOREAN = [0, 1, 2, 3, 5, 7, 8];
const SURNAMES = new Set('김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부');
export const isForeign = name => { const n = String(name || ''); return n.length >= 4 || (n.length > 0 && !SURNAMES.has(n[0])); };
const faceNo = pl => {
  const pool = isForeign(pl.name) ? FACE_FOREIGN : FACE_KOREAN, m = /^(.*)-[bp](\d+)$/.exec(String(pl.id));
  return pool[(m ? hashId(m[1]) + +m[2] - 1 : hashId(pl.id)) % pool.length];
};
export const face = (pl, kind, cls = '') => `<i class="av ph ${cls}" style="background-image:url('${asset(`faces/${kind === 'p' ? 'p' : 'b'}_${faceNo(pl)}.webp`)}')"></i>`;

export const badge = (id, size = '') => {
  const t = getTeam(id);
  return `<span class="badge ${size}" style="--c:${t.colors.main};--s:${t.colors.sub}">${t.short}</span>`;
};
const teamName = id => getTeam(id).short;
const pct = x => x.toFixed(3).replace(/^0/, '');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ctx: { career, saveOk, tab, setup:{cycles,innings}, pr:{ pitchId, pitchStat, batId, batStat }, on:{ startSeason, play, auto, autoMany, finish, lineup, exhibition, versus, practice, reset } }
export function showHub(root, ctx) {
  let tab = ctx.tab || 'home';
  const render = () => {
    const c = ctx.career, s = c.season;
    root.innerHTML = `
    <div class="screen hub">
      <header class="top-hero">
        <img class="hero-man" alt="" src="${asset('sprites/batter_idle_front_0.webp')}">
        <div class="eyebrow">${s ? `${s.year} SEASON · ${s.phase === 'regular' ? '정규시즌' : s.phase === 'post' ? '포스트시즌' : '시즌 종료'}` : 'KBO LEAGUE · 커리어 모드'}</div>
        <div class="hero-row">
          ${badge(ME, 'xl')}
          <div class="hero-text"><h1>삼성 라이온즈</h1>${recordLine(c)}</div>
        </div>
      </header>
      <main class="tab-body">${tab === 'home' ? homeTab(c) : tab === 'table' ? tableTab(c) : tab === 'players' ? playersTab(c) : tab === 'practice' ? practiceTab(c) : recordsTab(c)}</main>
      ${ctx.saveOk === false ? '<p class="note center">이 브라우저에서는 저장이 안 돼요. 창을 닫으면 진행이 사라져요.</p>' : ''}
    </div>
    <nav class="tabbar">${[['home', '홈', '🏠'], ['table', '순위', '📊'], ['players', '선수', '🧢'], ['practice', '연습', '🏋️'], ['records', '기록', '🏆']].map(([k, l, i]) =>
      `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('')}</nav>`;
    bind();
  };

  function recordLine(c) {
    const s = c.season;
    if (!s) {
      const titles = c.history.filter(h => h.champion === ME).length;
      return `<p class="sub">${c.history.length ? `${c.history.length}시즌 · 우승 ${titles}회` : '첫 시즌을 시작해 보세요'}</p>`;
    }
    const me = standings(s).find(x => x.id === ME);
    return `<div class="rec"><span><b>${me.w}</b><small>승</small></span><span><b>${me.l}</b><small>패</small></span>${me.d ? `<span><b>${me.d}</b><small>무</small></span>` : ''}<span class="rk"><b>${me.rank}</b><small>위</small></span></div>${me.gb ? `<p class="gb">1위와 ${me.gb} 게임차</p>` : ''}`;
  }

  // ── 홈 탭 ──
  function homeTab(c) {
    const s = c.season;
    if (!s) return setupCard(c);
    if (s.phase === 'done') return doneCard(c);
    const g = nextUserGame(s);
    const post = s.phase === 'post' ? bracket(s) : '';
    if (!g.userGame) {
      return `<section class="card">
        <div class="card-h">⚾ ${g.label}</div>
        <div class="vs-row">${badge(g.away, 'lg')}<span class="vs">VS</span>${badge(g.home, 'lg')}</div>
        <p class="hint center">삼성은 이번 시리즈에 나가지 않아요</p>
        <div class="actions"><button class="primary" data-act="auto">▶ 이 경기 진행</button><button class="ghost" data-act="automany">⏩ 포스트시즌 끝까지</button></div>
      </section>${post}`;
    }
    const opp = getTeam(g.opponentId);
    const team = userTeamTired(c);
    const sps = team.pitchers.filter(p => p.role === 'SP');
    const starter = ctx.starterId && sps.some(p => p.id === ctx.starterId) ? ctx.starterId : nextStarter(s, ME);
    ctx.starterId = starter;
    const oppSp = opp.pitchers.find(p => p.id === nextStarter(s, opp.id));
    const st = standings(s), oppRank = st.find(x => x.id === opp.id);
    return `<section class="card next">
      <div class="card-h">⚾ ${g.label}<span class="pill">⏱ ${s.innings}이닝</span></div>
      <div class="vs-row">
        <div class="side" style="--c:${opp.colors.main}">${badge(opp.id, 'lg')}<b>${opp.short}</b><small>✈️ 원정 · ${oppRank.rank}위 · ${oppRank.w}-${oppRank.l}</small></div>
        <span class="vs">VS</span>
        <div class="side" style="--c:${team.colors.main}">${badge(ME, 'lg')}<b>삼성</b><small>🏠 홈 경기</small></div>
      </div>
      <div class="probables"><span>🆚 상대 선발 <b>${oppSp.name}</b> <small>${oppSp.velo}km · 제구 ${oppSp.control}</small></span></div>
      <div class="label">🔥 오늘의 선발</div>
      <div class="chips">${sps.map(p => `<button class="chip sp ${p.id === starter ? 'on' : ''}" data-sp="${p.id}"><span class="sp-top">${face(p, 'p')}<b>${esc(p.name)}</b></span>
        <span class="ms"><span>🔥 구속</span><i><u style="width:${Math.max(6, Math.min(100, (p.velo - 125) / 37 * 100))}%"></u></i><em>${p.velo}</em></span>
        <span class="ms"><span>🎯 제구</span><i><u style="width:${Math.min(100, p.control)}%"></u></i><em>${p.control}</em></span>${tiredTag(c, p.id)}</button>`).join('')}</div>
      <div class="actions">
        <button class="primary big" data-act="play">▶ 경기 시작</button>
        <button class="ghost" data-act="auto">⚡ 자동 진행</button>
      </div>
      ${s.phase === 'regular' && s.schedule.length - s.round > 1 ? `<button class="link" data-act="automany">⏩ 남은 정규시즌 자동 진행 (${s.schedule.length - s.round}경기)</button>` : ''}
      <button class="link" data-act="lineup">📋 타순 편집</button>
    </section>
    ${s.phase === 'regular' ? miniTable(s) : post}`;
  }

  function setupCard(c) {
    const set = ctx.setup;
    return `<section class="card setup">
      <div class="stadium-banner"><b>${c.nextYear}</b><span>SEASON</span></div>
      <div class="card-h">🗓️ ${c.nextYear} 시즌 시작</div>
      <div class="label">📅 정규시즌 경기 수 <small>(9개 구단과 고르게)</small></div>
      <div class="seg wrap">${LENGTHS.map(([n, l]) => `<button data-cyc="${n}" class="${set.cycles === n ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="label">⏱ 경기당 이닝</div>
      <div class="seg">${[3, 5, 9].map(n => `<button data-inn="${n}" class="${set.innings === n ? 'on' : ''}">${n}이닝</button>`).join('')}</div>
      <p class="hint">정규시즌 5위까지 가을야구. 와일드카드 → 준플레이오프 → 플레이오프 → 한국시리즈. 경기를 할수록 삼성 선수들이 성장하고, 성장은 다음 시즌에도 이어져요.</p>
      <div class="actions"><button class="primary big" data-act="start">🚀 시즌 시작</button></div>
    </section>
    <section class="card slim">
      <div class="card-h">🤝 친선 경기 · 1:1 대결</div>
      <p class="hint">기록에 남지 않는 한 경기. 1:1 대결은 같은 와이파이의 폰 두 대로 겨뤄요</p>
      <div class="actions"><button class="ghost" data-act="exhibition">🤝 친선 경기</button><button class="ghost" data-act="versus">📱 1:1 대결</button></div>
      <div class="actions" style="margin-top:8px"><button class="ghost" data-act="lineup">📋 타순 편집</button></div>
    </section>`;
  }

  function doneCard(c) {
    const s = c.season, champ = s.champion, won = champ === ME;
    return `<section class="card champ ${won ? 'gold' : ''}">
      <div class="trophy">${won ? '🏆' : '⚾'}</div>
      <div class="card-h center">${s.year} 한국시리즈 우승</div>
      <div class="center">${badge(champ, 'xl')}</div>
      <h2 class="center">${getTeam(champ).name}</h2>
      <p class="hint center">${won ? '삼성 라이온즈가 정상에 올랐어요!' : '다음 시즌을 노려봐요'}</p>
      <div class="actions"><button class="primary big" data-act="finish">🎊 시즌 마무리 → ${s.year + 1} 시즌</button></div>
    </section>${bracket(s)}`;
  }

  function miniTable(s) {
    const st = standings(s);
    return `<section class="card slim"><div class="card-h">📊 순위<button class="link inline" data-tab="table">전체 보기</button></div>
      <div class="mini">${st.slice(0, 5).map(x => `<div class="${x.id === ME ? 'me' : ''}"><i>${x.rank}</i>${badge(x.id, 'sm')}<span>${teamName(x.id)}</span><b>${x.w}-${x.l}${x.d ? '-' + x.d : ''}</b><small>${x.gb ? x.gb : '-'}</small></div>`).join('')}
      ${st.findIndex(x => x.id === ME) >= 5 ? (() => { const x = st.find(y => y.id === ME); return `<div class="me"><i>${x.rank}</i>${badge(x.id, 'sm')}<span>삼성</span><b>${x.w}-${x.l}${x.d ? '-' + x.d : ''}</b><small>${x.gb}</small></div>`; })() : ''}
      </div></section>`;
  }

  function bracket(s) {
    if (!s.post) return '';
    const ser = s.post.series;
    return `<section class="card slim"><div class="card-h">🏆 포스트시즌</div><div class="bracket">${ser.map((x, i) => {
      const [a, b] = x.teams;
      const live = s.phase === 'post' && s.post.current === i;
      const done = x.wins.includes(x.need);
      const team = (id, w) => id ? `<div class="bt ${done && w === x.need ? 'win' : ''} ${id === ME ? 'me' : ''}">${badge(id, 'sm')}<span>${teamName(id)}</span><b>${w}</b></div>` : `<div class="bt tbd"><span>미정</span></div>`;
      return `<div class="series ${live ? 'live' : ''}"><div class="sn">${x.name}<small>${x.need}선승${i === 0 ? ' · 4위 1승' : ''}</small></div>${team(b, x.wins[1])}${team(a, x.wins[0])}</div>`;
    }).join('')}</div></section>`;
  }

  // ── 순위 탭 ──
  function tableTab(c) {
    const s = c.season;
    if (!s) return `<section class="card"><p class="hint center">시즌이 시작되면 순위가 보여요</p></section>`;
    const st = standings(s);
    return `<section class="card flush"><table class="tbl">
      <thead><tr><th>#</th><th class="l">팀</th><th>경기</th><th>승</th><th>패</th><th>무</th><th>승률</th><th>차</th></tr></thead>
      <tbody>${st.map(x => `<tr class="${x.id === ME ? 'me' : ''} ${x.rank === 5 ? 'cut' : ''}"><td>${x.rank}</td><td class="l">${badge(x.id, 'sm')} ${teamName(x.id)}</td>
        <td>${x.w + x.l + x.d}</td><td>${x.w}</td><td>${x.l}</td><td>${x.d}</td><td>${pct(x.pct)}</td><td>${x.gb || '-'}</td></tr>`).join('')}</tbody></table>
      <p class="hint pad">5위까지 포스트시즌 진출</p></section>${bracket(s)}`;
  }

  // ── 선수 탭 ──
  function playersTab(c) {
    const team = userTeamNow(c), base = getTeam(ME);
    const view = ctx.statView || 'season';
    const line = view === 'season' ? (c.season ? c.stats : c.lastStats || {}) : c.total;
    const bat = (line && line.bat) || {}, pit = (line && line.pit) || {};
    const up = (id, k, v) => { const d = (c.growth.delta[id] || {})[k]; return `<span class="rt">${v}${d ? `<sup>+${d}</sup>` : ''}</span>`; };
    const xpBar = id => { const x = c.growth.xp[id] || {}; const m = Math.max(0, ...Object.values(x)); return `<i class="xp"><i style="width:${Math.min(100, m / 12 * 100)}%"></i></i>`; };
    return `<div class="seg sticky">${[['season', '이번 시즌'], ['total', '통산']].map(([k, l]) => `<button data-sv="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <section class="card flush"><div class="card-h pad">🧢 타자</div>
      ${team.batters.map(b => { const s = bat[b.id]; return `<div class="prow wa">${face(b, 'b')}
        <div class="pn"><b>${esc(b.name)}</b><small>${b.pos} · ${b.bats === 'L' ? '좌' : b.bats === 'R' ? '우' : '양'}타</small>${xpBar(b.id)}</div>
        <div class="pr">${up(b.id, 'power', b.power)}${up(b.id, 'contact', b.contact)}${up(b.id, 'eye', b.eye)}</div>
        <div class="ps">${s ? `<b>${avg(s)}</b><small>${s.hr}홈런 ${s.rbi}타점</small>` : '<small>-</small>'}</div></div>`; }).join('')}
      <div class="legend">💪 파워 · ⚾ 컨택 · 👀 선구안</div>
    </section>
    <section class="card flush"><div class="card-h pad">🔥 투수</div>
      ${team.pitchers.map(p => { const s = pit[p.id]; return `<div class="prow wa">${face(p, 'p')}
        <div class="pn"><b>${esc(p.name)}</b><small>${p.role === 'SP' ? '선발' : '불펜'} · ${p.throws === 'L' ? '좌' : '우'}투</small>${xpBar(p.id)}</div>
        <div class="pr">${up(p.id, 'velo', p.velo)}${up(p.id, 'control', p.control)}${up(p.id, 'stamina', p.stamina)}</div>
        <div class="ps">${s ? `<b>${era(s)}</b><small>${ip(s)}이닝 ${s.so}K</small>` : '<small>-</small>'}</div></div>`; }).join('')}
      <div class="legend">🔥 구속 · 🎯 제구 · 💚 체력 &nbsp;|&nbsp; 기록: 평균자책</div>
    </section>`;
  }

  // ── 연습 탭 ──
  const tiredTag = (c, id) => { const L = loadNow(c, id); return L > 0 ? `<small class="tired">😴 피로 ${Math.round(L * 100)}% · 회복 ${daysToRecover(L)}일</small>` : '<small class="fresh">😎 컨디션 최상</small>'; };
  function practiceTab(c) {
    const team = userTeamNow(c), tired = userTeamTired(c), left = practiceLeft(c), pr = ctx.pr = ctx.pr || {};
    const pit = team.pitchers.find(p => p.id === pr.pitchId) || team.pitchers.find(p => p.role === 'SP');
    const bat = team.batters.find(b => b.id === pr.batId) || team.batters[0];
    const pStat = PRACTICE_STATS.pitch.includes(pr.pitchStat) ? pr.pitchStat : 'control';
    const bStat = PRACTICE_STATS.bat.includes(pr.batStat) ? pr.batStat : 'contact';
    pr.pitchId = pit.id; pr.pitchStat = pStat; pr.batId = bat.id; pr.batStat = bStat;
    const xpOf = (id, stat) => Math.min(100, ((c.growth.xp[id] || {})[stat] || 0) / 12 * 100);
    const statBtns = (who, stats, cur, attr) => `<div class="seg">${stats.map(k => `<button data-${attr}="${k}" class="${cur === k ? 'on' : ''}">${STAT_ICON[k]} ${STAT_KO[k]} ${who[k]}<i class="xp wide"><i style="width:${xpOf(who.id, k)}%"></i></i></button>`).join('')}</div>`;
    const dis = left <= 0 ? ' disabled' : '';
    return `<section class="card">
      <div class="card-h">🏟️ 연습장<span class="pill">오늘 ${left}/${PRACTICE.perDay}회 남음</span></div>
      <p class="hint">투구는 ${PRACTICE.goal.pitch}구, 타격은 ${PRACTICE.goal.bat}번을 채우면 고른 선수의 능력치 경험치가 쌓여요. 잘 던지고 잘 칠수록 더 많이 쌓여요. 경기를 하루 치르면 연습 횟수가 다시 채워져요.</p>
    </section>
    <section class="card">
      <div class="card-h">🎯 투구 연습장</div>
      <div class="label">연습할 투수</div>
      <div class="chips">${team.pitchers.map(p => `<button class="chip ${p.id === pit.id ? 'on' : ''}" data-pp="${p.id}"><span class="sp-top">${face(p, 'p', 'sm')}<b>${esc(p.name)}</b></span><small>${p.role === 'SP' ? '선발' : '불펜'} · ${p.velo}km · 제구 ${p.control}</small></button>`).join('')}</div>
      <div class="label">올릴 능력치</div>${statBtns(pit, PRACTICE_STATS.pitch, pStat, 'ps')}
      <div class="actions"><button class="primary big" data-act="pitchprac"${dis}>${left > 0 ? `🎯 투구 연습 시작 · ${PRACTICE.goal.pitch}구` : '오늘은 그만 쉬어요'}</button></div>
    </section>
    <section class="card">
      <div class="card-h">💥 타격 연습장</div>
      <div class="label">연습할 타자</div>
      <div class="chips">${team.batters.map(b => `<button class="chip ${b.id === bat.id ? 'on' : ''}" data-pb="${b.id}"><span class="sp-top">${face(b, 'b', 'sm')}<b>${esc(b.name)}</b></span><small>${b.pos} · 파워 ${b.power} · 컨택 ${b.contact}</small></button>`).join('')}</div>
      <div class="label">올릴 능력치</div>${statBtns(bat, PRACTICE_STATS.bat, bStat, 'bs')}
      <div class="actions"><button class="primary big" data-act="batprac"${dis}>${left > 0 ? `💥 타격 연습 시작 · ${PRACTICE.goal.bat}번` : '오늘은 그만 쉬어요'}</button></div>
    </section>
    <section class="card flush"><div class="card-h pad">🩺 투수 컨디션</div>
      ${tired.pitchers.map(p => { const L = loadNow(c, p.id); return `<div class="prow cond wa">${face(p, 'p')}
        <div class="pn"><b>${esc(p.name)}</b><small>${p.role === 'SP' ? '선발' : '불펜'} · 💚 체력 ${p.stamina}${L ? ` <em>(−${Math.round(0.4 * L * 100)}%)</em>` : ''}</small></div>
        <i class="fbar"><i style="width:${Math.round(L * 100)}%"></i></i>
        <div class="ps">${L ? `<b>${Math.round(L * 100)}%</b><small>회복 ${daysToRecover(L)}일</small>` : '<b class="fresh">😎 최상</b>'}</div></div>`; }).join('')}
      <div class="legend">던진 투수는 다음 경기에도 지친 채로 나오고, 3일이 지나야 완전히 회복해요</div>
    </section>`;
  }

  // ── 기록 탭 ──
  function recordsTab(c) {
    const h = c.history;
    const titles = h.filter(x => x.champion === ME).length;
    const w = h.reduce((a, x) => a + x.w, 0), l = h.reduce((a, x) => a + x.l, 0);
    return `<section class="card"><div class="stats3">
        <div><i>📅</i><b>${h.length}</b><small>시즌</small></div><div><i>🏆</i><b>${titles}</b><small>우승</small></div><div><i>⚔️</i><b>${w}-${l}</b><small>통산 승패</small></div></div></section>
      <section class="card flush"><div class="card-h pad">📜 역대 시즌</div>
      ${h.length ? [...h].reverse().map(x => `<div class="hrow ${x.champion === ME ? 'gold' : ''}"><b>${x.year}</b><span>${x.rank}위 · ${x.w}승 ${x.l}패${x.d ? ' ' + x.d + '무' : ''}</span><em>${x.result}</em></div>`).join('')
        : '<p class="hint pad">아직 끝낸 시즌이 없어요</p>'}</section>
      <section class="card"><div class="card-h">🔊 소리</div>
        ${volRow('🔊', '효과음', 'sfxVol', loadPrefs().sfxVol)}${volRow('👏', '배경음', 'ambVol', loadPrefs().ambVol)}
        <p class="hint">효과음은 방망이·글러브 소리, 배경음은 관중·응원 소리예요. 0%로 내리면 꺼져요. 바에서 손을 떼면 들어 볼 수 있어요.</p></section>
      <div class="actions"><button class="danger ghost" data-act="reset">🗑️ 커리어 처음부터</button></div>`;
  }

  function bind() {
    root.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => { tab = ctx.tab = b.dataset.tab; render(); root.querySelector('.screen').scrollTop = 0; }; });
    root.querySelectorAll('[data-cyc]').forEach(b => { b.onclick = () => { ctx.setup.cycles = +b.dataset.cyc; render(); }; });
    root.querySelectorAll('[data-inn]').forEach(b => { b.onclick = () => { ctx.setup.innings = +b.dataset.inn; render(); }; });
    root.querySelectorAll('[data-sp]').forEach(b => { b.onclick = () => { ctx.starterId = b.dataset.sp; render(); }; });
    let pr = loadPrefs();
    root.querySelectorAll('input[data-vol]').forEach(el => bindVol(el, v => {   // 0보다 크게 올리면 꺼져 있던 소리도 켠다
      const flag = el.dataset.vol === 'sfxVol' ? 'sfx' : 'amb';
      pr = { ...pr, [el.dataset.vol]: v, ...(v > 0 ? { [flag]: true } : {}) }; setAudioOptions(pr);
    }, () => savePrefs(pr)));
    root.querySelectorAll('[data-pp]').forEach(b => { b.onclick = () => { ctx.pr.pitchId = b.dataset.pp; render(); }; });
    root.querySelectorAll('[data-pb]').forEach(b => { b.onclick = () => { ctx.pr.batId = b.dataset.pb; render(); }; });
    root.querySelectorAll('[data-ps]').forEach(b => { b.onclick = () => { ctx.pr.pitchStat = b.dataset.ps; render(); }; });
    root.querySelectorAll('[data-bs]').forEach(b => { b.onclick = () => { ctx.pr.batStat = b.dataset.bs; render(); }; });
    root.querySelectorAll('[data-sv]').forEach(b => { b.onclick = () => { ctx.statView = b.dataset.sv; render(); }; });
    const on = ctx.on;
    const act = (name, fn) => root.querySelectorAll(`[data-act=${name}]`).forEach(b => { b.onclick = fn; });
    act('start', () => on.startSeason(ctx.setup));
    act('play', () => on.play(ctx.starterId));
    act('auto', () => on.auto(ctx.starterId));
    act('automany', () => on.autoMany(ctx.starterId));
    act('finish', () => on.finish());
    act('lineup', () => on.lineup());
    act('exhibition', () => on.exhibition());
    act('versus', () => on.versus());
    act('pitchprac', () => on.practice('pitch', ctx.pr.pitchId, ctx.pr.pitchStat));
    act('batprac', () => on.practice('bat', ctx.pr.batId, ctx.pr.batStat));
    act('reset', () => { if (confirm('지금까지의 시즌·성장·기록이 모두 지워져요. 처음부터 할까요?')) on.reset(); });
  }
  render();
}

// 연습 결과 화면
export function showPracticeResult(root, { career, kind, playerId, stat, n, pts, xp, ups, saved }, onDone) {
  const team = userTeamNow(career);
  const who = (team.batters.find(b => b.id === playerId) || team.pitchers.find(p => p.id === playerId) || {}).name || playerId;
  const cur = Math.round(((career.growth.xp[playerId] || {})[stat] || 0) / 12 * 100);
  root.innerHTML = `<div class="screen result">
    <div class="eyebrow center">${kind === 'pitch' ? '투구 연습장' : '타격 연습장'}</div>
    <div class="re">💪</div>
    <h1 class="res win">연습 끝!</h1>
    <p class="hint center">${esc(who)} · ${n}구 · 연습 점수 ${pts.toFixed(1)}</p>
    ${saved ? `<section class="card"><div class="card-h">${STAT_KO[stat]} 경험치 +${xp.toFixed(1)}</div>
      <i class="xp wide"><i style="width:${cur}%"></i></i>
      ${ups.length ? `<div class="ups"><div><b>${esc(who)}</b><span>${STAT_ICON[stat]} ${STAT_KO[stat]} <em>+${ups[0].n}${stat === 'velo' ? 'km' : ''}</em></span></div></div>` : `<p class="hint">다음 성장까지 ${cur}% 찼어요</p>`}</section>`
      : '<p class="hint center">오늘 연습 횟수를 다 써서 경험치는 쌓이지 않았어요</p>'}
    <div class="actions"><button class="primary big" id="ok">확인</button></div>
  </div>`;
  root.querySelector('#ok').onclick = onDone;
}

// 경기 결과 화면
export function showResult(root, { career, game, ups, title, heading }, onDone) {
  const team = userTeamNow(career);
  const nameOf = id => (team.batters.find(b => b.id === id) || team.pitchers.find(p => p.id === id) || {}).name || id;
  const s = career.season;
  const mine = game && (game.home === ME || game.away === ME);
  const myScore = mine ? (game.home === ME ? game.hs : game.as) : 0, opScore = mine ? (game.home === ME ? game.as : game.hs) : 0;
  const res = heading || !mine ? (heading || '경기 종료') : myScore > opScore ? '승리' : myScore < opScore ? '패배' : '무승부';
  const me = standings(s).find(x => x.id === ME);
  root.innerHTML = `<div class="screen result">
    <div class="eyebrow center">${esc(title || '')}</div>
    <div class="re">${res === '승리' ? '🎉' : res === '패배' ? '😢' : '⚾'}</div>
    <h1 class="res ${res === '승리' ? 'win' : res === '패배' ? 'lose' : ''}">${res}</h1>
    ${game ? `<div class="scoreline">${badge(game.away, 'lg')}<b>${game.as}</b><i>:</i><b>${game.hs}</b>${badge(game.home, 'lg')}</div>` : ''}
    ${s.phase === 'regular' || !s.post ? `<p class="hint center">시즌 ${me.w}승 ${me.l}패${me.d ? ' ' + me.d + '무' : ''} · ${me.rank}위</p>` : seriesLine(s)}
    ${ups.length ? `<section class="card"><div class="card-h">📈 성장한 선수</div><div class="ups">${ups.map(u => `<div><b>${esc(nameOf(u.id))}</b><span>${STAT_ICON[u.stat]} ${STAT_KO[u.stat]} <em>+${u.n}${u.stat === 'velo' ? 'km' : ''}</em></span></div>`).join('')}</div></section>` : ''}
    <div class="actions"><button class="primary big" id="ok">확인</button></div>
  </div>`;
  root.querySelector('#ok').onclick = onDone;
}

function seriesLine(s) {
  if (s.phase === 'done') return `<p class="hint center">${getTeam(s.champion).short} 한국시리즈 우승!</p>`;
  const prev = s.post.series.filter(x => x.games.length).pop();
  if (!prev) return '';
  const [a, b] = prev.teams;
  return `<p class="hint center">${prev.name} · ${teamName(a)} ${prev.wins[0]} - ${prev.wins[1]} ${b ? teamName(b) : ''}</p>`;
}

