// 육성모드 화면: 슬롯 3개 → 선수 고르기 → 육성 허브(선수 카드·오늘의 선택·다음 경기) → 경기(showGame raise 옵션) → 결과 → 시즌 종료 → 기록
// 규칙은 core/raise.js · core/raisematch.js · core/perks.js. 저장은 'baseball.raise.v1'만 쓴다
import { getTeam, USER_TEAM_ID } from '../data/rosters.js';
import { standings } from '../core/season.js';
import { avg, era, ip } from '../core/growth.js';
import { createRng } from '../core/rng.js';
import { TRAITS } from '../core/perks.js';
import { defaultLineup } from '../core/team.js';
import { RAISE, DRILLS, newSlot, loadRaise, saveRaise, slotPlayer, raiseTeam, canChoose, choose, dayInfo, applyDay, seasonOver, nextSeason, seasonGains, prelude , postResult, rings , withSpeed, instant } from '../core/raise.js';
import { seasonCard, leaderboard, STAT_DEFS, BOARD_TOP } from '../core/raisestats.js';
import { contract, startSalary, won, ksMvp, PAY } from '../core/raisepay.js';
import { playSound, vibrate } from './feedback.js';
import { face, badge } from './hub.js';

const ME = USER_TEAM_ID;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_KO = { power: '파워', contact: '컨택', eye: '선구안', speed: '주력', control: '제구', stamina: '체력', velo: '구속' };
const STAT_ICON = { power: '💪', contact: '⚾', eye: '👀', speed: '🏃', control: '🎯', stamina: '💚', velo: '🔥' };
const STATS = { bat: ['power', 'contact', 'eye', 'speed'], pitch: ['velo', 'control', 'stamina'] };
const COND = [['⬇⬇', '최악', 'c-2'], ['⬇', '나쁨', 'c-1'], ['➖', '보통', 'c0'], ['⬆', '좋음', 'c1'], ['⬆⬆', '최상', 'c2']];
const ROLE = { SP: '선발', CL: '마무리' };
const NOTE = { pinch: '대타로 교체됐어요', pulled: '강판됐어요', noshow: '오늘은 등판이 없었어요' };
const traitOf = id => TRAITS.find(t => t.id === id);

const condHtml = c => { const [i, n, k] = COND[c + 2]; return `<span class="rz-cond ${k}">${i} ${n}</span>`; };
const barPct = (stat, v) => (stat === 'velo' ? Math.max(4, Math.min(100, (v - 125) / 37 * 100)) : Math.min(100, v));
const roleOf = slot => (slot.kind === 'bat' ? slotPlayer(slot).pos : ROLE[slot.role]);

// 기록 한 줄
function batLine(b) {
  if (!b) return '';
  const extra = [b.hr && `${b.hr}홈런`, b.rbi && `${b.rbi}타점`, b.bb && `볼넷 ${b.bb}`, b.so && `삼진 ${b.so}`, b.sb && `도루 ${b.sb}`, b.cs && `도루 실패 ${b.cs}`].filter(Boolean).join(' · ');
  return `${b.ab}타수 ${b.h}안타${extra ? ' · ' + extra : ''}`;
}
function pitLine(p, dec) {
  if (!p) return '';
  const d = dec ? [dec.w && '승', dec.l && '패', dec.sv && '세이브'].filter(Boolean).join(' ') : '';
  return `${ip(p)}이닝 ${p.r}실점 · 탈삼진 ${p.so}${d ? ' · ' + d : ''}`;
}
const ops = b => { if (!b || !b.ab) return '.000'; const obp = (b.h + b.bb) / (b.ab + b.bb), slg = (b.h + b.d2 + 2 * b.d3 + 3 * b.hr) / b.ab; return (obp + slg).toFixed(3).replace(/^0/, ''); };
function seasonLine(slot, st) {
  if (!st) return '아직 기록이 없어요';
  if (slot.kind === 'bat') return st.bat ? `타율 ${avg(st.bat)} · ${st.bat.hr}홈런 · ${st.bat.rbi}타점 · OPS ${ops(st.bat)}${st.bat.sb || st.bat.cs ? ` · 도루 ${st.bat.sb || 0}${st.bat.cs ? `(실패 ${st.bat.cs})` : ''}` : ''}` : '아직 기록이 없어요';
  if (!st.pit) return '아직 기록이 없어요';
  return `평균자책 ${era(st.pit)} · ${ip(st.pit)}이닝 · ${st.w || 0}승 ${st.l || 0}패${slot.role === 'CL' ? ` ${st.sv || 0}세이브` : ''} · 탈삼진 ${st.pit.so}`;
}

