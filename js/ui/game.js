// 경기 화면: 투구(조준 → 구종 → 게이지), 타격(타이밍 터치), 타구 화면, 투수 교체, 경기 종료
import { CONFIG } from '../config.js';
import { createRng } from '../core/rng.js';
import { PITCH_TYPES, gaugePos, sweetWidth, gaugePeriod, energy, aimFromTouch, fatigue } from '../core/pitch.js';
import { availableRelievers } from '../core/team.js';
import { createMatch, matchup, playUserPitch, cpuPitchToUser, resolveUserSwing, changePitcher, cpuMaybeChangePitcher, simulateInning, simulateRest } from '../core/match.js';
import { cpuChoosePitch, cpuSwing } from '../core/ai.js';
import { batReach } from '../core/batting.js';
import { loadPrefs, savePrefs, LEVELS, LEVEL_NAME } from './prefs.js';
import { startLoop } from './loop.js';
import { unlockAudio, playSound, vibrate, shake } from './feedback.js';
import { makeView, toS, zoneRect, ballScreen, ballRadius, pitcherAnchor, batterAnchor, setReleaseOverride, PITCH_PATH } from './art/view.js';
import { drawPitcherSprite, drawBatterSprite, drawCatcherSprite, spriteReleaseOffset, SWING_CONTACT_MS } from './art/sprites.js';
import { buildBackdrop, standsReady } from './art/stadium.js';
import { uniformFor } from './art/uniforms.js';
import { pitcherPoseAt, batterPoseAt } from './art/rig.js';
import { drawBatter, drawPitcher, drawCatcherAndUmpire, drawBall } from './art/figures.js';
import { buildPlay, toMs } from './art/playscript.js';
import { drawPlay3D } from './art/field3d.js';

