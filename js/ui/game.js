// 경기 화면: 투구(조준 → 구종 → 게이지), 타격(타이밍 터치), 타구 화면, 투수 교체, 경기 종료
import { CONFIG } from '../config.js';
import { createRng } from '../core/rng.js';
import { PITCH_TYPES, gaugePos, gaugeError, sweetWidth, gaugePeriod, energy, aimFromTouch, fatigue, ZONE_K } from '../core/pitch.js';
import { availableRelievers } from '../core/team.js';
import { createMatch, matchup, playUserPitch, cpuPitchToUser, resolveUserSwing, changePitcher, cpuMaybeChangePitcher, simulateHalf, simulateInning, lastPitch, simulateRest, applyDecision } from '../core/match.js';
import { cpuChoosePitch, cpuSwing } from '../core/ai.js';
import { pitchPts, swingPts } from '../core/practice.js';
import { createCutins, cutinFor, CUT_MS, HR_NAME } from './cutin.js';
import { decoratePractice, practiceArtSettled } from './art/practice.js';
import { batReach, graceMs } from '../core/batting.js';
import { BUNT } from '../core/bunt.js';
import { stealRunners } from '../core/rules.js';
import { loadPrefs, savePrefs, LEVELS, LEVEL_NAME } from './prefs.js';
import { volRow, bindVol } from './volume.js';
import { startLoop } from './loop.js';
import { unlockAudio, playSound, vibrate, shake, preloadAudio, setAudioOptions, setAmbience, previewSound } from './feedback.js';
import { makeView, toS, zoneRect, ballScreen, ballRadius, pitcherAnchor, batterAnchor, setReleaseOverride, PITCH_PATH } from './art/view.js';
import { drawPitcherSprite, drawBatterSprite, drawCatcherSprite, spriteReleaseOffset, SWING_CONTACT_MS, loadSprites } from './art/sprites.js';
import { buildBackdrop, standsReady, timeOfDay, setTimeOfDay, preloadEvening } from './art/stadium.js';
import { uniformFor } from './art/uniforms.js';
import { pitcherPoseAt, batterPoseAt } from './art/rig.js';
import { drawBatter, drawPitcher, drawCatcherAndUmpire, drawBall } from './art/figures.js';
import { buildPlay, practicePlay, toMs } from './art/playscript.js';
import { drawPlay3D } from './art/field3d.js';

const LABEL = {
  BALL: '볼', HBP: '몸에 맞는 공!', WILD: '폭투! 공이 빠졌다', STRIKE: '스트라이크', FOUL: '파울', SINGLE: '안타!', DOUBLE: '2루타!', TRIPLE: '3루타!', HR: '홈런!!',
  SAC_FLY: '희생플라이', DOUBLE_PLAY: '병살타', INFIELD_SINGLE: '내야안타!', ERROR: '실책!', SINGLE_HOME_OUT: '안타 · 홈에서 아웃!', LINE_DP: '직선타 병살!',
  SAC_BUNT: '희생번트 성공', BUNT_SINGLE: '번트 안타!', BUNT_FC: '번트 · 앞 주자 아웃', BUNT_FOUL: '번트 파울',
};
// 같은 결과의 다른 장면
const STYLE_LABEL = { bunt: '번트 아웃', dive: '다이빙 캐치!', wall: '펜스 앞 점프 캐치!', liner: '직선타 아웃', home_safe: '안타! 홈 세이프', bloop: '텍사스 안타!', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃' };
const HITS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR', 'INFIELD_SINGLE', 'SINGLE_HOME_OUT', 'ERROR', 'BUNT_SINGLE'];   // 타자에게 좋은 결과
const FREE = ['BALL', 'HBP', 'WILD'];   // 타자에게 좋은 '안 친' 결과
const OUTS = ['OUT', 'SAC_FLY', 'DOUBLE_PLAY', 'LINE_DP', 'SAC_BUNT', 'BUNT_FC'];
// 경기 기록에 쓰는 이름
const PA_NAME = { WALK: '볼넷', HBP: '몸에 맞는 공', STRIKEOUT: '삼진', SINGLE: '안타', DOUBLE: '2루타', TRIPLE: '3루타', HR: '홈런', OUT: '범타 아웃', SAC_FLY: '희생플라이', SAC_BUNT: '희생번트', DOUBLE_PLAY: '병살타', ERROR: '실책 출루' };
const PLAY_NAME = { BUNT_SINGLE: '번트 안타', BUNT_FC: '번트 (야수 선택)', INFIELD_SINGLE: '내야안타', SINGLE_HOME_OUT: '안타 (2루 주자 홈에서 아웃)', LINE_DP: '직선타 병살' };
const STYLE_NAME = { bunt: '번트 아웃', dive: '다이빙 캐치 아웃', wall: '펜스 앞 호수비 아웃', liner: '직선타 아웃', home_safe: '안타 (홈 승부 세이프)', fumble: '실책 출루 (포구 실책)', throw: '실책 출루 (송구 실책)', bloop: '텍사스 안타', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃' };
const paName = l => PLAY_NAME[l.play] || STYLE_NAME[l.style] || (l.event === 'OUT' ? (l.fly ? '뜬공 아웃' : '땅볼 아웃') : PA_NAME[l.event] || l.event);
const PITCH_E = { BALL: '볼', HBP: '사구', WILD: '폭투', STRIKE: '스트', FOUL: '파울', BUNT_FOUL: '번트파울' };
// 구종 칩 색(빠른 공은 따뜻한 색, 떨어지는 공은 차가운 색)
const PITCH_COLORS = { FB: '#ff6b5e', SI: '#ffa94d', CT: '#ffd43b', SL: '#69db7c', CU: '#4dabf7', CH: '#b197fc', FO: '#f783ac' };
const basesText = b => { const on = [1, 2, 3].filter((n, i) => b[i]); return on.length === 3 ? '만루' : on.length ? on.join('·') + '루' : '주자 없음'; };

// 두 폰(과 서버)이 같은 경기를 보고 있는지 확인용 요약(server.mjs와 같게)
const checkOf = m => { const g = m.game; return [g.inning, g.half, g.outs, g.balls, g.strikes, g.score.away, g.score.home, g.bases.map(Number).join('')].join('|'); };
const GRADE = ['<b class="r">타이밍 실패 — 제구가 흔들렸어요</b>', '<b class="y">괜찮은 타이밍</b>', '<b class="g">완벽한 타이밍!</b>'];

// onExit(result): 경기를 끝까지 하면 { home, away, log, starterId }, 중간에 나가면 null
// net(1:1 대결): { side: 'home'|'away'(내 팀), level(방 난이도), conn(net.js 연결) }. userTeam = 홈팀, cpuTeam = 원정팀, cpuLineup = 원정 타순.
//   판정은 서버가 하고 이 화면은 받은 결과를 보여 준다. 자동 진행·넘기기는 없다
// 폰에서 경기를 시작하면 전체 화면으로 바꾼다(안드로이드 크롬 등). 터치한 직후에만 허락되고,
// 아이폰 사파리처럼 이 기능이 없는 브라우저나 컴퓨터(마우스)에서는 아무 일도 하지 않는다
function goFullscreen() {
  const d = document, el = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement || !window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* 세로 고정 못 함 */ } }).catch(() => {});
  } catch (e) { /* 허락 안 됨 */ }
}