// 연봉·자산(예전 저장은 연봉 표에서)
const salaryOf = s => s.salary ?? startSalary(s.playerId);
const moneyHtml = s => `<div class="rz-money"><span>💰 연봉 <b>${won(salaryOf(s))}</b></span><span>🏦 자산 <b>${won(s.assets || 0)}</b></span></div>`;
// 우승 반지
const ringHtml = s => (rings(s) ? ` <span class="rz-ring" title="한국시리즈 우승 ${rings(s)}회">💍${rings(s) > 1 ? '×' + rings(s) : ''}</span>` : '');
// 가을야구 소식(경기 결과 화면): 정규시즌이 끝난 날의 진출 여부, 시리즈를 이기거나 진 날
function postNews(rep) {
  if (rep.postStart) {
    const ps = rep.postStart;
    return ps.inPost ? `<section class="card rz-post"><div class="card-h">🍂 가을야구 진출!</div><p class="hint">정규시즌 ${ps.seed}위 · ${ps.seed === 1 ? '한국시리즈에 바로 올라가요' : `${esc(ps.series)}부터 시작해요`}</p></section>`
      : `<section class="card"><div class="card-h">🍃 가을야구 실패</div><p class="hint">정규시즌 ${rep.team.rank}위로 시즌을 마쳤어요</p></section>`;
  }
  const sr = rep.series;
  if (!sr || sr.won == null) return '';
  if (sr.won && sr.champion) return `<section class="card rz-post win"><div class="card-h">🏆 한국시리즈 우승!</div><p class="hint">${sr.w}승 ${sr.l}패로 정상에 올랐어요</p></section>`;
  if (sr.won) return `<section class="card rz-post win"><div class="card-h">🎉 ${esc(sr.name)} 승리!</div><p class="hint">${sr.w}승 ${sr.l}패 · 다음 시리즈로 올라가요</p></section>`;
  return `<section class="card"><div class="card-h">😢 ${esc(sr.name)} 탈락</div><p class="hint">${sr.w}승 ${sr.l}패 · 올해 가을야구는 여기까지예요</p></section>`;
}
// 시즌 결산: 올해 연봉이 자산으로, 내년 연봉 협상
function payCard(s) {
  const c = contract(s), after = (s.assets || 0) + c.from + c.bonus;
  const tone = c.pct > 0 ? 'up' : c.pct < 0 ? 'down' : '';
  return `<section class="card rz-pay"><div class="card-h">💰 연봉 협상 ${tip('시즌 성적(타자: OPS·타석 / 선발: 평균자책점·이닝 / 마무리: 평균자책점·세이브)으로 내년 연봉이 정해져요. 한 번에 최대 3배까지 오르고, 최대 40%까지 깎여요. 한국시리즈 우승하면 보너스와 연봉 프리미엄이 붙어요.', '연봉 협상')}</div>
    <div class="rz-payrow"><span>${s.year} 연봉</span><b>${won(c.from)}</b></div>
    ${c.bonus ? `<div class="rz-payrow"><span>🏆 우승 보너스${c.mvp ? ' + 🏅 MVP 상금' : ''}</span><b>+${won(c.bonus)}</b></div>` : ''}
    <div class="rz-payrow"><span>🏦 자산</span><b>${won(s.assets || 0)} → ${won(after)}</b></div>
    <div class="rz-payrow big ${tone}"><span>${s.year + 1} 연봉</span><b>${won(c.to)} <em>${c.pct > 0 ? '▲' : c.pct < 0 ? '▼' : ''}${Math.abs(c.pct)}%</em></b></div></section>`;
}