const LABEL = {
  BALL: '볼', STRIKE: '스트라이크', FOUL: '파울', SINGLE: '안타!', DOUBLE: '2루타!', TRIPLE: '3루타!', HR: '홈런!!',
  SAC_FLY: '희생플라이', DOUBLE_PLAY: '병살타', INFIELD_SINGLE: '내야안타!', ERROR: '실책!', SINGLE_HOME_OUT: '안타 · 홈에서 아웃!', LINE_DP: '직선타 병살!',
};
// 같은 결과의 다른 장면
const STYLE_LABEL = { dive: '다이빙 캐치!', wall: '펜스 앞 점프 캐치!', liner: '직선타 아웃', home_safe: '안타! 홈 세이프', bloop: '텍사스 안타!', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃' };
const HITS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR', 'INFIELD_SINGLE', 'SINGLE_HOME_OUT', 'ERROR'];   // 타자에게 좋은 결과
const OUTS = ['OUT', 'SAC_FLY', 'DOUBLE_PLAY', 'LINE_DP'];
// 경기 기록에 쓰는 이름
const PA_NAME = { WALK: '볼넷', STRIKEOUT: '삼진', SINGLE: '안타', DOUBLE: '2루타', TRIPLE: '3루타', HR: '홈런', OUT: '범타 아웃', SAC_FLY: '희생플라이', DOUBLE_PLAY: '병살타', ERROR: '실책 출루' };
const PLAY_NAME = { INFIELD_SINGLE: '내야안타', SINGLE_HOME_OUT: '안타 (2루 주자 홈에서 아웃)', LINE_DP: '직선타 병살' };
const STYLE_NAME = { dive: '다이빙 캐치 아웃', wall: '펜스 앞 호수비 아웃', liner: '직선타 아웃', home_safe: '안타 (홈 승부 세이프)', fumble: '실책 출루 (포구 실책)', throw: '실책 출루 (송구 실책)', bloop: '텍사스 안타', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃' };
const paName = l => PLAY_NAME[l.play] || STYLE_NAME[l.style] || (l.event === 'OUT' ? (l.fly ? '뜬공 아웃' : '땅볼 아웃') : PA_NAME[l.event] || l.event);
const PITCH_E = { BALL: '볼', STRIKE: '스트', FOUL: '파울' };
// 구종 칩 색(빠른 공은 따뜻한 색, 떨어지는 공은 차가운 색)
const PITCH_COLORS = { FB: '#ff6b5e', SI: '#ffa94d', CT: '#ffd43b', SL: '#69db7c', CU: '#4dabf7', CH: '#b197fc', FO: '#f783ac' };
const basesText = b => { const on = [1, 2, 3].filter((n, i) => b[i]); return on.length === 3 ? '만루' : on.length ? on.join('·') + '루' : '주자 없음'; };

// onExit(result): 경기를 끝까지 하면 { home, away, log, starterId }, 중간에 나가면 null
export function showGame(root, { userTeam, cpuTeam, lineup, innings, cpuStarterId, title }, onExit) {
  const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  setReleaseOverride(spriteReleaseOffset);
  let match = createMatch({ userTeam, cpuTeam, userLineup: lineup, innings, rng, cpuStarterId });
  const uni = { home: uniformFor(userTeam, 'home'), away: uniformFor(cpuTeam, 'away') };

  root.innerHTML = `
  <div class="game">
    <div class="board">
      <div class="bug">
        <div class="tms">
          <div class="tm" style="--c:${cpuTeam.colors.main}"><i></i><b>${cpuTeam.short}</b><span class="r ra">0</span></div>
          <div class="tm" style="--c:${userTeam.colors.main}"><i></i><b>${userTeam.short}</b><span class="r rh">0</span></div>
        </div>
        <div class="st"><div class="inn"></div><div class="bases"><i></i><i></i><i></i></div></div>
        <div class="bso"></div>
        <button class="more" aria-label="진행 메뉴"><svg viewBox="0 0 16 16"><path d="M1 3l7 5-7 5zM8 3l7 5-7 5z"/></svg></button>
        <button class="exit" aria-label="나가기">✕</button>
      </div>
      <div class="sub"><span class="mu"></span>${title ? `<span class="ttl">${title}</span>` : ''}</div>
    </div>
    <div class="stage"><canvas></canvas><div class="pitch-pick"></div><div class="overlay hidden"></div></div>
    <div class="controls"></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const cv = $('canvas'), stage = $('.stage'), controls = $('.controls'), overlay = $('.overlay'), picker = $('.pitch-pick');
  const ctx = cv.getContext('2d');

  let W = 0, H = 0, DPR = 1, V = null;
  const bg = {};
  let mode = 'msg';              // aim | pick | gauge | flight | bwait | bflight | play | msg | bullpen | end
  let target = { x: 0, y: 0 }, dragging = false, pitchType = null, gaugeStart = 0, period = CONFIG.GAUGE_PERIOD_MS;
  let ball = null;              // { pitch, start, wind, arrival, result, swung, hitAt, contact }
  let pitchAt = 0, swingAt = null, play = null, msg = null, info = '';
  let timers = [];
  let auto = false;             // 자동 진행: 투구·스윙을 컴퓨터가 대신한다
  let prefs = loadPrefs();      // 궤적 안내 · 난이도
  // 내가 칠 때 배트를 댈 곳(존 좌표). 화면을 누른 채 움직이면 따라오고, 손을 떼면 그 자리로 스윙한다
  let batAim = { x: 0, y: -0.1 }, batDrag = null, batFlash = null;
  let alive = true;            // exit() 뒤에는 어떤 타이머·입력도 이 경기를 움직이지 않는다
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers = timers.filter(t => t !== id); if (alive) fn(); }, ms);
    timers.push(id); return id;
  };

  // ── 레이아웃 ──
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    for (const k in bg) delete bg[k];
    setView();
    placePicker();
  }
  const userPitching = () => matchup(match).userRole === 'pitch';
  function setView() { if (W) V = makeView(userPitching() ? 'pitcher' : 'catcher', W, H); }
  window.addEventListener('resize', resize);

  // ── 스코어보드 ──
  // 타석 결과(삼진 등)를 보여주는 동안은 끝난 타석의 타자·투수를 그대로 그린다. 다음 공을 준비할 때 넘긴다
  let hold = null;
  const shownMu = () => hold || matchup(match);

  function updateBoard() {
    const g = match.game, mu = shownMu();
    $('.ra').textContent = g.score.away; $('.rh').textContent = g.score.home;
    $('.tms').dataset.bat = g.half === 'top' ? 'away' : 'home';
    $('.inn').innerHTML = `<small>${g.half === 'top' ? '▲' : '▼'}</small>${g.inning}`;
    root.querySelectorAll('.bases i').forEach((el, i) => el.classList.toggle('on', !!g.bases[i]));
    const dots = (cls, n, max) => Array.from({ length: max }, (_, i) => `<i class="${cls}${i < n ? ' on' : ''}"></i>`).join('');
    $('.bso').innerHTML = `<div><em>B</em>${dots('b', g.balls, 3)}</div><div><em>S</em>${dots('s', g.strikes, 2)}</div><div><em>O</em>${dots('o', g.outs, 2)}</div>`;
    $('.mu').innerHTML = `<b>${mu.pitcher.name}</b> <small>${match.pitchCount[mu.pitchingSide]}구</small> <span class="vs">vs</span> <small>${g.battingIndex[mu.battingSide] + 1}번</small> <b>${mu.batter.name}</b>`;
  }
  const setControls = html => { controls.innerHTML = html; };
  function showMsg(text, color, ms, sub, then) {
    msg = { text, color, sub };
    later(() => { msg = null; if (then) then(); }, ms);
  }

  // ── 진행 ──
  function nextPlay() {
    hold = null;
    updateBoard();
    if (match.game.over) return showEnd();
    ball = null; play = null; swingAt = null; pitchAt = 0;
    setView();
    // 화면이 숨겨진 동안에는 다음 공을 준비하지 않는다(돌아오면 onVisibility가 이어서 진행)
    if (document.hidden) { interrupted = true; mode = 'msg'; return; }
    if (userPitching() && auto) {
      const before = match.pitcher.home;
      match = cpuMaybeChangePitcher(match, rng, 'home');
      mode = 'msg'; pitchType = null;
      if (match.pitcher.home !== before) { updateBoard(); return showMsg(`${userTeam.short} 투수 교체`, '#9fb3cc', 1300, matchup(match).pitcher.name, nextPlay); }
      setControls('<p><b>자동 진행 중</b> · 투수가 알아서 던져요 <small>(위 ▶▶ 버튼에서 끄기)</small></p>');
      later(autoThrow, 700 + rng() * 500);
    } else if (userPitching()) {
      mode = 'aim'; pitchType = null;
      setControls(`<p>스트라이크존 위를 <b>드래그</b>해서 포수 미트 위치를 정하세요</p>
        <div class="row"><button class="ghost" data-act="bullpen">투수 교체</button></div>`);
      controls.querySelector('[data-act=bullpen]').onclick = showBullpen;
    } else {
      const before = match.pitcher.away;
      match = cpuMaybeChangePitcher(match, rng);
      if (match.pitcher.away !== before) {
        updateBoard(); mode = 'msg';
        return showMsg(`${cpuTeam.short} 투수 교체`, '#9fb3cc', 1300, matchup(match).pitcher.name, nextPlay);
      }
      mode = 'bwait';
      pitchAt = performance.now() + CONFIG.WIND_CPU_MS + 700 + rng() * 900;
      setControls(auto ? '<p><b>자동 진행 중</b> · 타자가 알아서 쳐요 <small>(위 ▶▶ 버튼에서 끄기)</small></p>'
        : '<p>화면을 <b>누른 채 움직여</b> 배트(노란 원)를 공 길에 두고, <b>손을 떼면 스윙!</b></p>');
    }
  }

  function showBullpen() {
    const list = availableRelievers(userTeam, match.used.home, match.pitcher.home);
    mode = 'bullpen';
    setControls(`<div class="bullpen">${list.map(p => `
      <button data-p="${p.id}"><b>${p.name}</b> <span>${p.role === 'SP' ? '선발' : '불펜'} · ${p.velo}km · 제구 ${p.control} · 체력 ${p.stamina}</span></button>`).join('') || '<p>남은 투수가 없어요</p>'}
      <button class="ghost" data-act="cancel">취소</button></div>`);
    controls.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => { match = changePitcher(match, 'home', b.dataset.p); nextPlay(); }; });
    controls.querySelector('[data-act=cancel]').onclick = nextPlay;
  }

  // ── 구종 고르기: 투수 오른쪽, 제구 게이지가 나올 자리에 구종 칩을 세로로 띄운다 ──
  // 칩 = 꺾이는 방향 그림 + 이름 + 대략 구속. 고르면 칩이 빠지고 같은 자리에 게이지가 돈다
  function pitchIcon(k, throws) {
    const pp = PITCH_PATH[k] || { x: 0, y: 0 };
    const dx = (V && V.mirror ? -1 : 1) * (throws === 'L' ? -1 : 1) * pp.x;   // 공이 화면에서 휘는 쪽(ballScreen과 같게)
    const ex = 12 + Math.max(-7, Math.min(7, dx * 4)), ey = Math.min(20, 13 - pp.y * 2.6);
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5Q12 ${(ey * 0.62).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 3.6"/>`
      + `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.9" fill="#fff" stroke="currentColor" stroke-width="1.4"/></svg>`;
  }
  let pickerToken = 0;
  function showPitchButtons() {
    const p = matchup(match).pitcher;
    const again = mode === 'pick' && picker.childElementCount && !picker.classList.contains('out');
    mode = 'pick';
    setControls(`<p>오른쪽에서 구종을 고르세요 <small>(다시 드래그하면 위치 변경)</small></p>`);
    if (again) return placePicker();                    // 위치만 다시 잡은 경우: 칩은 그대로 둔다
    pickerToken++;
    picker.classList.remove('out');
    picker.innerHTML = p.pitches.map((k, i) => `<button data-k="${k}" style="--c:${PITCH_COLORS[k] || '#9fb3cc'};--i:${i}">`
      + `<i>${pitchIcon(k, p.throws)}</i><b>${PITCH_TYPES[k].name}</b><span>${Math.round(p.velo * PITCH_TYPES[k].speedMul)}</span></button>`).join('');
    placePicker();
    picker.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => {
        if (mode !== 'pick') return;
        pitchType = b.dataset.k; mode = 'gauge'; gaugeStart = performance.now();
        period = gaugePeriod(matchup(match).fatigue);
        b.classList.add('on');
        hidePicker();
        setControls(`<p><b>${PITCH_TYPES[pitchType].name}</b> · 게이지가 <b class="g">초록 구간 한가운데</b>일 때 화면을 터치!</p>`);
      };
    });
  }
  function hidePicker() {
    if (!picker.childElementCount || picker.classList.contains('out')) return;
    const tok = ++pickerToken;
    picker.classList.add('out');
    setTimeout(() => { if (tok === pickerToken) { picker.innerHTML = ''; picker.classList.remove('out'); } }, 220);
  }
  function placePicker() {
    if (!picker.childElementCount || !V) return;
    const g = gaugeSpot(), w = picker.offsetWidth, h = picker.offsetHeight;
    const x = Math.max(8, Math.min(g.cx + g.R * 0.2, W - w - 10)), y = Math.max(8, Math.min(g.cy - h / 2, H - h - 8));
    picker.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  function throwUserPitch(ts) { throwWith(gaugePos(ts - gaugeStart, period)); }
  // 자동 진행: 컴퓨터 투수처럼 구종·위치·게이지를 정해서 던진다
  function autoThrow() {
    if (!auto || mode !== 'msg' || ball || play || msg) return;      // 그사이 자동 진행을 껐거나 넘기기를 했다
    if (overlayOpen()) return later(autoThrow, 400);                // 메뉴를 보는 동안은 기다린다
    if (document.hidden) { interrupted = true; return; }
    const mu = matchup(match);
    const c = cpuChoosePitch({ pitcher: mu.pitcher, balls: match.game.balls, strikes: match.game.strikes, rng });
    target = c.target; pitchType = c.type;
    throwWith(c.gaugePos);
  }
  function throwWith(gpos) {
    const r = playUserPitch(match, { type: pitchType, target, gaugePos: gpos }, rng);
    const start = performance.now() + CONFIG.WIND_USER_MS;
    ball = { pitch: r.pitch, start, wind: CONFIG.WIND_USER_MS, arrival: start + r.pitch.travelMs, result: r };
    mode = 'flight';
    lastGauge = { pos: gpos, sweet: r.pitch.sweet, at: performance.now(), q: !r.pitch.onTarget ? 0 : r.pitch.err < r.pitch.sweet * 0.35 ? 2 : 1 };
    const grade = !r.pitch.onTarget ? '<b class="r">타이밍 실패 — 제구가 흔들렸어요</b>'
      : r.pitch.err < r.pitch.sweet * 0.35 ? '<b class="g">완벽한 타이밍!</b>' : '<b class="y">괜찮은 타이밍</b>';
    setControls(`<p>${grade}</p>`);
  }

  function throwCpuPitch() {
    const pitch = cpuPitchToUser(match, rng);
    ball = { pitch, start: pitchAt, wind: CONFIG.WIND_CPU_MS, arrival: pitchAt + pitch.travelMs, result: null, swung: false };
    // 궤적 안내는 '대략 이쯤': 타자 선구안이 좋을수록 범위가 좁고 가운데가 정확하다(화면용이라 경기 난수는 쓰지 않는다)
    // eye 30 → 반지름 0.8(존 반폭 기준, 존의 거의 절반), eye 90 → 0.42. 가운데는 실제 도착점에서 반지름의 0.4배쯤 어긋난다
    const acc = Math.max(0, Math.min(1, (matchup(match).batter.eye - 30) / 60)), R = 0.8 - 0.38 * acc;
    const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
    ball.guide = { x: pitch.plate.x + gauss() * R * 0.4, y: pitch.plate.y + gauss() * R * 0.4, r: R };
    mode = 'bflight';
    if (auto) {                  // 자동 진행: 컴퓨터 타자처럼 칠지 말지, 타이밍을 정한다
      const mu = matchup(match), b = ball;
      const sw = cpuSwing({ batter: mu.batter, pitch, balls: match.game.balls, strikes: match.game.strikes, rng });
      if (sw.swing) {
        const ts = b.arrival + sw.timingDiffMs;
        later(() => { if (auto && ball === b && mode === 'bflight') userSwing(ts); }, Math.max(0, ts - performance.now()));
      }
    }
  }

  // 내가 던진 공이 도착
  function arriveUserPitch() {
    const r = ball.result;
    if (r.swing) swingAt = ball.arrival - SWING_CONTACT_MS;
    const k = r.contact ? r.contact.kind : null;
    if (k === 'INPLAY' || k === 'FOUL') { playSound(k === 'FOUL' ? 'foul' : 'hit'); ball.hitAt = performance.now(); ball.contact = r.contact; }
    else if (k === 'MISS') { playSound('whiff'); playSound('mitt'); }
    else playSound('mitt');
    info = `${r.pitch.speedKmh}km/h ${PITCH_TYPES[r.pitch.type].name}`;
    apply(r, true);
  }

  // 내 스윙
  function userSwing(ts) {
    if (!ball || ball.swung) return;
    ball.swung = true; swingAt = performance.now() - 30;   // 손을 떼자마자 방망이가 나가 보이게
    const diff = ts - ball.arrival;
    const bat = auto ? null : { x: batAim.x, y: batAim.y, level: prefs.level };
    const r = resolveUserSwing(match, ball.pitch, diff, rng, bat);
    const k = r.contact.kind;
    if (bat) batFlash = { at: performance.now(), hit: k !== 'MISS', x: batAim.x, y: batAim.y };
    info = `${ball.pitch.speedKmh}km/h ${PITCH_TYPES[ball.pitch.type].name} · `
      + (r.contact.aimMiss ? '배트가 공 길에서 벗어났어요' : `${diff < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(diff))}ms`);
    if (k === 'MISS') { playSound('whiff'); ball.result = r; return; }   // 공은 미트까지 날아간 뒤 판정
    const q = r.contact.quality;
    playSound(r.event === 'HR' ? 'homerun' : k === 'FOUL' ? 'foul' : 'hit');
    vibrate(k === 'INPLAY' && q > 0.8 ? 70 : 35);
    shake(cv, k === 'INPLAY' ? 4 + q * 8 : 3);
    ball.hitAt = performance.now(); ball.contact = r.contact;
    apply(r, false);
  }

  function takePitch() {
    playSound('mitt');
    const r = ball.result || resolveUserSwing(match, ball.pitch, null, rng);
    if (!ball.result) info = `${ball.pitch.speedKmh}km/h ${PITCH_TYPES[ball.pitch.type].name}`;
    apply(r, false);
  }

  // 결과 반영: 인플레이면 타구 화면 → 결과, 아니면 바로 결과
  function apply(r, userPitched) {
    mode = 'msg';
    const prev = match.game;
    const finish = () => settle(prev, r, userPitched);
    if (['BALL', 'STRIKE', 'FOUL'].includes(r.event)) return finish();
    const batter = matchup(match).batter;
    play = buildPlay({ event: r.event, fly: r.fly, style: r.style, contact: r.contact, bats: batter.bats, bases: prev.bases, rng });
    play.sounds.sort((a, b) => a.t - b.t);
    play.start = performance.now() + 320; play.si = 0;
    play.then = finish;
  }

  function settle(prev, r, userPitched) {
    hold = matchup(match);
    match = r.match;
    let label = (r.style && STYLE_LABEL[r.style]) || LABEL[r.event] || (r.fly ? '뜬공 아웃' : '땅볼 아웃');
    if (r.event === 'STRIKE' && prev.strikes === 2) { label = '삼진!'; playSound('strikeout'); }
    else if (r.event === 'STRIKE' && r.contact && r.contact.kind === 'MISS') label = '헛스윙';
    if (r.event === 'BALL' && prev.balls === 3) label = '볼넷';
    const good = userPitched ? (r.event === 'STRIKE' || OUTS.includes(r.event)) : (HITS.includes(r.event) || r.event === 'BALL');
    const color = r.event === 'FOUL' ? '#ffffff' : good ? '#2ecc71' : '#e74c3c';
    const sub = (r.runs ? `${r.runs}점 득점! · ` : '') + info;
    const g = match.game;
    const halfOver = !g.over && (g.half !== prev.half || g.inning !== prev.inning);
    updateBoard();
    showMsg(label, color, r.event === 'HR' ? 2000 : 1300, sub, () => {
      if (match.game.over) return showEnd();
      if (halfOver) {
        play = null; ball = null;
        return showMsg('공수교대', '#9fb3cc', 1200, `${g.inning}회${g.half === 'top' ? '초' : '말'}`, nextPlay);
      }
      nextPlay();
    });
  }

  function showEnd() {
    mode = 'end'; $('.more').hidden = true;
    const g = match.game;
    const res = g.result === 'home' ? '승리' : g.result === 'away' ? '패배' : '무승부';
    overlay.innerHTML = `<div class="end-card ${g.result === 'home' ? 'win' : ''}">
      <div class="tag">경기 종료 · ${g.inning}회</div><h1>${res}</h1>
      <div class="final"><span>${cpuTeam.short}</span><b>${g.score.away}</b><i>:</i><b>${g.score.home}</b><span>${userTeam.short}</span></div>
      <button class="primary" data-act="menu">계속</button>
      <button class="ghost" data-act="log">경기 기록 보기</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=log]').onclick = () => showLog(match.log, '경기 기록', showEnd);
    if (g.result === 'home') { playSound('cheer'); vibrate([80, 60, 80, 60, 160]); }
    overlay.querySelector('[data-act=menu]').onclick = () => exit({
      home: g.score.home, away: g.score.away, log: match.log, starterId: lineup.starterId });
    setControls('');
  }

  function exit(result = null) {
    alive = false;
    loop.stop(); timers.forEach(clearTimeout); window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    root.removeEventListener('pointerdown', onRootDown);
    onExit(result);
  }
  // ── 진행 메뉴: 자동 진행 / 이번 이닝 넘기기 / 이번 경기 넘기기 / 경기 기록 ──
  function overlayOpen() { return !overlay.classList.contains('hidden'); }
  function closeOverlay() { overlay.classList.add('hidden'); overlay.innerHTML = ''; }
  function showMenu() {
    if (mode === 'end' || overlayOpen()) return;
    const g = match.game;
    overlay.innerHTML = `<div class="end-card menu-card">
      <div class="tag">${g.inning}회${g.half === 'top' ? '초' : '말'} · 진행 메뉴</div>
      <button class="primary" data-act="auto">${auto ? '자동 진행 끄기' : '자동 진행 켜기'}</button>
      <p class="hint">투수가 알아서 던지고, 타자가 알아서 칩니다</p>
      <div class="row2"><button class="ghost" data-act="guide">${prefs.guide ? '궤적 안내 켜짐' : '궤적 안내 꺼짐'}</button>
        <button class="ghost" data-act="level">난이도: ${LEVEL_NAME[prefs.level]}</button></div>
      <p class="hint">${{ easy: '쉬움: 배트가 크고, 공이 대략 올 길과 범위를 보여 줘요', normal: '보통: 배트가 작아요. 공이 대략 올 길과 범위를 보여 줘요(선구안이 좋을수록 정확)', hard: '어려움: 배트가 더 작고 궤적 안내가 안 보여요' }[prefs.level]}</p>
      <button class="ghost" data-act="inning">이번 이닝 넘기기</button>
      <button class="ghost" data-act="game">이번 경기 넘기기</button>
      <button class="ghost" data-act="log">경기 기록 보기</button>
      <button class="ghost" data-act="close">닫기</button></div>`;
    overlay.classList.remove('hidden');
    const on = (a, fn) => { overlay.querySelector(`[data-act=${a}]`).onclick = fn; };
    on('auto', () => {
      auto = !auto; closeOverlay();
      // 조준·구종 고르기·타석 대기 중(또는 자동 투구 대기 중)이면 바로 바뀐 방식으로 다시 시작
      if (['aim', 'pick', 'gauge', 'bwait'].includes(mode) || (mode === 'msg' && !msg && !play && !ball)) nextPlay();
    });
    on('guide', () => { prefs = { ...prefs, guide: !prefs.guide }; savePrefs(prefs); closeOverlay(); showMenu(); });
    on('level', () => { prefs = { ...prefs, level: LEVELS[(LEVELS.indexOf(prefs.level) + 1) % LEVELS.length] }; savePrefs(prefs); closeOverlay(); showMenu(); });
    on('inning', () => skip('inning'));
    on('game', () => { if (confirm('남은 경기를 모두 자동으로 진행할까요?')) skip('game'); });
    on('log', () => showLog(match.log, '경기 기록', closeOverlay));
    on('close', closeOverlay);
  }
  // 넘기기: 진행 중이던 공·타구 화면은 취소하고(아직 경기에 반영 전), 지금 상황부터 컴퓨터끼리 진행한다
  function skip(kind) {
    closeOverlay();
    timers.forEach(clearTimeout); timers = [];
    ball = null; play = null; msg = null; hold = null; swingAt = null; pitchAt = 0; mode = 'msg';
    const from = match.log.length, g0 = match.game;
    match = kind === 'inning' ? simulateInning(match, rng) : simulateRest(match, rng);
    updateBoard(); setView();
    setControls('');
    const title = kind === 'inning' ? `${g0.inning}회 결과` : '남은 경기 결과';
    showLog(match.log.slice(from), title, () => { closeOverlay(); if (match.game.over) showEnd(); else nextPlay(); });
  }
  // 경기 기록: 이닝별로, 타석마다 그때 상황(아웃·주자) → 공 하나하나(구종·구속·판정) → 결과·점수
  function showLog(entries, title, onClose) {
    const nameOf = (side, kind, id) => (match.teams[side][kind].find(p => p.id === id) || {}).name || '?';
    const rows = [];
    let cur = '';
    for (const l of entries) {
      const key = `${l.inning}회${l.half === 'top' ? '초' : '말'}`;
      const bat = l.half === 'top' ? 'away' : 'home', pit = l.half === 'top' ? 'home' : 'away';
      if (key !== cur) { cur = key; rows.push(`<h3>${key} <span>${(l.half === 'top' ? cpuTeam : userTeam).short} 공격</span></h3>`); }
      const seq = (l.pitches || []).map((q, i, a) => {
        const last = i === a.length - 1, e = PITCH_E[q.e] || '타격';
        return `<i class="${q.e === 'BALL' ? 'b' : last && !PITCH_E[q.e] ? 'x' : 's'}">${q.k ? `${PITCH_TYPES[q.k].name} ${q.v} ` : ''}${e}</i>`;
      }).join('');
      const good = HITS.includes(l.event) || l.event === 'WALK';
      rows.push(`<div class="pa">
        <div class="who"><b>${nameOf(bat, 'batters', l.batterId)}</b> <small>vs ${nameOf(pit, 'pitchers', l.pitcherId)} · ${l.outsBefore ?? 0}사 ${basesText(l.bases || [])}</small></div>
        <div class="seq">${seq}</div>
        <div class="out${good ? ' g' : ''}">${paName(l)}${l.runs ? ` · <b>${l.runs}점</b> <small>(${cpuTeam.short} ${l.score.away} : ${l.score.home} ${userTeam.short})</small>` : ''}</div>
      </div>`);
    }
    const g = match.game;
    overlay.innerHTML = `<div class="end-card log-card">
      <div class="tag">${title}</div>
      <div class="final"><span>${cpuTeam.short}</span><b>${g.score.away}</b><i>:</i><b>${g.score.home}</b><span>${userTeam.short}</span></div>
      <div class="log">${rows.join('') || '<p class="hint">아직 끝난 타석이 없어요</p>'}</div>
      <button class="primary" data-act="ok">${g.over && title !== '경기 기록' ? '경기 결과 보기' : '확인'}</button></div>`;
    overlay.classList.remove('hidden');
    const box = overlay.querySelector('.log'); box.scrollTop = box.scrollHeight;
    overlay.querySelector('[data-act=ok]').onclick = onClose;
  }
  $('.more').onclick = showMenu;

  $('.exit').onclick = () => {
    if (mode === 'end') { const b = overlay.querySelector('[data-act=menu]'); return b ? b.click() : showEnd(); }
    if (confirm('경기를 그만둘까요? (시즌 경기는 기록되지 않고 다시 할 수 있어요)')) exit();
  };

  // 화면이 가려지면 던지던 공을 취소하고 다시 던진다(순간이동 방지)
  let interrupted = false;
  function onVisibility() {
    if (document.hidden) {
      if (mode === 'flight' || mode === 'bflight' || mode === 'bwait' || mode === 'gauge') { interrupted = true; ball = null; mode = 'msg'; }
    } else if (interrupted) { interrupted = false; nextPlay(); }
    else if (mode === 'bwait') pitchAt = Math.max(pitchAt, performance.now() + CONFIG.WIND_CPU_MS + 500);
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ── 입력 ──
  const zoneTouch = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    unlockAudio();
    if (mode === 'aim' || mode === 'pick') {
      dragging = true; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      target = aimFromTouch(zoneTouch(e), zoneRect(V), CONFIG.AIM_LIFT_PX, V.mirror);
    }
  });
  cv.addEventListener('pointermove', e => { if (dragging) target = aimFromTouch(zoneTouch(e), zoneRect(V), CONFIG.AIM_LIFT_PX, V.mirror); });
  const endDrag = () => { if (dragging) { dragging = false; showPitchButtons(); } };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  function onRootDown(e) {
    if (!alive) return;
    unlockAudio();
    if (e.target.closest('button') || overlayOpen()) return;
    if (mode === 'bflight' && auto) return;
    if (mode === 'gauge') throwUserPitch(e.timeStamp);
    else if ((mode === 'bwait' || mode === 'bflight') && !auto) startBatDrag(e);
    else if (play && !play.landed && performance.now() >= play.start) {   // 타구 장면 건너뛰기: 결과가 정해지는 순간으로
      play.start = performance.now() - play.decisiveMs;
      while (play.si < play.sounds.length && play.sounds[play.si].t <= play.decisive) play.si++;
    }
  }
  root.addEventListener('pointerdown', onRootDown);
  // 배트 움직이기: 누른 곳이 존 근처면 배트가 그리로 가고, 그다음은 손가락이 움직인 만큼 따라온다(손가락이 배트를 가리지 않게
  // 화면 아래쪽 어디서 움직여도 된다). 손을 떼는 순간 스윙(공이 날아오는 중일 때만)
  const BAT_LIM = 1.45;
  const clampAim = v => Math.max(-BAT_LIM, Math.min(BAT_LIM, v));
  function startBatDrag(e) {
    if (!V || V.kind !== 'catcher') return;
    const r = cv.getBoundingClientRect(), z = zoneRect(V);
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (e.target === cv && Math.abs(px - (z.left + z.width / 2)) < z.width * 0.95 && Math.abs(py - (z.top + z.height / 2)) < z.height * 0.95) {
      const a = aimFromTouch({ x: px, y: py }, z, 0, V.mirror);
      batAim = { x: clampAim(a.x), y: clampAim(a.y) };
    }
    batDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  root.addEventListener('pointermove', e => {
    if (!batDrag || e.pointerId !== batDrag.id || !V) return;
    const dx = e.clientX - batDrag.x, dy = e.clientY - batDrag.y;
    batDrag.x = e.clientX; batDrag.y = e.clientY;
    batAim = { x: clampAim(batAim.x + dx / (V.zw / 2)), y: clampAim(batAim.y - dy / (V.zh / 2)) };
  });
  const endBatDrag = (e, swing) => {
    if (!batDrag || e.pointerId !== batDrag.id) return;
    batDrag = null;
    if (swing && alive && mode === 'bflight' && !auto && !overlayOpen()) userSwing(e.timeStamp);
  };
  root.addEventListener('pointerup', e => endBatDrag(e, true));
  root.addEventListener('pointercancel', e => endBatDrag(e, false));

  // ── 그리기 ──
  // 제구 게이지: 투수 오른쪽에 ')' 모양 반원. 아래 끝(0) ↔ 위 끝(1)을 공이 오가고, 가장 오른쪽(0.5)이 한가운데.
  // 초록 = 제구 성공 구간(sweet), 밝은 초록 = 완벽. 던진 뒤 잠깐(GAUGE_HOLD_MS) 멈춘 자리를 보여 주고 결과 색으로 반짝인다
  let lastGauge = null;
  const GAUGE_HOLD_MS = 550, ARC = 1.15;           // ARC: 위아래로 벌어진 각도(라디안, 가운데에서 한쪽으로)
  // 게이지 자리: 투수 몸 오른쪽(화면 밖으로 나가지 않게). 구종 칩도 여기 뜬다
  function gaugeSpot() {
    const pa = pitcherAnchor(V, matchup(match).pitcher.throws);
    const R = Math.min(H * 0.12, W * 0.2), lw = Math.max(10, R * 0.17);
    return { R, lw, cx: Math.min(pa.x + pa.scale * 40, W - R - lw - 8), cy: Math.min(pa.y - pa.scale * 120, H - R * Math.sin(ARC) - lw - 8) };
  }
  function drawGauge(now) {
    let pos, sw, alpha = 1, q = -1;
    if (mode === 'gauge') {
      const mu = matchup(match);
      sw = sweetWidth(mu.pitcher.control, mu.fatigue); pos = gaugePos(now - gaugeStart, period);
    } else if (lastGauge && now - lastGauge.at < GAUGE_HOLD_MS && V.kind === 'pitcher') {
      ({ pos, sweet: sw, q } = lastGauge); alpha = 1 - Math.max(0, (now - lastGauge.at) / GAUGE_HOLD_MS - 0.5) * 2;
    } else return;
    const { cx, cy, R, lw } = gaugeSpot();
    const ang = p => ARC - 2 * ARC * p;              // p = 0 아래, 1 위 (화면은 y가 아래로 커진다)
    const arc = (p0, p1, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, R, ang(p1), ang(p0)); ctx.stroke(); };
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineCap = 'round';
    arc(0, 1, 'rgba(255,255,255,.28)', lw + 5);     // 테두리
    arc(0, 1, 'rgba(8,16,30,.9)', lw + 2);           // 바탕(어두운 유리)
    arc(0, 1, 'rgba(255,99,88,.3)', lw - 2);         // 바깥: 제구 실패
    ctx.lineCap = 'butt';
    arc(0.5 - sw, 0.5 + sw, 'rgba(241,196,15,.75)', lw);   // 아깝다
    arc(0.5 - sw / 2, 0.5 + sw / 2, '#27ae60', lw);  // 성공
    arc(0.5 - sw * 0.175, 0.5 + sw * 0.175, '#a8ffcb', lw);   // 완벽
    ctx.lineCap = 'round';
    const at = p => [cx + Math.cos(ang(p)) * R, cy + Math.sin(ang(p)) * R];
    const [tx, ty] = at(0.5);                        // 한가운데 눈금
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx + lw * 0.75, ty); ctx.lineTo(tx + lw * 1.25, ty); ctx.stroke();
    if (q >= 0) {                                    // 던진 뒤: 결과 색으로 반짝
      const t = (now - lastGauge.at) / GAUGE_HOLD_MS, [bx, by] = at(pos);
      ctx.strokeStyle = ['#ff6b5e', '#2ecc71', '#ffd75e'][q]; ctx.lineWidth = 3; ctx.globalAlpha = alpha * (1 - t);
      ctx.beginPath(); ctx.arc(bx, by, lw * (0.8 + t * 1.8), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = alpha;
    } else {                                         // 움직이는 공 뒤 잔상
      for (let k = 4; k >= 1; k--) {
        const [x, y] = at(gaugePos(now - gaugeStart - k * 22, period));
        ctx.fillStyle = `rgba(255,255,255,${0.16 - k * 0.03})`; ctx.beginPath(); ctx.arc(x, y, lw * 0.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    const [bx, by] = at(pos);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
    drawBall(ctx, bx, by, lw * 0.62, q >= 0 ? 0 : now / 40);
    ctx.restore();
  }
  function drawHUD() {
    const mu = shownMu(), p = mu.pitcher, pc = match.pitchCount[mu.pitchingSide];
    const left = energy(pc, p.stamina), f = fatigue(pc, p.stamina);
    ctx.fillStyle = 'rgba(6,14,26,.62)'; ctx.fillRect(10, 10, 124, 38);
    ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e4ecf6';
    ctx.fillText(`${p.name} 체력${f > 0 ? ' · 지침' : ''}`, 16, 25);
    ctx.fillStyle = '#22344d'; ctx.fillRect(16, 33, 112, 7);
    ctx.fillStyle = f > 0.5 ? '#e74c3c' : f > 0 ? '#f1c40f' : '#2ecc71'; ctx.fillRect(16, 33, 112 * left, 7);
    const cx = W - 36, cy = 30, d = 11, bases = match.game.bases;
    ctx.fillStyle = 'rgba(6,14,26,.62)'; ctx.fillRect(cx - 25, cy - 21, 50, 36);
    [[cx + d, cy], [cx, cy - d], [cx - d, cy]].forEach(([x, y], i) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = bases[i] ? '#f1c40f' : 'rgba(255,255,255,.25)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    });
  }
  function drawMsg() {
    if (!msg) return;
    const y = V && V.kind === 'pitcher' && !play ? H * 0.2 : H * 0.14;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '900 40px system-ui,sans-serif'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(msg.text, W / 2, y); ctx.fillStyle = msg.color; ctx.fillText(msg.text, W / 2, y);
    if (msg.sub) { ctx.font = '600 15px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeText(msg.sub, W / 2, y + 28); ctx.fillStyle = '#e4ecf6'; ctx.fillText(msg.sub, W / 2, y + 28); }
    ctx.textAlign = 'left';
  }

  function frame(dt, now) {
    if (!W || !V) resize();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (mode === 'bwait' && pitchAt && overlayOpen()) pitchAt = Math.max(pitchAt, now + CONFIG.WIND_CPU_MS + 500);
    else if (mode === 'bwait' && pitchAt && now >= pitchAt) throwCpuPitch();

    if (play && now >= play.start) {
      const mu = shownMu(), ms = now - play.start;
      drawPlay3D(ctx, W, H, play, ms, { field: uni[mu.pitchingSide], bat: uni[mu.battingSide] });
      while (play.si < play.sounds.length && toMs(play.sounds[play.si].t) <= ms) playSound(play.sounds[play.si++].name);
      if (ms >= play.decisiveMs && !play.landed) {
        play.landed = true;
        if (play.event === 'HR') vibrate([60, 40, 60]);
        later(play.then, 350);
      }
      if (!play.landed) {
        ctx.font = '600 12px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText('터치하면 건너뛰기', W - 12, H - 16); ctx.textAlign = 'left';
      }
      drawMsg();
      return;
    }

    // 공 잔상: 바로 전 위치 몇 개를 옅게 → 구종마다 휘는 길이 보인다
    const drawTrail = t => {
      ctx.save(); ctx.fillStyle = '#fff';
      for (let i = 6; i >= 1; i--) {
        const tt = t - i * 16;
        if (tt < ball.start) continue;
        const q = ballScreen(V, ball.pitch, ball.start, tt);
        ctx.globalAlpha = 0.32 * (1 - i / 7);
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 - i * 0.07), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };
    if (!bg[V.kind] || bg[V.kind].ready !== standsReady(V.kind)) bg[V.kind] = buildBackdrop(V.kind, V, W, H, DPR, userTeam);
    ctx.drawImage(bg[V.kind], 0, 0, W, H);
    const mu = shownMu();
    const bp = ball && !ball.hitAt && now >= ball.start ? ballScreen(V, ball.pitch, ball.start, now) : null;
    const pp = ball ? pitcherPoseAt(now, ball.start, ball.wind) : mode === 'bwait' && pitchAt ? pitcherPoseAt(now, pitchAt, CONFIG.WIND_CPU_MS) : pitcherPoseAt(now, null, 0);
    const pa = pitcherAnchor(V, mu.pitcher.throws), ba = batterAnchor(V, mu.batter.bats === 'S' ? (mu.pitcher.throws === 'L' ? 'R' : 'L') : mu.batter.bats);
    const bpose = batterPoseAt(now, { swingAt, pitchStart: ball ? ball.start : null, travelMs: ball ? ball.pitch.travelMs : 1 });
    const releaseAt = ball ? ball.start : mode === 'bwait' && pitchAt ? pitchAt : null;
    const pitcherArgs = { ...pa, pose: pp.pose, uni: uni[mu.pitchingSide], holdBall: pp.holdBall, player: mu.pitcher,
      throws: mu.pitcher.throws, now, releaseAt, windMs: ball ? ball.wind : CONFIG.WIND_CPU_MS };
    // 상대 타자가 칠 공이면 공이 닿기 직전부터 스윙 동작을 시작한다
    const cpuSwingAt = ball && ball.result && ball.result.swing && !ball.hitAt ? ball.arrival - SWING_CONTACT_MS : null;
    const batterArgs = { ...ba, pose: bpose, uni: uni[mu.battingSide], now, swingAt: swingAt ?? cpuSwingAt,
      pitchStart: ball ? ball.start : null, travelMs: ball ? ball.pitch.travelMs : 1, front: V.kind === 'pitcher' };
    const drawP = () => drawPitcherSprite(ctx, pitcherArgs) || drawPitcher(ctx, pitcherArgs);
    const drawB = () => drawBatterSprite(ctx, batterArgs) || drawBatter(ctx, batterArgs);

    if (V.kind === 'pitcher') {
      const aiming = mode === 'aim' || mode === 'pick' || mode === 'gauge' || (ball && !ball.hitAt);
      if (!drawCatcherSprite(ctx, V, aiming ? target : null, now)) drawCatcherAndUmpire(ctx, V, aiming ? target : null, uni.home);
      drawZone(0.7);
      drawB();
      if (bp && bp.prog <= 1.02) { drawTrail(now); drawBall(ctx, bp.x, bp.y, bp.r, bp.spin); }
      drawP();
    } else {
      drawP();
      drawZone(0.32);
      drawGuide(now);
      if (bp && bp.prog <= 1.02) { drawTrail(now); drawBall(ctx, bp.x, bp.y, bp.r, bp.spin); }
      drawB();
      drawBat(now, mu.batter);
    }
    drawHUD();
    drawGauge(now);
    if (mode !== 'pick') hidePicker();              // 넘기기·자동 진행 등으로 고르기가 끝났으면 칩을 걷는다

    if (ball && ball.hitAt) {                     // 맞은 직후 짧게 튀어나가는 공
      const t = (now - ball.hitAt) / 600;
      if (t < 1) {
        const [px, py] = toS(V, ball.pitch.plate.x, ball.pitch.plate.y);
        const c = ball.contact, dir = (V.mirror ? 1 : -1) * c.pull * 0.8 + (c.kind === 'FOUL' ? 1.2 : 0);
        const x = px + dir * W * 0.5 * t;
        const y = V.kind === 'pitcher' ? py + H * 0.6 * t - H * 0.9 * t * (1 - t) : py - H * 0.7 * t * (0.6 + c.quality * 0.6);
        const r = V.kind === 'pitcher' ? ballRadius(V) * (1 + t * 3) : Math.max(2, ballRadius(V) * (1 - t * 0.85));
        drawBall(ctx, x, y, r, now / 30);
      }
    } else if (bp) {
      if (mode === 'flight' && bp.prog >= 1) arriveUserPitch();
      else if (mode === 'bflight' && now > ball.arrival + 220) { mode = 'msg'; takePitch(); }
      if (bp.prog >= 1 && mode === 'msg') {
        const [px, py] = toS(V, ball.pitch.plate.x, ball.pitch.plate.y);
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(px, py, ballRadius(V), 0, Math.PI * 2); ctx.stroke();
      }
    }
    drawMsg();
  }
  // 궤적 안내: 공이 손을 떠나면 대략의 길(점점 커지는 점)과 '이쯤 올 것 같다'는 범위(점선 원)를 보여 준다
  // 범위 크기는 타자 선구안 따라. 끄거나 어려움이면 안 보인다
  function drawGuide(now) {
    if (!ball || !ball.guide || ball.hitAt || auto || !prefs.guide || prefs.level === 'hard' || mode !== 'bflight' || now < ball.start) return;
    const a = Math.min(1, (now - ball.start) / 220) * (now > ball.arrival ? Math.max(0, 1 - (now - ball.arrival) / 150) : 1);
    if (a <= 0) return;
    const [cx, cy] = toS(V, ball.guide.x, ball.guide.y), rx = ball.guide.r * V.zw / 2, ry = ball.guide.r * V.zh / 2;
    // 대략의 길: 손에서 범위 가운데로 가는 점들. 멀수록(타자 쪽일수록) 점이 커지고 흐려서 '대충 이쪽'만 알려 준다
    const p = { ...ball.pitch, plate: ball.guide }, T = ball.pitch.travelMs;
    ctx.save(); ctx.globalAlpha = a;
    for (let k = 0.08; k <= 0.93; k += 0.07) {
      const q = ballScreen(V, p, ball.start, ball.start + T * k);
      ctx.fillStyle = `rgba(150,230,255,${0.5 - k * 0.32})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(2, q.r * 0.5 + rx * 0.5 * k * k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(cx, cy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(120,220,255,.34)'); g.addColorStop(0.6, 'rgba(120,220,255,.16)'); g.addColorStop(1, 'rgba(120,220,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(170,235,255,.95)'; ctx.lineWidth = 2.2 * rx / ry; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(0, 0, rx * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // 배트 표시: 노란 타원 = 이 안으로 공이 오면 맞는다(공 반지름 포함). 가운데 막대 = 배트, 안쪽 작은 타원 = 정타
  function drawBat(now, batter) {
    const flash = batFlash && now - batFlash.at < 450 ? batFlash : null;
    if (auto || (!flash && mode !== 'bwait' && mode !== 'bflight')) return;
    const { rx, ry } = batReach(batter.contact, prefs.level);
    const at = flash || batAim;
    const [cx, cy] = toS(V, at.x, at.y), RX = rx * V.zw / 2, RY = ry * V.zh / 2;
    const col = flash ? (flash.hit ? '46,204,113' : '255,107,94') : '255,214,64';
    const a = flash ? 1 - (now - flash.at) / 450 : batDrag ? 1 : 0.8;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = `rgba(${col},.12)`; ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},.45)`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, RX * 0.4, RY * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineCap = 'round';                    // 배트(가로 막대)
    ctx.lineWidth = Math.max(4, RY * 0.16); ctx.beginPath(); ctx.moveTo(cx - RX * 0.62, cy); ctx.lineTo(cx + RX * 0.62, cy); ctx.stroke();
    ctx.restore();
  }
  function drawZone(alpha) {
    const [x0, y0] = toS(V, V.mirror ? 1 : -1, 1);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, V.zw, V.zh);
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x0 + V.zw * i / 3, y0); ctx.lineTo(x0 + V.zw * i / 3, y0 + V.zh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y0 + V.zh * i / 3); ctx.lineTo(x0 + V.zw, y0 + V.zh * i / 3); ctx.stroke();
    }
  }

  window.__game = () => ({ mode, dragging, V: !!V, W, H, target, ball: !!ball, ballStart: ball ? ball.start : null, arrival: ball ? ball.arrival : null, swung: !!(ball && ball.swung), pitchAt, play: play && play.start ? { ms: Math.round(performance.now() - play.start), event: play.event } : null });
  const loop = startLoop(frame);
  resize();
  updateBoard();
  showMsg('플레이볼!', '#f1c40f', 1100, '1회초', nextPlay);
  return { exit };
}
