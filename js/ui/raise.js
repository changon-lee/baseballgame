// 육성모드 화면: 슬롯 3개 → 선수 고르기 → 육성 허브(선수 카드·오늘의 선택·다음 경기) → 경기(showGame raise 옵션) → 결과 → 시즌 종료 → 기록
// 규칙은 core/raise.js · core/raisematch.js · core/perks.js. 저장은 'baseball.raise.v1'만 쓴다
import { getTeam, USER_TEAM_ID } from '../data/rosters.js';
import { standings } from '../core/season.js';
import { avg, era, ip } from '../core/growth.js';
import { createRng } from '../core/rng.js';
import { TRAITS } from '../core/perks.js';
import { PRACTICE } from '../core/practice.js';
import { defaultLineup } from '../core/team.js';
import { RAISE, DRILLS, newSlot, loadRaise, saveRaise, slotPlayer, raiseTeam, canChoose, choose, dayInfo, applyDay, seasonOver, nextSeason, seasonGains, prelude } from '../core/raise.js';
import { seasonCard } from '../core/raisestats.js';
import { face, badge } from './hub.js';

const ME = USER_TEAM_ID;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STAT_KO = { power: '파워', contact: '컨택', eye: '선구안', control: '제구', stamina: '체력', velo: '구속' };
const STAT_ICON = { power: '💪', contact: '⚾', eye: '👀', control: '🎯', stamina: '💚', velo: '🔥' };
const STATS = { bat: ['power', 'contact', 'eye'], pitch: ['velo', 'control', 'stamina'] };
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
  const extra = [b.hr && `${b.hr}홈런`, b.rbi && `${b.rbi}타점`, b.bb && `볼넷 ${b.bb}`, b.so && `삼진 ${b.so}`].filter(Boolean).join(' · ');
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
  if (slot.kind === 'bat') return st.bat ? `타율 ${avg(st.bat)} · ${st.bat.hr}홈런 · ${st.bat.rbi}타점 · OPS ${ops(st.bat)}` : '아직 기록이 없어요';
  if (!st.pit) return '아직 기록이 없어요';
  return `평균자책 ${era(st.pit)} · ${ip(st.pit)}이닝 · ${st.w || 0}승 ${st.l || 0}패${slot.role === 'CL' ? ` ${st.sv || 0}세이브` : ''} · 탈삼진 ${st.pit.so}`;
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
        <span class="k">${esc(r.name)}${tip(r.info, r.name)}</span><b>${esc(r.text)}</b><em>${r.pct ? `상위 ${r.pct}%` : '&nbsp;'}</em></div>`).join('')}</div>
      <p class="hint">${esc(c.extra)}</p>
      ${c.qualified ? '' : `<p class="hint">규정(${c.need})을 채우면 리그에서 상위 몇 %인지 나와요</p>`}
    </section>`;
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

  // ── 슬롯 목록 ──
  function slotsView() {
    const broken = !brokenShown && data.broken.length ? `<p class="note">저장된 육성 슬롯 ${data.broken.map(i => i + 1).join(', ')}번이 손상돼서 비웠어요.</p>` : '';
    brokenShown = true;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>🌱 육성모드</h2></header>
      <p class="hint">삼성 선수 한 명을 골라 끝없이 키워요. 경기와 경기 사이에 훈련이나 휴식을 하나 고르고, 경기에서는 내 선수 장면만 직접 해요.</p>${broken}
      ${data.slots.map((s, i) => s ? `<section class="card rz-slot">
        <div class="rz-who">${face(slotPlayer(s), s.kind === 'bat' ? 'b' : 'p')}<div><b>${esc(slotPlayer(s).name)}</b><small>${roleOf(s)} · ${dayInfo(s).label}</small></div>${condHtml(s.condition)}</div>
        <p class="hint">${seasonLine(s, s.stats)}</p>
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
  function pickView(i, kind) {
    const t = getTeam(ME), list = kind === 'bat' ? t.batters : t.pitchers;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>${i + 1}번 슬롯 · 선수 고르기</h2></header>
      <div class="seg"><button data-act="kind" data-k="bat" class="${kind === 'bat' ? 'on' : ''}">🏏 타자</button><button data-act="kind" data-k="pitch" class="${kind === 'pitch' ? 'on' : ''}">⚾ 투수</button></div>
      <p class="hint">${kind === 'bat' ? '타자는 내 타석만 직접 쳐요.' : '선발은 4경기마다 선발로 나가 강판될 때까지 던지고, 마무리는 점수 차가 3점 이하인 9회에 나와요.'} 능력치는 원래 명단 값에서 시작해요.</p>
      <div class="rz-pick">${list.map(p => `<button class="chip rz-pp" data-act="pick" data-id="${p.id}">
        <span class="rz-who">${face(p, kind === 'bat' ? 'b' : 'p')}<span><b>${esc(p.name)}</b><small>${kind === 'bat' ? `${p.pos} · ${p.bats === 'L' ? '좌타' : p.bats === 'S' ? '양타' : '우타'}` : `${ROLE[p.role === 'SP' ? 'SP' : 'CL']} · ${p.throws === 'L' ? '좌투' : '우투'}`}</small></span></span>
        ${STATS[kind].map(k => `<span class="ms"><span>${STAT_ICON[k]}</span><i><u style="width:${barPct(k, p[k])}%"></u></i><em>${p[k]}</em></span>`).join('')}
      </button>`).join('')}</div>`);
    act('back', slotsView);
    act('kind', b => pickView(i, b.dataset.k));
    act('pick', b => {
      data = { ...data, slots: data.slots.map((s, j) => (j === i ? newSlot(b.dataset.id) : s)) }; persist(); hubView(i);
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
        return `<button class="chip ${x.drill ? 'drill' : ''}" data-act="choose" data-id="${x.id}" ${c.ok ? '' : 'disabled'}><b>${x.name}</b><small>${sub}</small><small class="${c.ok ? '' : 'tired'}">${c.ok ? `피로 +${x.cost} · ${s.kind === 'bat' ? `타격 ${PRACTICE.goal.bat}번` : `투구 ${PRACTICE.goal.pitch}구`}` : '너무 지쳤어요'}</small></button>`;
      }).join('')}
        <button class="chip rest" data-act="choose" data-id="rest"><b>😴 휴식</b><small>피로 ${RAISE.rest} · 컨디션이 보통 쪽으로</small></button></div>
      <p class="hint">훈련을 고르면 연습장에서 직접 ${s.kind === 'bat' ? '쳐요' : '던져요'}. 잘할수록 많이 오르고, 중간에 나가면 훈련은 없던 일이 돼요.</p>`;
    screen(`<header class="bar"><button class="ghost small" data-act="back">←</button><h2>🌱 육성모드</h2><button class="ghost small rz-rec" data-act="records">📜 기록</button></header>
      <section class="card rz-card">
        <div class="rz-who">${face(p, s.kind === 'bat' ? 'b' : 'p', 'lg')}<div><b class="rz-name">${esc(p.name)}</b><small>삼성 · ${roleOf(s)} · ${s.year} 시즌</small></div>${condHtml(s.condition)}</div>
        <div class="rz-stats">${STATS[s.kind].map(k => `<span class="ms"><span>${STAT_ICON[k]} ${STAT_KO[k]}</span><i><u style="width:${barPct(k, p[k])}%"></u></i><em>${p[k]}${k === 'velo' ? 'km' : ''}</em></span>`).join('')}</div>
        <div class="rz-fat"><span>😮‍💨 피로</span><i><u class="${s.fatigue >= RAISE.tiredAt ? 'hi' : ''}" style="width:${s.fatigue}%"></u></i><em>${Math.round(s.fatigue)}</em></div>
        ${s.traits.length ? `<div class="rz-traits">${s.traits.map(t => `<span class="rz-trait" title="${esc(traitOf(t).desc)}">✨ ${esc(traitOf(t).name)}</span>`).join('')}</div>` : '<p class="hint">특성은 특훈을 4번 하거나 경기에서 활약하면 생겨요</p>'}
        <p class="hint">${seasonLine(s, s.stats)}</p>
      </section>
      <section class="card"><div class="card-h">🗓️ 오늘의 선택</div>${choiceHtml}</section>
      <section class="card next">
        <div class="card-h">⚾ ${d.label}<span class="pill">${st.w}승 ${st.l}패${st.d ? ' ' + st.d + '무' : ''} · ${st.rank}위</span></div>
        <div class="vs-row"><div class="side" style="--c:${opp.colors.main}">${badge(opp.id, 'lg')}<b>${opp.short}</b><small>✈️ 원정</small></div><span class="vs">VS</span><div class="side" style="--c:${getTeam(ME).colors.main}">${badge(ME, 'lg')}<b>삼성</b><small>🏠 홈</small></div></div>
        ${s.role === 'SP' ? `<p class="hint center">${d.myStart ? '🔥 오늘 선발 등판이에요' : `오늘은 등판이 없어요 · ${d.nextStartIn == null ? '이번 시즌 남은 선발이 없어요' : `다음 선발까지 ${d.nextStartIn}경기`}`}</p>` : ''}
        ${!s.chosen ? '<p class="hint center">선택 없이 경기에 나가면 피로가 조금만 풀려요</p>' : ''}
        <div class="actions">${d.needsScreen ? '<button class="primary big" data-act="play">▶ 경기 시작</button>' : '<button class="primary big" data-act="play">⏩ 경기 진행 (등판 없음)</button>'}</div>
      </section>`);
    act('back', () => { flash = null; slotsView(); });
    act('records', () => recordsView(i));
    act('choose', b => {
      const id = b.dataset.id;
      if (id !== 'rest') return training(i, id);
      const r = choose(data.slots[i], 'rest');
      data = { ...data, slots: data.slots.map((q, j) => (j === i ? r.slot : q)) }; persist();
      flash = `휴식 · 피로 ${Math.round(r.slot.fatigue)}`;
      hubView(i);
    });
    act('play', () => play(i));
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
      practice: { kind, playerId: s.playerId, stat: x.stat, goal: PRACTICE.goal[kind] },
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
    const line = s.kind === 'bat' ? batLine(rep.line.bat) : pitLine(rep.line.pit, rep.dec);
    const why = NOTE[note] || (!rep.appeared ? (s.kind === 'bat' ? '오늘은 타석에 서지 못했어요' : '오늘은 등판이 없었어요') : '');
    screen(`<div class="eyebrow center">${esc(p.name)} · ${s.year} 시즌 ${s.season.round}/${s.season.schedule.length}경기</div>
      <div class="re">${res === '승리' ? '🎉' : res === '패배' ? '😢' : '⚾'}</div>
      <h1 class="res ${res === '승리' ? 'win' : res === '패배' ? 'lose' : ''}">${res}</h1>
      ${g ? `<div class="scoreline">${badge(g.away, 'lg')}<b>${g.as}</b><i>:</i><b>${g.hs}</b>${badge(g.home, 'lg')}</div>` : ''}
      <p class="hint center">팀 ${rep.team.w}승 ${rep.team.l}패${rep.team.d ? ' ' + rep.team.d + '무' : ''} · ${rep.team.rank}위</p>
      ${rep.traitsNew.length ? `<section class="card rz-newtrait">${rep.traitsNew.map(t => `<div class="card-h">✨ 새 특성 · ${esc(traitOf(t).name)}</div><p class="hint">${esc(traitOf(t).desc)}</p>`).join('')}</section>` : ''}
      <section class="card"><div class="card-h">📋 오늘 ${esc(p.name)}</div>
        <p class="rz-line">${line || '-'}</p>${why ? `<p class="hint">${why}</p>` : ''}
        <p class="hint">컨디션 ${condHtml(rep.condFrom)} → ${condHtml(rep.condTo)} · 피로 ${Math.round(s.fatigue)}</p>
        ${rep.ups.length ? `<div class="ups">${rep.ups.map(u => `<div><b>${STAT_ICON[u.stat]} ${STAT_KO[u.stat]}</b><span><em>+${u.n}${u.stat === 'velo' ? 'km' : ''}</em></span></div>`).join('')}</div>` : ''}
      </section>
      ${seasonStatsCard(s)}
      <div class="actions"><button class="primary big" data-act="ok">${rep.seasonOver ? '시즌 결산 보기' : '확인'}</button></div>`, 'result');
    act('ok', () => hubView(i));
  }

  // ── 시즌 종료 ──
  function seasonEndView(i) {
    const s = data.slots[i], p = slotPlayer(s), st = standings(s.season);
    const before = new Set(s.history.flatMap(h => h.traitsNew || []));
    const gained = s.traits.filter(t => !before.has(t)), ups = seasonGains(s);
    screen(`<div class="eyebrow center">${s.year} 시즌 종료</div>
      <div class="re">🏁</div><h1 class="res">${esc(p.name)}</h1>
      <section class="card"><div class="card-h">📊 시즌 성적</div><p class="rz-line">${seasonLine(s, s.stats)}</p>
        ${ups.length ? `<div class="ups">${ups.map(u => `<div><b>${STAT_ICON[u.stat]} ${STAT_KO[u.stat]}</b><span><em>+${u.n}${u.stat === 'velo' ? 'km' : ''}</em></span></div>`).join('')}</div>` : '<p class="hint">이번 시즌에 오른 능력치는 없어요</p>'}
        ${gained.length ? `<div class="rz-traits">${gained.map(t => `<span class="rz-trait">✨ ${esc(traitOf(t).name)}</span>`).join('')}</div>` : ''}</section>
      <section class="card flush"><div class="card-h pad">🏆 최종 순위</div>
        <table class="rz-table">${st.map(x => `<tr class="${x.id === ME ? 'me' : ''}"><td>${x.rank}</td><td>${badge(x.id)} ${getTeam(x.id).short}</td><td>${x.w}승 ${x.l}패${x.d ? ' ' + x.d + '무' : ''}</td></tr>`).join('')}</table></section>
      <p class="hint center">다음 시즌에도 능력치·특성은 그대로예요. 비시즌 동안 쉬어서 피로는 0, 컨디션은 보통으로 돌아가요.</p>
      <div class="actions"><button class="primary big" data-act="next">🚀 ${s.year + 1} 시즌 시작</button><button class="ghost" data-act="back">슬롯 목록</button></div>`, 'result');
    act('next', () => { data = { ...data, slots: data.slots.map((q, j) => (j === i ? nextSeason(q) : q)) }; persist(); hubView(i); });
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
      <section class="card"><div class="card-h">${s.year} 시즌 (진행 중)</div><p class="rz-line">${seasonLine(s, s.stats)}</p></section>
      ${s.history.slice().reverse().map(h => `<section class="card slim"><div class="card-h">${h.year} 시즌 · 팀 ${h.rank}위 (${h.w}승 ${h.l}패)</div><p class="rz-line">${seasonLine(s, h.line)}</p>
        ${(h.traitsNew || []).length ? `<p class="hint">✨ ${h.traitsNew.map(t => esc(traitOf(t).name)).join(', ')}</p>` : ''}</section>`).join('')}
      <section class="card"><div class="card-h">🧮 통산</div><p class="rz-line">${seasonLine(s, s.total)}</p></section>
      <section class="card"><div class="card-h">✨ 특성</div>
        ${TRAITS.filter(t => t.kind === s.kind).map(t => `<div class="ach ${s.traits.includes(t.id) ? 'on' : ''}"><i>${s.traits.includes(t.id) ? '✨' : '🔒'}</i><div><b>${esc(t.name)}</b><small>${esc(t.desc)}${s.traits.includes(t.id) ? '' : ` · ${howFar(t.id)}`}</small></div></div>`).join('')}
      </section>`);
    act('back', () => hubView(i));
  }

  slotsView();
}