// ── 우승 세리머니 ──
// 삼성 라이온즈 실제 우승 8번(1985, 2002, 2005, 2006, 2011~2014). 게임 속 우승은 그다음부터 센다
const REAL_TITLES = 8, LAST_REAL_TITLE = 2014;
const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
const CONFETTI = ['#f2c14e', '#ffffff', '#3384ff', '#074CA1', '#ffe39a'];
function ceremonyHtml(s, team) {
  const p = slotPlayer(s), kind = s.kind === 'bat' ? 'b' : 'p', name = esc(p.name);
  const ks = s.season.post.series[3], mi = ks.teams.indexOf(ME), opp = ks.teams[1 - mi];
  const last = ks.games[ks.games.length - 1], my = last.home === ME ? last.hs : last.as, op = last.home === ME ? last.as : last.hs;
  const rank = standings(s.season).find(x => x.id === ME).rank, unified = rank === 1;
  const ring = rings(s) + 1, champs = s.history.filter(h => h.champion).map(h => h.year);
  const prev = champs.length ? champs[champs.length - 1] : LAST_REAL_TITLE;
  let streak = 1;
  while (champs.includes(s.year - streak)) streak++;
  const when = streak > 1 ? `🔥 ${streak}년 연속 우승!` : `${s.year - prev}년 만의 정상`;
  const mvp = ksMvp(s), pay = contract(s);
  const rng = createRng(s.year * 7 + ring);
  const mates = [...team.batters.map(x => [x, 'b']), ...team.pitchers.map(x => [x, 'p'])].filter(([x]) => x.id !== s.playerId)
    .map(x => [rng(), x]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  const mface = ([x, k], cls = 'sm') => face(x, k, cls);
  const ksLine = s.ksStats && (s.ksStats.bat || s.ksStats.pit) ? seasonLine(s, s.ksStats) : null;
  const confetti = Array.from({ length: 46 }, (_, k) => `<i style="left:${(rng() * 100).toFixed(1)}%;animation-delay:${(rng() * 3).toFixed(2)}s;animation-duration:${(2.6 + rng() * 2.4).toFixed(2)}s;background:${CONFETTI[k % CONFETTI.length]};--r:${Math.round(rng() * 720 - 360)}deg"></i>`).join('');
  const chant = Array(6).fill(`최강 삼성! ${name}! `).join('');
  const stages = [
    // 1. 마지막 아웃
    `<div class="cer-kicker">${s.year} 한국시리즈 ${ks.games.length}차전 · 경기 종료</div>
     <div class="cer-score">${badge(ME, 'lg')}<b>${my}</b><span>:</span><b>${op}</b>${badge(opp, 'lg')}</div>
     <div class="cer-trophy">🏆</div>
     <h1 class="cer-title">${unified ? '통합 우승!' : '한국시리즈 우승!'}</h1>
     <p>시리즈 <b>${ks.wins[mi]}승 ${ks.wins[1 - mi]}패</b> · ${esc(getTeam(opp).name)}${josa(getTeam(opp).name, '을', '를')} 꺾고 정상에 올랐어요</p>
     <p class="cer-tag">${unified ? '👑 정규시즌 1위 + 한국시리즈 우승' : `✨ 정규시즌 ${rank}위에서 시작한 기적의 가을`}</p>`,
    // 2. 헹가래
    `<div class="cer-kicker">그라운드 위 세리머니</div>
     <div class="cer-toss"><div class="cer-flyer">${face(p, kind, 'lg')}</div>
       <div class="cer-crowd">${mates.slice(0, 5).map((m, k) => `<span style="--d:${k * 0.07}s">${mface(m)}<em>🙌</em></span>`).join('')}</div></div>
     <h2 class="cer-h">하나, 둘, 셋! 헹가래!</h2>
     <p>동료들이 ${name}${josa(p.name, '을', '를')} 하늘 높이 던져 올려요</p>
     <div class="cer-chant"><span>${chant}</span></div>`,
    // 3. MVP / 나의 한국시리즈
    mvp ? `<div class="cer-mvp"><div class="cer-kicker">${s.year} 한국시리즈</div><div class="cer-medal">🏅</div><h1 class="cer-title">MVP</h1>
       <div class="cer-who">${face(p, kind, 'lg')}<b>${name}</b></div>
       <p class="rz-line">${ksLine}</p>
       <p class="cer-tag">기자단 투표로 MVP 선정! · 상금 +${won(PAY.mvpBonus)}</p></div>`
      : `<div class="cer-kicker">${name}의 한국시리즈</div><div class="cer-medal">${ksLine ? '⚾' : '🧢'}</div>
       ${ksLine ? `<p class="rz-line">${ksLine}</p><p>우승 반지에 ${name}의 이름도 새겨져요</p><p class="hint">MVP는 한 끗 차이로 놓쳤어요 · 다음엔 더 큰 활약을!</p>`
        : `<p>이번 한국시리즈엔 나서지 못했지만<br>정규시즌의 활약이 우승의 밑거름이 됐어요</p><p class="rz-line">정규시즌 ${seasonLine(s, s.stats)}</p>`}`,
    // 4. 우승 반지
    `<div class="cer-kicker">챔피언의 증표</div>
     <div class="cer-ringwrap"><div class="cer-ring"><i>💎</i></div></div>
     <div class="cer-engrave">${s.year} CHAMPIONS · ${name} · #${ring}</div>
     <h2 class="cer-h">💍 우승 반지 ${ring}개째</h2>
     <p>삼성 라이온즈 통산 <b>${REAL_TITLES + ring}번째 우승</b> · ${when}</p>
     <div class="cer-gifts"><span>🏆 우승 보너스 <b>+${won(PAY.champBonus)}</b></span>${mvp ? `<span>🏅 MVP 상금 <b>+${won(PAY.mvpBonus)}</b></span>` : ''}<span>📈 내년 연봉 <b>${won(pay.to)}</b></span></div>`,
    // 5. 기념 사진
    `<div class="cer-photo"><div class="cer-banner">🏆 ${s.year} CHAMPIONS 🏆</div>
       <div class="cer-row back">${mates.slice(0, 8).map(m => mface(m)).join('')}</div>
       <div class="cer-row front">${mates.slice(8, 11).map(m => mface(m)).join('')}<span class="cer-me"><em>👑</em>${face(p, kind, 'lg')}</span>${mates.slice(11, 14).map(m => mface(m)).join('')}</div>
       <div class="cer-cap">삼성 라이온즈 · ${s.year} ${unified ? '통합 우승' : '한국시리즈 우승'}<small>${name}${mvp ? ' · 한국시리즈 MVP' : ''} · 우승 반지 ${ring}개</small></div></div>
     <p class="hint">찰칵! 📸 우승 기념 사진이에요</p>`,
  ];
  return { n: stages.length, html: `<div class="cer-confetti" aria-hidden="true">${confetti}</div>
    <div class="cer">${stages.map((h, k) => `<section class="card cer-stage ${k ? '' : 'on'}" data-n="${k}">${h}</section>`).join('')}
    <div class="cer-dots">${stages.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</div>
    <div class="actions"><button class="primary big" data-act="cnext">다음 ▶</button><button class="ghost" data-act="cskip">건너뛰기</button></div></div>` };
}

// 삼성의 가을야구 길: 시리즈마다 상대와 승패
function postPath(s) {
  const post = s.season.post;
  if (!post || !post.seeds.includes(ME)) return '';
  const rows = post.series.filter(x => x.teams.includes(ME)).map(x => {
    const mi = x.teams.indexOf(ME), opp = x.teams[1 - mi];
    const won = x.wins[mi] >= x.need;
    return `<tr class="${won ? 'me' : ''}"><td>${esc(x.name)}</td><td>${opp ? `${badge(opp)} ${getTeam(opp).short}` : '-'}</td><td>${x.wins[mi]}승 ${x.wins[1 - mi]}패 ${won ? '✅' : '❌'}</td></tr>`;
  }).join('');
  return `<section class="card flush"><div class="card-h pad">🍂 ${s.year} 가을야구</div><table class="rz-table">${rows}</table>
    ${s.season.champion && s.season.champion !== ME ? `<p class="hint pad">우승: ${getTeam(s.season.champion).name}</p>` : ''}</section>`;
}

// 설명 단추(ⓘ): 마우스를 올리거나 누르면 data-tip 글이 뜬다
const tip = (text, label) => `<button type="button" class="tip" data-tip="${esc(text)}" aria-label="${esc(label)} 설명">ⓘ</button>`;
const tier = p => (p == null ? '' : p <= 10 ? 't1' : p <= 30 ? 't2' : p > 70 ? 't4' : 't3');

// 이번 시즌 기록 카드: 수치마다 설명(ⓘ)과 리그 상위 몇 %
function seasonStatsCard(slot) {
  const c = seasonCard(slot);
  const group = c.kind === 'bat' ? '타자' : slot.role === 'SP' ? '선발 투수' : '불펜 투수';
  const head = `상위 N%: 이번 시즌 규정(${c.need})을 채운 리그 ${group} ${c.pool}명 중 내 순위예요. 1%에 가까울수록 리그 최고예요.`;
  return `<section class="card rz-season"><div class="card-h">📊 ${slot.year} 시즌 기록 ${tip(head, '상위 퍼센트')}</div>
      <div class="rz-sgrid">${c.rows.map(r => `<div class="rz-st ${tier(r.pct)}">
        <span class="k">${esc(r.name)}${tip(r.info, r.name)}</span><b>${esc(r.text)}</b><em>${r.pct ? `${r.rank}위 · 상위 ${r.pct}%` : '&nbsp;'}</em></div>`).join('')}</div>
      <p class="hint">${esc(c.extra)}</p>
      ${c.qualified ? '' : `<p class="hint">규정(${c.need})을 채우면 리그에서 상위 몇 %인지 나와요</p>`}
    </section>`;
}

// 리그 순위표: 기록 탭(타율·홈런…)마다 1~10위와 내 자리
const groupName = slot => (slot.kind === 'bat' ? '타자' : slot.role === 'SP' ? '선발 투수' : '불펜 투수');
function boardTable(slot, key) {
  const b = leaderboard(slot, key);
  const tr = r => `<tr class="${r.me ? 'me' : ''}"><td>${r.rank == null ? '-' : `${r.tie ? '<small>공동</small>' : ''}${r.rank}`}</td>
      <td>${esc(r.name)} <small>${esc(r.team)}</small></td><td>${esc(r.text)}</td></tr>`;
  const top = b.rows.slice(0, BOARD_TOP), rest = b.rows.slice(BOARD_TOP);   // 50위 밖이면 나만 따로 아래에
  const gap = rest.some(r => r.gap) ? '<tr class="gap"><td colspan="3">⋯</td></tr>' : '';
  const mine = b.myRank != null ? `내 순위 <b>${b.rows.find(r => r.me).tie ? '공동 ' : ''}${b.myRank}위</b> / ${b.pool}명` : '규정을 채우면 순위에 들어가요';
  return `<p class="hint rz-bcap">${esc(b.name)}${b.low ? ' (낮을수록 좋아요)' : ''} · ${mine}</p>
    ${b.rows.length ? `<div class="rz-bscroll"><table class="rz-table rz-board">${top.map(tr).join('')}${gap}${rest.map(tr).join('')}</table></div>` : '<p class="hint">아직 순위에 든 선수가 없어요</p>'}`;
}
function boardCard(slot, key) {
  const defs = STAT_DEFS[slot.kind === 'pitch' ? 'pit' : 'bat'];
  return `<section class="card rz-boardc"><div class="card-h">🏅 리그 ${groupName(slot)} 순위표 ${tip(`이번 시즌 규정을 채운 리그 ${groupName(slot)}끼리 매긴 순위예요. 기록이 같으면 공동 순위예요.`, '순위표')}</div>
      <div class="rz-tabs">${defs.map(d => `<button type="button" class="rz-tab ${d.key === key ? 'on' : ''}" data-act="board" data-k="${d.key}">${esc(d.name)}</button>`).join('')}</div>
      <div class="rz-bbody">${boardTable(slot, key)}</div></section>`;
}

// 설명 말풍선 하나를 화면에 띄워 두고 돌려 쓴다(폰은 누르기, 컴퓨터는 마우스 올리기)
function tipBox(root) {
  if (root.__tipHide) return root.__tipHide;          // 육성모드에 다시 들어와도 듣는 곳은 한 번만
  let box = document.querySelector('.tipbox'), cur = null;
  if (!box) { box = document.createElement('div'); box.className = 'tipbox'; box.hidden = true; document.body.appendChild(box); }
  const hide = () => { box.hidden = true; cur = null; };
  const show = el => {
    cur = el; box.textContent = el.dataset.tip; box.hidden = false;
    const r = el.getBoundingClientRect(), w = Math.min(260, window.innerWidth - 24);
    box.style.width = w + 'px';
    box.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
    const below = r.bottom + 8, h = box.offsetHeight;
    box.style.top = (below + h > window.innerHeight - 8 ? r.top - h - 8 : below) + 'px';
  };
  root.addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('.tip'); if (t && e.pointerType === 'mouse') show(t); });
  root.addEventListener('pointerout', e => { const t = e.target.closest && e.target.closest('.tip'); if (t && e.pointerType === 'mouse') hide(); });
  root.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('.tip');
    if (!t) return hide();
    e.preventDefault(); e.stopPropagation();
    if (cur === t && !box.hidden) hide(); else show(t);
  }, true);
  window.addEventListener('scroll', hide, true);
  root.__tipHide = hide;
  return hide;
}