// practice(연습장): { kind: 'pitch'|'bat', playerId, stat, goal } — 아웃·이닝 없이 goal구를 채우면 onExit({ practice: { kind, playerId, stat, n, pts } })
export function showGame(root, { userTeam, cpuTeam, lineup, innings, cpuStarterId, title, net = null, cpuLineup = null, practice = null }, onExit) {
  goFullscreen();
  loadSprites();                                     // 메인 화면에서 아직 다 못 받았으면 지금 바로
  const rng = createRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  setReleaseOverride(spriteReleaseOffset);
  // 시간대: 낮에 시작해서 이닝이 지나면 노을 → 밤(조명)으로. 이닝으로 정하니 1:1 대결도 두 폰이 같다. 연습장은 노을 그림이 따로 있다
  const nightQ = typeof location !== 'undefined' && /[?&]night=(0|1|dusk)/.exec(location.search);   // ?night=0/dusk/1 로 고정(확인용)
  const todAt = inning => practice ? timeOfDay(1, 9)
    : nightQ ? (nightQ[1] === '1' ? { phase: 'night', k: 1 } : nightQ[1] === 'dusk' ? { phase: 'dusk', k: 0.8 } : { phase: 'day', k: 0 })
    : timeOfDay(inning, innings);
  setTimeOfDay(todAt(1));
  if (!practice) preloadEvening();
  let match = createMatch({ userTeam, cpuTeam, userLineup: lineup, innings, rng, cpuStarterId, cpuLineup });
  if (practice) {                                    // 타격 연습은 내가 말 공격으로 시작한다
    practice = { ...practice, n: 0, pts: 0 };
    if (practice.kind === 'bat') match = { ...match, game: { ...match.game, half: 'bottom' } };
  }
  const mySide = net ? net.side : 'home';
  let netN = 0, netIdle = false, netPitch = null, netQ = [];
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
    <div class="stage"><canvas></canvas><div class="pitch-pick"></div><div class="side-pick"></div><div class="controls"></div><div class="overlay hidden"></div><div class="cutin-layer"></div></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const cv = $('canvas'), stage = $('.stage'), controls = $('.controls'), overlay = $('.overlay'), picker = $('.pitch-pick'), sidePick = $('.side-pick');
  const ctx = cv.getContext('2d');
  const cutins = createCutins($('.cutin-layer'));   // 홈런·삼진·승리 컷인

  let W = 0, H = 0, DPR = 1, V = null;
  const bg = {};
  let mode = 'msg';              // aim | pick | gauge | flight | bwait | bflight | play | msg | bullpen | end
  let target = { x: 0, y: 0 }, dragging = false, pitchType = null, gaugeStart = 0, period = CONFIG.GAUGE_PERIOD_MS;
  let ball = null;              // { pitch, start, wind, arrival, result, swung, hitAt, contact }
  let pitchAt = 0, swingAt = null, play = null, msg = null, info = '';
  let timers = [];
  let auto = false;             // 자동 진행: 투구·스윙을 컴퓨터가 대신한다
  let prefs = loadPrefs();      // 궤적 안내 · 난이도 · 소리
  setAudioOptions(prefs); preloadAudio();
  const lvl = () => (net ? net.level : prefs.level);   // 대결은 방장이 정한 난이도
  // 내가 칠 때 배트를 댈 곳(존 좌표). 화면을 누른 채 움직이면 따라오고, 손을 떼면 그 자리로 스윙한다
  let batAim = { x: 0, y: -0.1 }, batDrag = null, batFlash = null;
  // 작전(내가 칠 때, 공마다 새로 고른다): bunt = 번트 자세, steal = 이번 공에 주자가 뛴다
  let tactic = { bunt: false, steal: false };
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
    placePicker(); placeSidePick();
  }
  const userPitching = () => matchup(match).pitchingSide === mySide;
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
    $('.mu').innerHTML = practice ? `<b>${mu.pitcher.name}</b> <span class="vs">vs</span> <b>${mu.batter.name}</b> <small>· 연습 ${practice.n}/${practice.goal}구</small>`
      : `<b>${mu.pitcher.name}</b> <small>${match.pitchCount[mu.pitchingSide]}구</small> <span class="vs">vs</span> <small>${g.battingIndex[mu.battingSide] + 1}번</small> <b>${mu.batter.name}</b>`;
  }
  const setControls = html => { controls.innerHTML = html; if (!['aim', 'pick'].includes(mode)) hideBullpenChip(); };
  function showMsg(text, color, ms, sub, then, hidden = false) {   // hidden: 컷인이 대신 보여 주므로 글자는 숨긴다
    msg = { text, color, sub, hidden };
    later(() => { msg = null; if (then) then(); }, ms);
  }

  // ── 진행 ──
  function nextPlay() {
    hold = null; tactic = { bunt: false, steal: false };
    updateBoard();
    if (match.game.over) return showEnd();
    ball = null; play = null; swingAt = null; pitchAt = 0;
    setView();
    if (net) return nextNetPlay();
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
      setControls('<p>스트라이크존 위를 <b>드래그</b>해서 포수 미트 위치를 정하세요</p>');
      showBullpenChip();
    } else {
      const before = match.pitcher.away;
      match = cpuMaybeChangePitcher(match, rng);
      if (match.pitcher.away !== before) {
        updateBoard(); mode = 'msg';
        return showMsg(`${cpuTeam.short} 투수 교체`, '#9fb3cc', 1300, matchup(match).pitcher.name, nextPlay);
      }
      mode = 'bwait';
      // 작전 칩을 누를 틈을 조금 더 준다(연습·자동 진행은 칩이 없다)
      pitchAt = performance.now() + CONFIG.WIND_CPU_MS + 700 + rng() * 900 + (practice || auto ? 0 : 500);
      setControls(auto ? '<p><b>자동 진행 중</b> · 타자가 알아서 쳐요 <small>(위 ▶▶ 버튼에서 끄기)</small></p>' : battingHint());
      showTactics();
    }
  }

  // ── 1:1 대결 ──
  function nextNetPlay() {
    netIdle = false; netPitch = null;
    if (netQ.length) return applyChange(netQ.shift());   // 결과 화면을 보는 동안 온 투수 교체
    netIdle = true;
    net.conn.send({ t: 'ready', n: netN });
    if (userPitching()) {
      mode = 'aim'; pitchType = null;
      setControls('<p>스트라이크존 위를 <b>드래그</b>해서 포수 미트 위치를 정하세요</p>');
      showBullpenChip();
    } else {
      mode = 'bwait';
      setControls('<p><b>상대 투수</b>가 공을 고르는 중 · 화면을 <b>누른 채 움직여</b> 배트를 공 길에 두고, <b>손을 떼면 스윙!</b></p>');
    }
  }
  function applyChange(m) {
    netIdle = false;
    match = changePitcher(match, m.side, m.pitcherId); netN = m.n;
    if (m.chk && m.chk !== checkOf(match)) console.warn('경기 상태가 서버와 달라요', m.chk, checkOf(match));
    updateBoard(); mode = 'msg'; ball = null;
    showMsg(`${match.teams[m.side].short} 투수 교체`, '#9fb3cc', 1300, matchup(match).pitcher.name, nextPlay);
  }
  function onNet(m) {
    if (!alive) return;
    if (m.t === 'left') return netGone('상대가 대결을 나갔어요');
    if (m.t === 'change') { if (netIdle) applyChange(m); else netQ.push(m); return; }
    if (m.t === 'pitch') {
      if (m.n !== netN) return;
      if (userPitching()) {                                // 내가 던진 공: 상대 타자가 준비되면 서버가 만들어 보낸다
        const start = performance.now() + CONFIG.WIND_USER_MS;
        const pitch = viewPitch(m.pitch);
        ball = { pitch, start, wind: CONFIG.WIND_USER_MS, arrival: start + pitch.travelMs, result: null };
        mode = 'flight';
      } else {                                             // 와인드업 뒤 날아온다
        netPitch = m.pitch; pitchAt = performance.now() + CONFIG.WIND_CPU_MS; mode = 'bwait';
        setControls('<p><b>투구!</b> 화면을 <b>누른 채 움직여</b> 배트를 공 길에 두고, <b>손을 떼면 스윙!</b></p>');
      }
      return;
    }
    if (m.t === 'result') {
      if (!ball || m.n !== netN + 1) return;
      netIdle = false; netN = m.n;
      const r = applyDecision(match, ball.pitch, m.d); r.seed = m.seed; r.chk = m.chk;
      ball.result = r;
      if (userPitching()) { if (mode === 'netarrive') arriveUserPitch(); }   // 아직 날아가는 중이면 도착할 때 보여 준다
      else if (ball.swung) { swingOutcome(r, ball.diff, ball.bat); if (r.contact && r.contact.kind === 'MISS' && mode === 'netwait') takePitch(); }
      else takePitch();
    }
  }
  function netGone(text) {
    if (mode === 'end') return;
    mode = 'end'; timers.forEach(clearTimeout); timers = []; ball = null; play = null; msg = null;
    overlay.innerHTML = `<div class="end-card"><div class="tag">1:1 대결</div><h1 style="font-size:24px">${text}</h1>
      <button class="primary" data-act="ok">확인</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=ok]').onclick = () => exit();
    setControls('');
  }
  if (net) net.conn.setHandlers({ onMessage: onNet, onClose: () => netGone('서버와 연결이 끊겼어요') });

  // 투수 교체 칩: 내가 던질 차례(조준·구종 고르기)에 투수 왼쪽에 뜬다(구종 칩은 오른쪽)
  function showBullpenChip() {
    if (practice) return;
    if (sidePick.childElementCount) return placeSidePick();
    sidePick.innerHTML = '<button data-act="bullpen" style="--i:0"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></i><b>투수 교체</b></button>';
    sidePick.querySelector('button').onclick = () => { if (['aim', 'pick'].includes(mode)) showBullpen(); };
    placeSidePick();
  }
  function hideBullpenChip() { sidePick.innerHTML = ''; sidePick.dataset.kind = ''; }
  // 작전 칩(번트·도루): 내가 칠 차례, 공이 오기 전에 왼쪽에 뜬다. 누를 때마다 켜고 끈다
  const TACTIC_ICON = {
    bunt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15L20 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="13" cy="16.5" r="2.6" fill="#fff" stroke="currentColor" stroke-width="1.3"/></svg>',
    steal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17h9M7 12h8M10 7h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M16 4l5 3-5 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function showTactics() {
    if (practice || net || auto) return;
    const canSteal = !!stealRunners(match.game.bases);
    const chip = (k, name, i, c) => `<button data-t="${k}" class="${tactic[k] ? 'on' : ''}" style="--i:${i};--c:${c}"><i>${TACTIC_ICON[k]}</i><b>${name}</b></button>`;
    sidePick.innerHTML = chip('bunt', '번트', 0, '#ffd43b') + (canSteal ? chip('steal', '도루', 1, '#69db7c') : '');
    sidePick.dataset.kind = 'tactic';
    sidePick.querySelectorAll('[data-t]').forEach(b => {
      b.onclick = () => {
        if (mode !== 'bwait') return;
        const k = b.dataset.t; tactic = { ...tactic, [k]: !tactic[k] };
        b.classList.toggle('on', tactic[k]);
        controls.innerHTML = battingHint();
      };
    });
    placeSidePick();
  }
  const battingHint = () => {
    const sign = [tactic.bunt && '<b class="y">번트</b>', tactic.steal && '<b class="g">도루</b>'].filter(Boolean).join(' · ');
    if (tactic.bunt) return `<p>${sign} · 배트(노란 원)를 공 길에 대고 <b>손을 떼면 번트</b></p>`;
    return `<p>${sign ? sign + ' 사인! · ' : ''}화면을 <b>누른 채 움직여</b> 배트(노란 원)를 공 길에 두고, <b>손을 떼면 스윙!</b></p>`;
  };
  // 교체할 투수 고르기: 가운데 창
  function showBullpen() {
    const side = mySide;
    const list = availableRelievers(match.teams[side], match.used[side], match.pitcher[side]);
    mode = 'bullpen'; hidePicker(); hideBullpenChip();
    overlay.innerHTML = `<div class="end-card menu-card"><div class="tag">투수 교체</div><div class="bullpen">${list.map(p => `
      <button data-p="${p.id}"><b>${p.name}</b> <span>${p.role === 'SP' ? '선발' : '불펜'} · ${p.velo}km · 제구 ${p.control} · 체력 ${p.stamina}</span></button>`).join('') || '<p class="hint">남은 투수가 없어요</p>'}</div>
      <button class="ghost" data-act="cancel">취소</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelectorAll('[data-p]').forEach(b => {
      b.onclick = () => {
        closeOverlay();
        if (net) { net.conn.send({ t: 'change', n: netN, pitcherId: b.dataset.p }); mode = 'msg'; setControls('<p>투수 교체 중…</p>'); return; }
        match = changePitcher(match, 'home', b.dataset.p); nextPlay();
      };
    });
    overlay.querySelector('[data-act=cancel]').onclick = () => { closeOverlay(); nextPlay(); };
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
  // PC(마우스가 있는 기기): 구종 칩을 위에서부터 1, 2, 3, 4… 숫자 키로도 고른다
  const KEYS_HINT = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  function onKey(e) {
    if (!alive || mode !== 'pick' || overlayOpen() || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const n = /^[1-9]$/.test(e.key) ? +e.key : /^(Digit|Numpad)[1-9]$/.test(e.code) ? +e.code.slice(-1) : 0;
    const b = n && picker.querySelectorAll('[data-k]')[n - 1];
    if (b) { e.preventDefault(); b.click(); }
  }
  document.addEventListener('keydown', onKey);
  function showPitchButtons() {
    const p = matchup(match).pitcher;
    const again = mode === 'pick' && picker.childElementCount && !picker.classList.contains('out');
    mode = 'pick';
    setControls(`<p>오른쪽에서 구종을 고르세요 <small>(다시 드래그하면 위치 변경)</small></p>`);
    if (again) return placePicker();                    // 위치만 다시 잡은 경우: 칩은 그대로 둔다
    pickerToken++;
    picker.classList.remove('out'); picker.classList.toggle('keys', KEYS_HINT);
    picker.innerHTML = p.pitches.map((k, i) => `<button data-k="${k}" style="--c:${PITCH_COLORS[k] || '#9fb3cc'};--i:${i}">`
      + `<i>${pitchIcon(k, p.throws)}</i><b>${PITCH_TYPES[k].name}</b><span>${Math.round(p.velo * PITCH_TYPES[k].speedMul)}</span>${KEYS_HINT && i < 9 ? `<kbd>${i + 1}</kbd>` : ''}</button>`).join('');
    placePicker();
    picker.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => {
        if (mode !== 'pick') return;
        pitchType = b.dataset.k; mode = 'gauge'; gaugeStart = performance.now();
        period = gaugePeriod(matchup(match).fatigue, lvl());
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
  function placeSidePick() {
    if (!sidePick.childElementCount || !V) return;
    if (sidePick.dataset.kind === 'tactic') { sidePick.style.transform = `translate(10px,${Math.round(H * 0.4)}px)`; return; }
    const pa = pitcherAnchor(V, matchup(match).pitcher.throws), g = gaugeSpot(), w = sidePick.offsetWidth, h = sidePick.offsetHeight;
    const x = Math.max(8, Math.min(pa.x - pa.scale * 42 - w, W - w - 8)), y = Math.max(8, Math.min(g.cy - h / 2, H - h - 8));
    sidePick.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  function throwUserPitch(ts) { throwWith(gaugePos(ts - gaugeStart, period), lvl()); }
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
  // 내가 던진 공은 실제 속도로 날아가 보이게(판정은 이미 끝났거나 서버가 한다. 화면 시간만 바꾼다)
  const viewPitch = p => ({ ...p, travelMs: p.travelMs * CONFIG.PITCH_VIEW_SPEED / CONFIG.SPEED_SCALE });
  function throwWith(gpos, level = 'easy') {
    if (net) {                                           // 서버로 보내고, 상대 타자가 준비되면 공이 돌아온다
      const mu = matchup(match), sweet = sweetWidth(mu.pitcher.control, mu.fatigue, level), err = gaugeError(gpos);
      const q = err > sweet ? 0 : err < sweet * 0.35 ? 2 : 1;
      net.conn.send({ t: 'throw', n: netN, type: pitchType, target, gaugePos: gpos });
      netIdle = false; mode = 'netwait';
      lastGauge = { pos: gpos, sweet, at: performance.now(), q };
      setControls(`<p>${GRADE[q]} <small>· 상대 타자를 기다리는 중</small></p>`);
      return;
    }
    const r = playUserPitch(match, { type: pitchType, target, gaugePos: gpos, level }, rng);
    const start = performance.now() + CONFIG.WIND_USER_MS;
    const pitch = viewPitch(r.pitch);
    ball = { pitch, start, wind: CONFIG.WIND_USER_MS, arrival: start + pitch.travelMs, result: r };
    mode = 'flight';
    lastGauge = { pos: gpos, sweet: r.pitch.sweet, at: performance.now(), q: !r.pitch.onTarget ? 0 : r.pitch.err < r.pitch.sweet * 0.35 ? 2 : 1 };
    const grade = !r.pitch.onTarget ? '<b class="r">타이밍 실패 — 제구가 흔들렸어요</b>'
      : r.pitch.err < r.pitch.sweet * 0.35 ? '<b class="g">완벽한 타이밍!</b>' : '<b class="y">괜찮은 타이밍</b>';
    setControls(`<p>${grade}</p>`);
  }

  function throwCpuPitch() {
    if (sidePick.dataset.kind === 'tactic') hideBullpenChip();   // 공이 오면 작전은 못 바꾼다
    const pitch = net ? netPitch : cpuPitchToUser(match, rng, { strikeOnly: !!practice });
    netIdle = false;
    ball = { pitch, start: pitchAt, wind: CONFIG.WIND_CPU_MS, arrival: pitchAt + pitch.travelMs, result: null, swung: false };
    // 궤적 안내는 '대략 이쯤': 타자 선구안이 좋을수록 범위가 좁고 가운데가 정확하다(화면용이라 경기 난수는 쓰지 않는다)
    // eye 30 → 반지름 0.8(존 반폭 기준, 존의 거의 절반), eye 90 → 0.42. 가운데는 실제 도착점에서 반지름의 0.4배쯤 어긋난다
    const acc = Math.max(0, Math.min(1, (matchup(match).batter.eye - 30) / 60)), R = 0.8 - 0.38 * acc;
    const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
    ball.guide = { x: pitch.plate.x + gauss() * R * 0.4, y: pitch.plate.y + gauss() * R * 0.4, r: R };
    mode = 'bflight';
    if (auto) {                  // 자동 진행: 컴퓨터 타자처럼 칠지 말지, 타이밍을 정한다
      const mu = matchup(match), b = ball;
      const sw = cpuSwing({ batter: mu.batter, pitch, balls: match.game.balls, strikes: match.game.strikes, rng, prev: lastPitch(match) });
      if (sw.swing) {
        const ts = b.arrival + sw.timingDiffMs;
        later(() => { if (auto && ball === b && mode === 'bflight') userSwing(ts); }, Math.max(0, ts - performance.now()));
      }
    }
  }

  // 내가 던진 공이 도착
  function arriveUserPitch() {
    if (net && !ball.result) { mode = 'netarrive'; return; }   // 상대 타자의 판정을 기다리며 공을 홈에 멈춰 둔다
    const r = ball.result;
    if (r.swing) swingAt = Math.max(ball.arrival, performance.now()) - SWING_CONTACT_MS;
    const k = r.contact ? r.contact.kind : null;
    if (k === 'INPLAY' || k === 'FOUL') { playSound(k === 'FOUL' ? 'foul' : r.event === 'HR' ? 'homerun' : 'hit', { q: r.contact.quality }); ball.hitAt = performance.now(); ball.contact = r.contact; }
    else if (k === 'MISS') { playSound('whiff'); playSound('mitt', { speed: r.pitch.speedKmh }); }
    else playSound('mitt', { speed: r.pitch.speedKmh });
    info = `${r.pitch.speedKmh}km/h ${PITCH_TYPES[r.pitch.type].name}`;
    apply(r, true);
  }

  // 내 스윙
  function userSwing(ts) {
    if (!ball || ball.swung) return;
    ball.swung = true;
    if (!tactic.bunt) swingAt = performance.now() - 30;   // 손을 떼자마자 방망이가 나가 보이게(번트는 자세 그대로 댄다)
    const diff = ts - ball.arrival;
    const bat = auto ? null : { x: batAim.x, y: batAim.y, level: lvl() };
    if (net) {                                           // 판정은 서버가: 타이밍과 배트 위치만 보낸다
      ball.sent = true; ball.diff = diff; ball.bat = bat;
      net.conn.send({ t: 'swing', n: netN, diff, bat: bat && { x: bat.x, y: bat.y } });
      return;
    }
    swingOutcome(resolveUserSwing(match, ball.pitch, diff, rng, bat, tactic), diff, bat);
  }
  function swingOutcome(r, diff, bat) {
    const k = r.contact.kind;
    if (bat) batFlash = { at: performance.now(), hit: k !== 'MISS', x: batAim.x, y: batAim.y };
    info = `${ball.pitch.speedKmh}km/h ${PITCH_TYPES[ball.pitch.type].name} · `
      + (r.contact.aimMiss ? '배트가 공 길에서 벗어났어요' : r.contact.bunt && k !== 'MISS' ? '번트' : `${diff < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(diff))}ms`);
    if (k === 'MISS') { playSound('whiff'); ball.result = r; return; }   // 공은 미트까지 날아간 뒤 판정
    const q = r.contact.quality;
    if (r.event === 'HR') playSound('homerun', { crowd: true });   // 맞는 순간 관중이 일어난다(받은 녹음 전체)
    else playSound(k === 'FOUL' ? 'foul' : 'hit', { q });
    vibrate(k === 'INPLAY' && q > 0.8 ? 70 : 35);
    shake(cv, r.contact.bunt ? 2 : k === 'INPLAY' ? 4 + q * 8 : 3);
    ball.hitAt = performance.now(); ball.contact = r.contact;
    apply(r, false);
  }

  function takePitch() {
    if (net && !ball.result) {                           // 안 쳤다고 서버에 알리고 판정을 기다린다
      if (!ball.sent) { ball.sent = true; net.conn.send({ t: 'take', n: netN }); }
      mode = 'netwait'; return;
    }
    playSound('mitt', { speed: ball.pitch.speedKmh });
    const r = ball.result || resolveUserSwing(match, ball.pitch, null, rng, null, tactic);
    if (!ball.swung) info = `${ball.pitch.speedKmh}km/h ${PITCH_TYPES[ball.pitch.type].name}`;
    apply(r, false);
  }

  // 결과 반영: 인플레이면 타구 화면 → 결과, 아니면 바로 결과
  function apply(r, userPitched) {
    mode = 'msg';
    const prev = match.game;
    const finish = () => settle(prev, r, userPitched);
    const batter = matchup(match).batter;
    if (r.steal && !practice) {                         // 도루: 판정 전에 주자가 뛰고 포수가 던지는 장면
      play = buildPlay({ event: r.steal.ok ? 'STEAL' : 'CAUGHT_STEALING', steal: { lead: r.steal.lead, trail: r.steal.trail ?? null },
        bats: batter.bats, bases: prev.bases, rng });
      play.sounds.sort((a, b) => a.t - b.t);
      play.start = performance.now() + 200; play.si = 0;
      play.then = finish;
      return;
    }
    if (['BALL', 'STRIKE', 'FOUL', 'HBP', 'WILD', 'BUNT_FOUL'].includes(r.event)) return finish();
    // 대결이면 서버가 준 씨앗으로: 두 폰에서 같은 장면이 나온다
    play = buildPlay({ event: r.event, fly: r.fly, style: r.style, contact: r.contact, bats: batter.bats, bases: prev.bases, rng: r.seed != null ? createRng(r.seed) : rng });
    if (practice) play = practicePlay(play);            // 연습장: 수비수·주자 없이 공만
    play.sounds.sort((a, b) => a.t - b.t);
    play.start = performance.now() + 320; play.si = 0;
    play.then = finish;
  }

  function settle(prev, r, userPitched) {
    hold = matchup(match);
    match = r.match;
    if (practice) {                                     // 연습: 점수를 쌓고, 아웃·주자·이닝은 매번 되돌린다
      practice.n++; practice.pts += userPitched ? pitchPts(ball.pitch) : swingPts(r.contact);
      match = { ...match, game: { ...match.game, inning: 1, half: practice.kind === 'pitch' ? 'top' : 'bottom', outs: 0, bases: [false, false, false], score: { away: 0, home: 0 }, over: false, result: null }, pitchCount: { home: 0, away: 0 } };
    }
    if (r.chk && r.chk !== checkOf(match)) console.warn('경기 상태가 서버와 달라요', r.chk, checkOf(match));
    let label = (r.style && STYLE_LABEL[r.style]) || LABEL[r.event] || (r.fly ? '뜬공 아웃' : '땅볼 아웃');
    if (r.event === 'STRIKE' && prev.strikes === 2) { label = '삼진!'; playSound('strikeout'); }
    else if (r.event === 'STRIKE' && r.contact && r.contact.kind === 'MISS') label = r.contact.bunt ? '번트 헛스윙' : '헛스윙';
    if (r.event === 'BUNT_FOUL' && prev.strikes === 2) { label = '스리번트 실패 · 삼진'; playSound('strikeout'); }
    if (r.event === 'BALL' && prev.balls === 3) label = '볼넷';
    if (r.steal) {                                       // 도루: 결과를 앞에 붙인다
      label = `${r.steal.lead + 2}루 도루 ${r.steal.ok ? '성공!' : '실패'} · ${label}`;
      playSound(r.steal.ok ? 'cheer' : 'aww', { gain: 0.7 });
    }
    crowd(prev, r, userPitched);
    const good = r.steal && !userPitched ? r.steal.ok
      : userPitched ? (r.event === 'STRIKE' || OUTS.includes(r.event)) : (HITS.includes(r.event) || FREE.includes(r.event) || r.event === 'SAC_BUNT');
    const color = r.event === 'FOUL' ? '#ffffff' : good ? '#2ecc71' : '#e74c3c';
    const sub = (r.runs && !practice ? `${r.runs}점 득점! · ` : '') + info;
    const g = match.game;
    const halfOver = !g.over && (g.half !== prev.half || g.inning !== prev.inning);
    updateBoard();
    // 컷인: 내가 친 홈런·맞은 홈런·내가 잡은 삼진. 연습·자동 진행에서는 건너뛴다
    const cut = !practice && !auto ? cutinFor(r, prev, userPitched) : null;
    if (cut) cutins.play(cut, { sub: cut === 'homerun' ? (HR_NAME[r.runs] || '홈런!!') : cut === 'homerun_bad' ? (HR_NAME[r.runs] || '') : '' });
    showMsg(label, color, cut ? CUT_MS[cut] : r.event === 'HR' ? 2000 : 1300, sub, () => {
      if (practice && practice.n >= practice.goal) return finishPractice();
      if (match.game.over) return showEnd();
      if (halfOver) {
        play = null; ball = null;
        const was = todAt(prev.inning).phase, now = todAt(g.inning).phase;
        const note = now !== was ? (now === 'night' ? ' · 조명이 켜졌어요' : now === 'dusk' ? ' · 해가 지고 있어요' : '') : '';
        return showMsg('공수교대', '#9fb3cc', 1200, `${g.inning}회${g.half === 'top' ? '초' : '말'}${note}`, nextPlay);
      }
      nextPlay();
    }, !!cut);
  }

  // 홈 관중(우리 팀 팬)의 반응. 홈런은 친 순간·넘어가는 순간에 따로 낸다
  function crowd(prev, r, userPitched) {
    const ev = r.event, inplay = r.contact && r.contact.kind === 'INPLAY';
    if (ev === 'HR') return;
    if (!userPitched) {                                   // 우리 공격
      if (r.runs) playSound('roar', { gain: 0.75 });
      else if (HITS.includes(ev) || ev === 'HBP') playSound('cheer', { gain: 0.85 });
      else if (ev === 'BALL' && prev.balls === 3) playSound('cheer', { gain: 0.45 });
      else if (OUTS.includes(ev) && inplay) playSound('aww', { gain: 0.6 });
    } else {                                              // 상대 공격
      if (r.runs) playSound('aww', { gain: 0.8 });
      else if (ev === 'STRIKE' && prev.strikes === 2) playSound('cheer', { gain: 0.7 });
      else if (ev === 'DOUBLE_PLAY' || ev === 'LINE_DP') playSound('cheer', { gain: 0.8 });
      else if (OUTS.includes(ev)) playSound('cheer', { gain: 0.4 });
    }
  }
  // 타구 장면 속 소리: 야수가 공을 잡는 소리, 홈런 공이 담장을 넘는 순간(우리 홈런이면 축하 음악, 상대면 탄식)
  function playCue(name) {
    if (name === 'mitt') return playSound('catch');
    if (name === 'cheer') return playSound(shownMu().battingSide === mySide ? 'jingle' : 'aww');
    playSound(name);
  }

  // 연습 끝: 요약을 보여 주고, 확인을 누르면 결과를 넘긴다
  function finishPractice() {
    mode = 'end'; $('.more').hidden = true; hold = null; ball = null; play = null;
    overlay.innerHTML = `<div class="end-card win">
      <div class="tag">${practice.kind === 'pitch' ? '투구' : '타격'} 연습 끝</div><h1>${practice.n}구 완료</h1>
      <p class="hint" style="text-align:center">연습 점수 ${practice.pts.toFixed(1)}</p>
      <button class="primary" data-act="menu">경험치 받기</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=menu]').onclick = () => exit({ practice: { kind: practice.kind, playerId: practice.playerId, stat: practice.stat, n: practice.n, pts: practice.pts } });
    playSound('jingle');
    setControls('');
  }

  function showEnd() {
    mode = 'end'; $('.more').hidden = true;
    const g = match.game;
    const won = g.result === mySide;
    const res = won ? '승리' : g.result === 'home' || g.result === 'away' ? '패배' : '무승부';
    overlay.innerHTML = `<div class="end-card ${won ? 'win' : ''}">
      <div class="tag">경기 종료 · ${g.inning}회</div><h1>${res}</h1>
      <div class="final"><span>${cpuTeam.short}</span><b>${g.score.away}</b><i>:</i><b>${g.score.home}</b><span>${userTeam.short}</span></div>
      <button class="primary" data-act="menu">계속</button>
      <button class="ghost" data-act="log">경기 기록 보기</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=log]').onclick = () => showLog(match.log, '경기 기록', showEnd);
    if (won) { playSound('roar'); playSound('jingle'); vibrate([80, 60, 80, 60, 160]); cutins.play('win'); }
    overlay.querySelector('[data-act=menu]').onclick = () => (net ? exit() : exit({
      home: g.score.home, away: g.score.away, log: match.log, starterId: lineup.starterId }));
    setControls('');
  }

  function exit(result = null) {
    alive = false;
    if (net) { net.conn.send({ t: 'leave' }); net.conn.close(); }
    setAmbience(false);
    loop.stop(); timers.forEach(clearTimeout); window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility); document.removeEventListener('keydown', onKey);
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
      ${net ? '' : `<button class="primary" data-act="auto">${auto ? '자동 진행 끄기' : '자동 진행 켜기'}</button>
      <p class="hint">투수가 알아서 던지고, 타자가 알아서 칩니다</p>`}
      <div class="row2"><button class="ghost" data-act="guide">${prefs.guide ? '궤적 안내 켜짐' : '궤적 안내 꺼짐'}</button>
        ${net ? `<button class="ghost" disabled>난이도: ${LEVEL_NAME[lvl()]}</button>` : `<button class="ghost" data-act="level">난이도: ${LEVEL_NAME[prefs.level]}</button>`}</div>
      <p class="hint">${net ? '1:1 대결은 방을 만든 사람이 정한 난이도로 둘 다 같게 해요. ' : ''}${{ easy: '쉬움: 배트가 크고 잘 맞아요. 제구 게이지의 초록 구간이 넓고 느려요', normal: '보통: 배트가 작고, 제구 게이지가 좁고 빨라요. 공이 올 길은 대략 보여 줘요(선구안이 좋을수록 정확)', hard: '어려움: 배트가 더 작고 궤적 안내가 없어요. 제구 게이지가 가장 좁고 빨라요' }[lvl()]}</p>
      <div class="row2 snd"><button class="ghost" data-act="sfx">효과음 ${prefs.sfx ? '켜짐' : '꺼짐'}</button>
        <button class="ghost" data-act="amb">관중·응원 ${prefs.amb ? '켜짐' : '꺼짐'}</button></div>
      <div class="vols">${volRow('🔊', '효과음', 'sfxVol', prefs.sfxVol)}${volRow('👏', '배경음', 'ambVol', prefs.ambVol)}</div>
      ${net ? '' : `<button class="ghost" data-act="half">이번 ${userPitching() ? '수비' : '공격'} 넘기기</button>
      <button class="ghost" data-act="inning">이번 이닝 넘기기</button>
      <button class="ghost" data-act="game">이번 경기 넘기기</button>`}
      <button class="ghost" data-act="log">경기 기록 보기</button>
      <button class="ghost" data-act="close">닫기</button></div>`;
    overlay.classList.remove('hidden');
    const on = (a, fn) => { const el = overlay.querySelector(`[data-act=${a}]`); if (el) el.onclick = fn; };
    on('auto', () => {
      auto = !auto; closeOverlay();
      // 조준·구종 고르기·타석 대기 중(또는 자동 투구 대기 중)이면 바로 바뀐 방식으로 다시 시작
      if (['aim', 'pick', 'gauge', 'bwait'].includes(mode) || (mode === 'msg' && !msg && !play && !ball)) nextPlay();
    });
    on('guide', () => { prefs = { ...prefs, guide: !prefs.guide }; savePrefs(prefs); closeOverlay(); showMenu(); });
    on('level', () => { prefs = { ...prefs, level: LEVELS[(LEVELS.indexOf(prefs.level) + 1) % LEVELS.length] }; savePrefs(prefs); closeOverlay(); showMenu(); });
    const sound = (k) => { prefs = { ...prefs, [k]: !prefs[k] }; savePrefs(prefs); setAudioOptions(prefs); closeOverlay(); showMenu(); };
    overlay.querySelectorAll('input[data-vol]').forEach(el => bindVol(el, v => {   // 0보다 크게 올리면 꺼져 있던 소리도 켠다
      const flag = el.dataset.vol === 'sfxVol' ? 'sfx' : 'amb';
      prefs = { ...prefs, [el.dataset.vol]: v, ...(v > 0 ? { [flag]: true } : {}) }; setAudioOptions(prefs);
    }, () => { savePrefs(prefs); closeOverlay(); showMenu(); }));
    on('sfx', () => sound('sfx'));
    on('amb', () => sound('amb'));
    on('half', () => skip('half'));
    on('inning', () => skip('inning'));
    on('game', () => { if (confirm('남은 경기를 모두 자동으로 진행할까요?')) skip('game'); });
    on('log', () => showLog(match.log, '경기 기록', closeOverlay));
    on('close', closeOverlay);
  }
  // 넘기기: 진행 중이던 공·타구 화면은 취소하고(아직 경기에 반영 전), 지금 상황부터 컴퓨터끼리 진행한다
  function skip(kind) {
    cutins.clear();
    closeOverlay();
    timers.forEach(clearTimeout); timers = [];
    ball = null; play = null; msg = null; hold = null; swingAt = null; pitchAt = 0; mode = 'msg';
    const from = match.log.length, g0 = match.game;
    match = kind === 'half' ? simulateHalf(match, rng) : kind === 'inning' ? simulateInning(match, rng) : simulateRest(match, rng);
    updateBoard(); setView();
    setControls('');
    const title = kind === 'half' ? `${g0.inning}회${g0.half === 'top' ? '초' : '말'} 결과` : kind === 'inning' ? `${g0.inning}회 결과` : '남은 경기 결과';
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
        return `<i class="${(q.e === 'BALL' || q.e === 'WILD' || q.e === 'HBP') ? 'b' : last && !PITCH_E[q.e] ? 'x' : 's'}">${q.k ? `${PITCH_TYPES[q.k].name} ${q.v} ` : ''}${e}</i>`;
      }).join('');
      const good = HITS.includes(l.event) || l.event === 'WALK' || l.event === 'HBP';
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
  if (practice) $('.more').hidden = true;

  $('.exit').onclick = () => {
    if (mode === 'end') { const b = overlay.querySelector('[data-act=menu]'); return b ? b.click() : showEnd(); }
    if (confirm(net ? '대결을 그만둘까요? 상대 화면에서도 경기가 끝나요' : practice ? '연습을 그만둘까요? (중간에 나가면 경험치가 쌓이지 않아요)' : '경기를 그만둘까요? (시즌 경기는 기록되지 않고 다시 할 수 있어요)')) exit();
  };

  // 화면이 가려지면 던지던 공을 취소하고 다시 던진다(순간이동 방지)
  let interrupted = false;
  function onVisibility() {
    if (net) return;                                     // 대결은 상대가 기다리므로 공을 취소하지 않는다
    if (document.hidden) {
      if (mode === 'flight' || mode === 'bflight' || mode === 'bwait' || mode === 'gauge') { interrupted = true; ball = null; mode = 'msg'; }
    } else if (interrupted) { interrupted = false; nextPlay(); }
    else if (mode === 'bwait') pitchAt = Math.max(pitchAt, performance.now() + CONFIG.WIND_CPU_MS + 500);
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ── 입력 ──
  const zoneTouch = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerup', goFullscreen);   // 시작할 때 못 바꿨으면 터치를 뗄 때(터치는 손을 뗄 때만 허락된다). 이미 전체 화면이면 그냥 넘어간다
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
      sw = sweetWidth(mu.pitcher.control, mu.fatigue, lvl()); pos = gaugePos(now - gaugeStart, period);
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
    if (!msg || msg.hidden) return;
    const y = V && V.kind === 'pitcher' && !play ? H * 0.2 : H * 0.14;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '900 40px system-ui,sans-serif'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(msg.text, W / 2, y); ctx.fillStyle = msg.color; ctx.fillText(msg.text, W / 2, y);
    if (msg.sub) { ctx.font = '600 15px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeText(msg.sub, W / 2, y + 28); ctx.fillStyle = '#e4ecf6'; ctx.fillText(msg.sub, W / 2, y + 28); }
    ctx.textAlign = 'left';
  }

  function frame(dt, now) {
    if (!W || !V) resize();
    setAmbience(true);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (mode === 'bwait' && pitchAt && overlayOpen()) pitchAt = Math.max(pitchAt, now + CONFIG.WIND_CPU_MS + 500);
    else if (mode === 'bwait' && pitchAt && now >= pitchAt) throwCpuPitch();

    if (play && now >= play.start) {
      const mu = shownMu(), ms = now - play.start;
      drawPlay3D(ctx, W, H, play, ms, { field: uni[mu.pitchingSide], bat: uni[mu.battingSide] }, { practice: !!practice });
      while (play.si < play.sounds.length && toMs(play.sounds[play.si].t) <= ms) playCue(play.sounds[play.si++].name);
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
    if (setTimeOfDay(todAt(match.game.inning))) for (const k in bg) delete bg[k];   // 이닝이 넘어가 시간대가 바뀌면 배경을 다시 그린다
    const bgReady = standsReady(V.kind) && (!practice || practiceArtSettled());
    if (!bg[V.kind] || bg[V.kind].ready !== bgReady) {
      bg[V.kind] = buildBackdrop(V.kind, V, W, H, DPR, userTeam);
      if (practice) decoratePractice(bg[V.kind], practice.kind, W, H, DPR, userTeam, V);   // 연습장 분위기(케이지·불펜)를 덧입힌다
    }
    ctx.drawImage(bg[V.kind], 0, 0, W, H);
    const mu = shownMu();
    const bp = ball && !ball.hitAt && now >= ball.start ? ballScreen(V, ball.pitch, ball.start, mode === 'netarrive' ? Math.min(now, ball.arrival) : now) : null;
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
      const aiming = mode === 'aim' || mode === 'pick' || mode === 'gauge' || mode === 'netwait' || (ball && !ball.hitAt);
      if (!drawCatcherSprite(ctx, V, aiming ? target : null, now)) drawCatcherAndUmpire(ctx, V, aiming ? target : null, uni[mu.pitchingSide]);
      drawZone(0.7);
      drawB();
      if (bp && bp.prog <= 1.02) { drawTrail(now); drawBall(ctx, bp.x, bp.y, bp.r, bp.spin); }
      drawP();
    } else {
      drawP();
      drawB();                                   // 타자는 카메라 가까이 옆에 크게 서 있어서 존·공은 그 위에 그린다(공이 몸에 가리지 않게)
      drawZone(0.32);
      drawGuide(now);
      if (bp && bp.prog <= 1.02) { drawTrail(now); drawBall(ctx, bp.x, bp.y, bp.r, bp.spin); }
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
    if (!ball || !ball.guide || ball.hitAt || auto || !prefs.guide || lvl() === 'hard' || mode !== 'bflight' || now < ball.start) return;
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
  // 타이밍 신호: 공이 도착하는 때와 정타 여유(grace) 안이면 초록으로 바뀐다 = 지금 손을 떼면 잘 맞는다. 궤적 안내와 같이 켜고 끄고, 어려움에서는 없다
  const timingOn = now => !!ball && !ball.swung && !ball.hitAt && mode === 'bflight' && prefs.guide && lvl() !== 'hard'
    && Math.abs(now - ball.arrival) <= (tactic.bunt ? 150 : graceMs(lvl()));   // 번트는 대기만 하면 되니 넉넉하게
  function drawBat(now, batter) {
    const flash = batFlash && now - batFlash.at < 450 ? batFlash : null;
    if (auto || (!flash && mode !== 'bwait' && mode !== 'bflight')) return;
    const reach = batReach(batter.contact, lvl()), bk = tactic.bunt ? BUNT.reach : 1;
    const rx = reach.rx * bk, ry = reach.ry * bk;
    const at = flash || batAim;
    const [cx, cy] = toS(V, at.x, at.y), RX = rx * V.zw / 2, RY = ry * V.zh / 2;
    const sweet = !flash && timingOn(now);
    const col = flash ? (flash.hit ? '46,204,113' : '255,107,94') : sweet ? '61,220,132' : '255,214,64';
    const a = flash ? 1 - (now - flash.at) / 450 : batDrag ? 1 : 0.8;
    ctx.save(); ctx.globalAlpha = sweet ? 1 : a;
    ctx.fillStyle = `rgba(${col},${sweet ? .28 : .12})`; ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = sweet ? 3.2 : 2.2;
    if (sweet) { ctx.shadowColor = `rgba(${col},.9)`; ctx.shadowBlur = 14; }
    ctx.beginPath(); ctx.ellipse(cx, cy, RX, RY, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},.45)`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, RX * 0.4, RY * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineCap = 'round';                    // 배트(가로 막대)
    ctx.lineWidth = Math.max(4, RY * 0.16); ctx.beginPath(); ctx.moveTo(cx - RX * 0.62, cy); ctx.lineTo(cx + RX * 0.62, cy); ctx.stroke();
    if (tactic.bunt && !flash) {                                                  // 번트 자세 표시
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(${col},1)`; ctx.font = '800 13px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('번트', cx, cy - RY - 6);
    }
    ctx.restore();
  }
  // 스트라이크존: 판정 존(ZONE_K) 크기로 그린다
  function drawZone(alpha) {
    const [x0, y0] = toS(V, (V.mirror ? 1 : -1) * ZONE_K, ZONE_K), zw = V.zw * ZONE_K, zh = V.zh * ZONE_K;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, zw, zh);
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x0 + zw * i / 3, y0); ctx.lineTo(x0 + zw * i / 3, y0 + zh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y0 + zh * i / 3); ctx.lineTo(x0 + zw, y0 + zh * i / 3); ctx.stroke();
    }
  }

  window.__game = () => ({ mode, dragging, V: !!V, W, H, target, ball: !!ball, ballStart: ball ? ball.start : null, arrival: ball ? ball.arrival : null, swung: !!(ball && ball.swung), pitchAt, play: play && play.start ? { ms: Math.round(performance.now() - play.start), event: play.event } : null });
  const loop = startLoop(frame);
  resize();
  updateBoard();
  showMsg('플레이볼!', '#f1c40f', 1100, '1회초', nextPlay);
  return { exit };
}