export function showRaise(root, { storage, loadGame, onBack }) {
  let data = loadRaise(storage), saveOk = true, brokenShown = false;
  const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const persist = () => { saveOk = saveRaise(storage, data); };
  const hideTip = tipBox(root);
  const screen = (html, cls = '') => {
    hideTip();
    root.innerHTML = `<div class="screen menu raise ${cls}">${html}${saveOk ? '' : '<p class="note center">이 브라우저에서는 저장이 안 돼요. 창을 닫으면 진행이 사라져요.</p>'}</div>`;
    const sc = root.querySelector('.screen'); if (sc) sc.scrollTop = 0;
  };
  const act = (name, fn) => root.querySelectorAll(`[data-act=${name}]`).forEach(b => { b.onclick = () => fn(b); });
  // 순위표 탭: 고른 기록은 기억해 두고 표만 바꾼다
  const boardKey = { bat: 'avg', pitch: 'era' };
  // 순위표는 표 안에서만 스크롤된다. 처음에는 내 줄이 가운데 오게
  const centerMe = () => {
    const box = root.querySelector('.rz-bscroll'), me = box && box.querySelector('tr.me');
    if (me) box.scrollTop = Math.max(0, me.offsetTop - box.clientHeight / 2 + me.offsetHeight / 2);
  };
  const bindBoard = s => {
    act('board', b => {
      boardKey[s.kind] = b.dataset.k;
      root.querySelectorAll('[data-act=board]').forEach(c => c.classList.toggle('on', c === b));
      const body = root.querySelector('.rz-bbody'); if (body) { body.innerHTML = boardTable(s, b.dataset.k); centerMe(); }
    });
    centerMe();
  };

  // ── 슬롯 목록 ──
  function slotsView() {
    const broken = !brokenShown && data.broken.length ? `<p class="note">저장된 육성 슬롯 ${data.broken.map(i => i + 1).join(', ')}번이 손상돼서 비웠어요.</p>` : '';
    brokenShown = true;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>🌱 육성모드</h2></header>
      <p class="hint">삼성 선수 한 명을 골라 끝없이 키워요. 경기와 경기 사이에 훈련이나 휴식을 하나 고르고, 경기에서는 내 선수 장면만 직접 해요.</p>${broken}
      ${data.slots.map((s, i) => s ? `<section class="card rz-slot">
        <div class="rz-who">${face(slotPlayer(s), s.kind === 'bat' ? 'b' : 'p')}<div><b>${esc(slotPlayer(s).name)}${ringHtml(s)}</b><small>${roleOf(s)} · ${dayInfo(s).label}</small></div>${condHtml(s.condition)}</div>
        <p class="hint">${seasonLine(s, s.stats)}</p>${moneyHtml(s)}
        <div class="actions"><button class="primary" data-act="open" data-i="${i}">▶ 이어서 키우기</button><button class="ghost small" data-act="del" data-i="${i}">지우기</button></div>
      </section>` : `<section class="card rz-slot empty"><div class="card-h">${i + 1}번 슬롯 · 비어 있음</div>
        <div class="actions"><button class="ghost" data-act="new" data-i="${i}">＋ 새로 키우기</button></div></section>`).join('')}`);
    act('back', onBack);
    act('open', b => hubView(+b.dataset.i));
    act('new', b => pickView(+b.dataset.i, 'bat'));
    act('del', b => {
      const i = +b.dataset.i;
      if (!confirm(`${slotPlayer(data.slots[i]).name} 슬롯을 지울까요? 키운 능력치와 기록이 모두 사라져요.`)) return;
      data = { ...data, slots: data.slots.map((s, j) => (j === i ? null : s)) }; persist(); slotsView();
    });
  }

  // ── 선수 고르기 ──
  const gamesSeg = (games, act) => `<div class="seg rz-games">${RAISE.seasonGames.map(g => `<button data-act="${act}" data-g="${g}" class="${g === games ? 'on' : ''}">📅 ${g}경기</button>`).join('')}</div>`;
  function pickView(i, kind, games = RAISE.seasonGames[0]) {
    const t = withSpeed(getTeam(ME)), list = kind === 'bat' ? t.batters : t.pitchers;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>${i + 1}번 슬롯 · 선수 고르기</h2></header>
      <div class="seg"><button data-act="kind" data-k="bat" class="${kind === 'bat' ? 'on' : ''}">🏏 타자</button><button data-act="kind" data-k="pitch" class="${kind === 'pitch' ? 'on' : ''}">⚾ 투수</button></div>
      <p class="hint">정규시즌 경기 수 (시즌이 끝날 때마다 바꿀 수 있어요)</p>${gamesSeg(games, 'games')}
      <p class="hint">${kind === 'bat' ? '타자는 내 타석만 직접 쳐요.' : '선발은 4경기마다 선발로 나가 강판될 때까지 던지고, 마무리는 점수 차가 3점 이하인 9회에 나와요.'} 능력치는 원래 명단 값에서 시작해요.</p>
      <div class="rz-pick">${list.map(p => `<button class="chip rz-pp" data-act="pick" data-id="${p.id}">
        <span class="rz-who">${face(p, kind === 'bat' ? 'b' : 'p')}<span><b>${esc(p.name)}</b><small>${kind === 'bat' ? `${p.pos} · ${p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타'}` : `${ROLE[p.role === 'SP' ? 'SP' : 'CL']} · ${p.throws === 'L' ? '좌투' : '우투'}`}</small></span></span>
        ${STATS[kind].map(k => `<span class="ms"><span>${STAT_ICON[k]}</span><i><u style="width:${barPct(k, p[k])}%"></u></i><em>${p[k]}</em></span>`).join('')}
      </button>`).join('')}</div>`);
    act('back', slotsView);
    act('kind', b => pickView(i, b.dataset.k, games));
    act('games', b => pickView(i, kind, +b.dataset.g));
    act('pick', b => {
      data = { ...data, slots: data.slots.map((s, j) => (j === i ? newSlot(b.dataset.id, { games }) : s)) }; persist(); hubView(i);
    });
  }

  // ── 육성 허브 ──
  let flash = null;      // 방금 고른 선택의 결과 한 줄
  function hubView(i) {
    const s = data.slots[i];
    if (!s) return slotsView();
    if (seasonOver(s)) return seasonEndView(i);
    const p = slotPlayer(s), d = dayInfo(s), opp = getTeam(d.opponentId), st = standings(s.season).find(x => x.id === ME);
    const drills = DRILLS.filter(x => x.kind === s.kind);
    const choiceHtml = s.chosen ? `<p class="rz-done">✅ ${flash ? esc(flash) : '오늘 선택을 마쳤어요'}</p>`
      : `<div class="rz-drills">${drills.map(x => {
        const c = canChoose(s, x.id), n = s.progress.train[x.id] || 0, tr = x.trait && traitOf(x.trait);
        const sub = x.drill ? (s.traits.includes(x.trait) ? `${tr.name} 보유` : `→ ${tr.name} ${Math.min(n, RAISE.drillNeed)}/${RAISE.drillNeed}`) : `${STAT_ICON[x.stat]} ${STAT_KO[x.stat]} ${p[x.stat]}`;
        const how = x.quick ? '달리기 트랙 · 바로 끝' : x.light ? '바로 끝 · 효과 조금' : s.kind === 'bat' ? `타격 ${RAISE.practiceGoal.bat}번` : `투구 ${RAISE.practiceGoal.pitch}구`;
        return `<button class="chip ${x.drill ? 'drill' : instant(x) ? 'light' : ''}" data-act="choose" data-id="${x.id}" ${c.ok ? '' : 'disabled'}><b>${x.quick ? '🏃 ' : x.light ? (x.stat === 'power' ? '🏋️ ' : '🧘 ') : ''}${x.name}</b><small>${sub}</small><small class="${c.ok ? '' : 'tired'}">${c.ok ? `피로 +${x.cost} · ${how}` : '너무 지쳤어요'}</small></button>`;
      }).join('')}
        <button class="chip rest" data-act="choose" data-id="rest"><b>😴 휴식</b><small>피로 ${RAISE.rest} · 컨디션이 보통 쪽으로</small><small>오늘 경기는 결장</small></button></div>
      <p class="hint">훈련을 고르면 연습장에서 직접 ${s.kind === 'bat' ? '쳐요' : '던져요'}. 잘할수록 많이 오르고, 중간에 나가면 훈련은 없던 일이 돼요. 훈련한 날도 경기에는 나가요. 휴식한 날만 쉬어요.</p>`;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>🌱 육성모드</h2><button class="ghost small rz-rec" data-act="records">📜 기록</button></header>
      <section class="card rz-card">
        <div class="rz-who">${face(p, s.kind === 'bat' ? 'b' : 'p', 'lg')}<div><b class="rz-name">${esc(p.name)}${ringHtml(s)}</b><small>삼성 · ${roleOf(s)} · ${s.year} 시즌</small></div>${condHtml(s.condition)}</div>
        <div class="rz-stats">${STATS[s.kind].map(k => `<span class="ms"><span>${STAT_ICON[k]} ${STAT_KO[k]}</span><i><u style="width:${barPct(k, p[k])}%"></u></i><em>${p[k]}${k === 'velo' ? 'km' : ''}</em></span>`).join('')}</div>
        <div class="rz-fat"><span>😮‍💨 피로</span><i><u class="${s.fatigue >= RAISE.tiredAt ? 'hi' : ''}" style="width:${s.fatigue}%"></u></i><em>${Math.round(s.fatigue)}</em></div>
        ${s.traits.length ? `<div class="rz-traits">${s.traits.map(t => `<span class="rz-trait" title="${esc(traitOf(t).desc)}">✨ ${esc(traitOf(t).name)}</span>`).join('')}</div>` : '<p class="hint">특성은 특훈을 4번 하거나 경기에서 활약하면 생겨요</p>'}
        <p class="hint">${seasonLine(s, s.stats)}</p>${moneyHtml(s)}
      </section>
      <section class="card"><div class="card-h">🗓️ 오늘의 선택</div>${choiceHtml}</section>
      <section class="card next">
        <div class="card-h">${d.post ? '🍂' : '⚾'} ${d.label}<span class="pill">${d.post ? `정규시즌 ${st.rank}위` : `${st.w}승 ${st.l}패${st.d ? ' ' + st.d + '무' : ''} · ${st.rank}위`}</span></div>
        ${d.post ? `<p class="hint center">🍂 가을야구 · ${esc(d.series.name)} ${d.series.need}승 하면 다음 단계로${d.series.name === '한국시리즈' ? ' (우승!)' : ''}</p>` : ''}
        <div class="vs-row"><div class="side" style="--c:${opp.colors.main}">${badge(opp.id, 'lg')}<b>${opp.short}</b><small>✈️ 원정</small></div><span class="vs">VS</span><div class="side" style="--c:${getTeam(ME).colors.main}">${badge(ME, 'lg')}<b>삼성</b><small>🏠 홈</small></div></div>
        ${s.role === 'SP' ? `<p class="hint center">${d.myStart ? '🔥 오늘 선발 등판이에요' : `오늘은 등판이 없어요 · ${d.nextStartIn == null ? '이번 시즌 남은 선발이 없어요' : `다음 선발까지 ${d.nextStartIn}경기`}`}</p>` : ''}
        ${!s.chosen ? '<p class="hint center">선택 없이 경기에 나가면 피로가 조금만 풀려요</p>' : ''}
        ${d.resting ? '<p class="hint center">😴 오늘은 휴식이라 경기에 나가지 않아요</p>' : ''}
        <div class="actions">${d.needsScreen ? '<button class="primary big" data-act="play">▶ 경기 시작</button>' : `<button class="primary big" data-act="play">⏩ 경기 진행 (${d.resting ? '휴식 · 결장' : '등판 없음'})</button>`}</div>
      </section>`);
    act('back', () => { flash = null; slotsView(); });
    act('records', () => recordsView(i));
    act('choose', b => {
      const id = b.dataset.id;
      const x = DRILLS.find(q => q.id === id);
      if (instant(x)) return lightTraining(i, x);
      if (id !== 'rest') return training(i, id);
      const r = choose(data.slots[i], 'rest');
      data = { ...data, slots: data.slots.map((q, j) => (j === i ? r.slot : q)) }; persist();
      flash = `휴식 · 피로 ${Math.round(r.slot.fatigue)}`;
      hubView(i);
    });
    act('play', () => play(i));
  }

  // 연습장 없이 바로 끝나는 훈련(헬스·유연성·주루)
  function lightTraining(i, x) {
    if (!canChoose(data.slots[i], x.id).ok) return;
    const r = choose(data.slots[i], x.id);
    data = { ...data, slots: data.slots.map((q, j) => (j === i ? r.slot : q)) }; persist();
    const ups = r.ups.map(u => `${STAT_KO[u.stat]} +${u.n}`).join(', ');
    flash = `${x.quick ? '🏃 트랙을 힘껏 달렸어요 · ' : ''}${x.name} 완료${ups ? ` · ${ups}` : ` · ${STAT_KO[x.stat]} 경험치가 ${x.quick ? '' : '조금 '}쌓였어요`}`;
    hubView(i);
  }

  // 훈련 = 연습장 한 번(타자는 타격 연습, 투수는 투구 연습). 끝까지 하면 그 점수로 능력치 경험치가 쌓인다
  async function training(i, id) {
    const s = data.slots[i], x = DRILLS.find(q => q.id === id);
    if (!canChoose(s, id).ok) return;
    const mod = await loadGame();
    if (!mod) return hubView(i);
    const team = raiseTeam(s), base = defaultLineup(team), kind = s.kind;
    const lineup = kind === 'pitch' ? { ...base, starterId: s.playerId } : { ...base, order: Array(9).fill(s.playerId) };
    mod.showGame(root, {
      userTeam: team, cpuTeam: getTeam('lg'), lineup, innings: 99, title: `${x.name} · ${slotPlayer(s).name}`,
      practice: { kind, playerId: s.playerId, stat: x.stat, goal: RAISE.practiceGoal[kind] },
    }, result => {
      const pr = result && result.practice;
      if (!pr) { flash = null; return hubView(i); }               // 중간에 나감: 훈련 안 한 것으로
      const r = choose(data.slots[i], id, pr.pts);
      data = { ...data, slots: data.slots.map((q, j) => (j === i ? r.slot : q)) }; persist();
      const k = pr.pts / RAISE.practiceRef[kind], grade = k >= 1.3 ? '훌륭해요!' : k >= 0.9 ? '좋아요' : '아쉬워요';
      const ups = r.ups.map(u => `${STAT_KO[u.stat]} +${u.n}`).join(', ');
      flash = `${x.name} 완료 · 연습 점수 ${pr.pts.toFixed(1)} ${grade}${ups ? ` · ${ups}` : ' · 경험치가 쌓였어요'}${r.trait ? ` · ✨ 특성 '${traitOf(r.trait).name}'을 얻었어요!` : ''}`;
      hubView(i);
    });
  }

  async function play(i) {
    const s = data.slots[i], d = dayInfo(s);
    flash = null;
    if (!d.needsScreen) return finishDay(i, null);
    // 내 첫 장면까지 미리 돌려 보고, 오늘 내 장면이 없으면(마무리 등판 없음) 경기 화면 없이 바로 결과로
    const pre = prelude(s, rng);
    if (pre.result) return finishDay(i, pre.result);
    const mod = await loadGame();
    if (!mod) return hubView(i);
    const set = pre.set;
    mod.showGame(root, { ...set, innings: 9, startMatch: pre.match, stats: s.kind === 'bat' && s.stats.bat ? { bat: { [s.playerId]: s.stats.bat } } : null },
      result => (result ? finishDay(i, result) : hubView(i)));      // 중간에 나가면 그 경기는 없던 것
  }

  function finishDay(i, result) {
    const out = applyDay(data.slots[i], result, rng);
    data = { ...data, slots: data.slots.map((q, j) => (j === i ? out.slot : q)) }; persist();
    resultView(i, out.report, result && result.raise ? result.raise.note : null);
  }

  // ── 경기 결과 ──
  function resultView(i, rep, note) {
    const s = data.slots[i], p = slotPlayer(s), g = rep.game;
    const res = !g ? '경기 종료' : g.hs > g.as ? '승리' : g.hs < g.as ? '패배' : '무승부';
    const line = s.kind === 'bat' ? batLine(rep.line.bat && { ...rep.line.bat, ...(rep.run || {}) }) : pitLine(rep.line.pit, rep.dec);
    const why = rep.rested ? '😴 오늘은 휴식하며 경기에 나가지 않았어요' : NOTE[note] || (!rep.appeared ? (s.kind === 'bat' ? '오늘은 타석에 서지 못했어요' : '오늘은 등판이 없었어요') : '');
    screen(`<div class="eyebrow center">${esc(p.name)} · ${s.year} ${rep.post ? `가을야구 · ${esc(rep.series.name)}` : `시즌 ${s.season.round}/${s.season.schedule.length}경기`}</div>
      <div class="re">${res === '승리' ? '🎉' : res === '패배' ? '😢' : '⚾'}</div>
      <h1 class="res ${res === '승리' ? 'win' : res === '패배' ? 'lose' : ''}">${res}</h1>
      ${g ? `<div class="scoreline">${badge(g.away, 'lg')}<b>${g.as}</b><i>:</i><b>${g.hs}</b>${badge(g.home, 'lg')}</div>` : ''}
      ${rep.post ? `<p class="hint center">${esc(rep.series.name)} ${rep.series.w}승 ${rep.series.l}패</p>` : `<p class="hint center">팀 ${rep.team.w}승 ${rep.team.l}패${rep.team.d ? ' ' + rep.team.d + '무' : ''} · ${rep.team.rank}위</p>`}
      ${postNews(rep)}
      ${rep.traitsNew.length ? `<section class="card rz-newtrait">${rep.traitsNew.map(t => `<div class="card-h">✨ 새 특성 · ${esc(traitOf(t).name)}</div><p class="hint">${esc(traitOf(t).desc)}</p>`).join('')}</section>` : ''}
      <section class="card"><div class="card-h">📋 오늘 ${esc(p.name)}</div>
        <p class="rz-line">${line || '-'}</p>${why ? `<p class="hint">${why}</p>` : ''}
        <p class="hint">컨디션 ${condHtml(rep.condFrom)} → ${condHtml(rep.condTo)} · 피로 ${Math.round(s.fatigue)}</p>
        ${rep.ups.length ? `<div class="ups">${rep.ups.map(u => `<div><b>${STAT_ICON[u.stat]} ${STAT_KO[u.stat]}</b><span><em>+${u.n}${u.stat === 'velo' ? 'km' : ''}</em></span></div>`).join('')}</div>` : ''}
      </section>
      ${seasonStatsCard(s)}
      ${boardCard(s, boardKey[s.kind])}
      <div class="actions"><button class="primary big" data-act="ok">${rep.seasonOver ? (rep.series && rep.series.champion ? '🏆 우승 세리머니' : '시즌 결산 보기') : '확인'}</button></div>`, 'result');
    act('ok', () => hubView(i));
    bindBoard(s);
  }

  // ── 시즌 종료 ──
  // 우승 세리머니: 다섯 장면(마지막 아웃 → 헹가래 → MVP → 우승 반지 → 기념 사진)을 눌러 넘긴다
  const cereSeen = new Set();
  function ceremonyView(i) {
    const s = data.slots[i];
    cereSeen.add(`${i}:${s.year}`);
    const c = ceremonyHtml(s, raiseTeam(s));
    screen(c.html, 'result cer-screen');
    let k = 0;
    const cue = n => {
      if (n === 0) { playSound('roar'); playSound('jingle'); vibrate([80, 60, 80, 60, 200]); }
      else if (n === 1) { playSound('cheer'); vibrate([40, 120, 40, 120, 40]); }
      else if (n === 2) { if (ksMvp(s)) { playSound('jingle'); vibrate([60, 40, 160]); } else playSound('cheer', { gain: 0.6 }); }
      else if (n === 3) { playSound('cheer', { gain: 0.7 }); vibrate(60); }
      else playSound('roar', { gain: 0.6 });
    };
    const show = n => {
      root.querySelectorAll('.cer-stage').forEach(el => el.classList.toggle('on', +el.dataset.n === n));
      root.querySelectorAll('.cer-dots i').forEach((el, j) => el.classList.toggle('on', j <= n));
      const b = root.querySelector('[data-act=cnext]'); if (b) b.textContent = n === c.n - 1 ? '📜 시즌 결산 보기' : '다음 ▶';
      const sk = root.querySelector('[data-act=cskip]'); if (sk) sk.hidden = n === c.n - 1;
      const sc = root.querySelector('.screen'); if (sc) sc.scrollTop = 0;
      cue(n);
    };
    cue(0);
    act('cnext', () => { if (k >= c.n - 1) return seasonEndView(i); show(++k); });
    act('cskip', () => seasonEndView(i));
  }

  function seasonEndView(i, nextGames = data.slots[i].games || RAISE.seasonGames[0]) {
    const s = data.slots[i], p = slotPlayer(s), st = standings(s.season);
    const before = new Set(s.history.flatMap(h => h.traitsNew || []));
    const gained = s.traits.filter(t => !before.has(t)), ups = seasonGains(s);
    const champ = s.season.champion === ME, result = postResult(s);
    if (champ && !cereSeen.has(`${i}:${s.year}`)) return ceremonyView(i);
    const mvp = champ && ksMvp(s);
    screen(`<div class="eyebrow center">${s.year} 시즌 종료</div>
      ${champ ? `<section class="card rz-champ"><div class="rz-confetti">🎊 🏆 🎊</div><h1>${esc(result)}!</h1>
        <p>${s.year} 삼성 라이온즈가 한국시리즈 정상에 올랐어요</p>
        <div class="rz-ringbig">💍 우승 반지 ${rings(s) + 1}개째</div>${mvp ? '<div class="rz-ringbig mvp">🏅 한국시리즈 MVP</div>' : ''}
        <p class="hint">${esc(p.name)}의 우승 반지는 슬롯과 허브에 계속 남아요</p>
        <button class="ghost small" data-act="cere">🎬 세리머니 다시 보기</button></section>`
        : `<div class="re">🏁</div><h1 class="res">${esc(p.name)}</h1><p class="hint center rz-postres">${s.season.post && s.season.post.seeds.includes(ME) ? '🍂' : '🍃'} ${esc(result)}</p>`}
      ${s.postStats ? `<section class="card"><div class="card-h">🍂 가을야구 기록</div><p class="rz-line">${seasonLine(s, s.postStats)}</p></section>` : ''}
      ${postPath(s)}
      ${payCard(s)}
      <section class="card"><div class="card-h">📊 시즌 성적</div><p class="rz-line">${seasonLine(s, s.stats)}</p>
        ${ups.length ? `<div class="ups">${ups.map(u => `<div><b>${STAT_ICON[u.stat]} ${STAT_KO[u.stat]}</b><span><em>+${u.n}${u.stat === 'velo' ? 'km' : ''}</em></span></div>`).join('')}</div>` : '<p class="hint">이번 시즌에 오른 능력치는 없어요</p>'}
        ${gained.length ? `<div class="rz-traits">${gained.map(t => `<span class="rz-trait">✨ ${esc(traitOf(t).name)}</span>`).join('')}</div>` : ''}</section>
      <section class="card flush"><div class="card-h pad">🏆 최종 순위</div>
        <table class="rz-table">${st.map(x => `<tr class="${x.id === ME ? 'me' : ''}"><td>${x.rank}</td><td>${badge(x.id)} ${getTeam(x.id).short}</td><td>${x.w}승 ${x.l}패${x.d ? ' ' + x.d + '무' : ''}</td></tr>`).join('')}</table></section>
      <p class="hint center">다음 시즌에도 능력치·특성은 그대로예요. 비시즌 동안 쉬어서 피로는 0, 컨디션은 보통으로 돌아가요.</p>
      <p class="hint center">${s.year + 1} 시즌 정규시즌 경기 수</p>${gamesSeg(nextGames, 'games')}
      <div class="actions"><button class="primary big" data-act="next">🚀 ${s.year + 1} 시즌 시작</button><button class="ghost" data-act="back">슬롯 목록</button></div>`, 'result');
    act('games', b => seasonEndView(i, +b.dataset.g));
    act('cere', () => ceremonyView(i));
    act('next', () => { data = { ...data, slots: data.slots.map((q, j) => (j === i ? nextSeason(q, { games: nextGames }) : q)) }; persist(); hubView(i); });
    act('back', slotsView);
  }

  // ── 기록 ──
  function recordsView(i) {
    const s = data.slots[i], p = slotPlayer(s);
    const feat = s.progress.feat, train = s.progress.train;
    const howFar = t => {
      const f = RAISE.feat[t], d = DRILLS.find(x => x.trait === t);
      return [d && `특훈 ${Math.min(train[d.id] || 0, RAISE.drillNeed)}/${RAISE.drillNeed}`, f && `활약 ${Math.min(feat[f[0]] || 0, f[1])}/${f[1]}`].filter(Boolean).join(' · ');
    };
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>📜 ${esc(p.name)} 기록</h2></header>
      ${seasonStatsCard(s)}
      ${boardCard(s, boardKey[s.kind])}
      ${s.history.slice().reverse().map(h => `<section class="card slim"><div class="card-h">${h.champion ? '🏆 ' : ''}${h.year} 시즌 · 팀 ${h.rank}위 (${h.w}승 ${h.l}패)${h.post ? `<span class="pill">${esc(h.post)}</span>` : ''}${h.mvp ? '<span class="pill gold">🏅 KS MVP</span>' : ''}</div><p class="rz-line">${seasonLine(s, h.line)}</p>
        ${h.salary != null ? `<p class="hint">💰 연봉 ${won(h.salary)}${h.bonus ? ` · 🏆 우승 보너스 ${won(h.bonus)}` : ''} → 다음 해 ${won(h.nextSalary)}</p>` : ''}
        ${(h.traitsNew || []).length ? `<p class="hint">✨ ${h.traitsNew.map(t => esc(traitOf(t).name)).join(', ')}</p>` : ''}</section>`).join('')}
      <section class="card"><div class="card-h">🧮 통산</div><p class="rz-line">${seasonLine(s, s.total)}</p>${moneyHtml(s)}</section>
      <section class="card"><div class="card-h">✨ 특성</div>
        ${TRAITS.filter(t => t.kind === s.kind).map(t => `<div class="ach ${s.traits.includes(t.id) ? 'on' : ''}"><i>${s.traits.includes(t.id) ? '✨' : '🔒'}</i><div><b>${esc(t.name)}</b><small>${esc(t.desc)}${s.traits.includes(t.id) ? '' : ` · ${howFar(t.id)}`}</small></div></div>`).join('')}
      </section>`);
    act('back', () => hubView(i));
    bindBoard(s);
  }

  slotsView();
}
