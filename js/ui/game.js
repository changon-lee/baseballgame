// 경기 화면: 투구(조준 → 구종 → 게이지), 타격(타이밍 터치), 타구 화면, 투수 교체, 경기 종료
import { CONFIG } from '../config.js';
import { createRng } from '../core/rng.js';
import { PITCH_TYPES, gaugePos, gaugeError, sweetWidth, gaugePeriod, energy, aimFromTouch, fatigue, ZONE_K, computePitch } from '../core/pitch.js';
import { availableRelievers } from '../core/team.js';
import { createMatch, matchup, playUserPitch, cpuPitchToUser, resolveUserSwing, changePitcher, cpuMaybeChangePitcher, simulateHalf, simulateInning, lastPitch, simulateRest, applyDecision } from '../core/match.js';
import { cpuChoosePitch, cpuSwing } from '../core/ai.js';
import { swingPts, controlGrade } from '../core/practice.js';
import { createCutins, cutinFor, CUT_MS, HR_NAME } from './cutin.js';
import { decoratePractice, practiceArtSettled, preloadPractice } from './art/practice.js';
import { batReach, graceMs } from '../core/batting.js';
import { BUNT } from '../core/bunt.js';
import { stealRunners } from '../core/rules.js';
import { hitsToday, isHot, rally, RALLY_MAX } from '../core/heat.js';
import { boostFor } from '../core/perks.js';
import { raiseStep, raiseSteal, raisePull, gameLine, PULL_MORE_RUNS } from '../core/raisematch.js';
import { lineScore, todayText, gameMvp } from '../core/boxscore.js';
import { fieldChance, judgeTap, fieldWin, CPU_DIVE } from '../core/fielding.js';
import { clutchOf, scoreSwing, highlightsOf, bestOf, qualityStart, seasonMilestones } from '../core/moments.js';
import { playerLine, avg, era, ip } from '../core/growth.js';
import { face } from './hub.js';
import { loadPrefs, savePrefs, LEVELS, LEVEL_NAME } from './prefs.js';
import { volRow, bindVol } from './volume.js';
import { startLoop } from './loop.js';
import { unlockAudio, playSound, vibrate, shake, preloadAudio, setAudioOptions, setAmbience, previewSound } from './feedback.js';
import { makeView, toS, zoneRect, ballScreen, ballRadius, pitcherAnchor, batterAnchor, setReleaseOverride, PITCH_PATH } from './art/view.js';
import { drawPitcherSprite, drawBatterSprite, drawCatcherSprite, spriteReleaseOffset, SWING_CONTACT_MS, loadSprites } from './art/sprites.js';
import { buildBackdrop, standsReady, timeOfDay, setTimeOfDay, preloadEvening } from './art/stadium.js';
import { uniformFor } from './art/uniforms.js';
import { finishFrame } from './art/fx.js';
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
const STYLE_LABEL = { bunt: '번트 아웃', dive: '다이빙 캐치!', wall: '펜스 앞 점프 캐치!', liner: '직선타 아웃', home_safe: '안타! 홈 세이프', bloop: '텍사스 안타!', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃', dive_miss: '다이빙 실패 · 안타!', bang: '간발의 차 아웃!' };
// 투구 위치 점·구종 글자 색: 직구 계열 빨강, 휘는 공 파랑, 떨어지는 공 초록
const SPEED_TIER = [150, 160];   // 구속 표시 단계: 강속구(150km~) · MAX(160km~)
const DOT_COLOR = { FB: '#ff6b6b', SI: '#ff8787', CT: '#ffa94d', SL: '#4dabf7', CU: '#748ffc', CH: '#51cf66', FO: '#38d9a9' };
const HIT_PA = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];   // 기록에 남는 안타(번트 안타·내야안타도 SINGLE)
const HITS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR', 'INFIELD_SINGLE', 'SINGLE_HOME_OUT', 'ERROR', 'BUNT_SINGLE'];   // 타자에게 좋은 결과
const FREE = ['BALL', 'HBP', 'WILD'];   // 타자에게 좋은 '안 친' 결과
const OUTS = ['OUT', 'SAC_FLY', 'DOUBLE_PLAY', 'LINE_DP', 'SAC_BUNT', 'BUNT_FC'];
// 경기 기록에 쓰는 이름
const PA_NAME = { WALK: '볼넷', HBP: '몸에 맞는 공', STRIKEOUT: '삼진', SINGLE: '안타', DOUBLE: '2루타', TRIPLE: '3루타', HR: '홈런', OUT: '범타 아웃', SAC_FLY: '희생플라이', SAC_BUNT: '희생번트', DOUBLE_PLAY: '병살타', ERROR: '실책 출루' };
const PLAY_NAME = { BUNT_SINGLE: '번트 안타', BUNT_FC: '번트 (야수 선택)', INFIELD_SINGLE: '내야안타', SINGLE_HOME_OUT: '안타 (2루 주자 홈에서 아웃)', LINE_DP: '직선타 병살' };
const STYLE_NAME = { bunt: '번트 아웃', dive: '다이빙 캐치 아웃', wall: '펜스 앞 호수비 아웃', liner: '직선타 아웃', home_safe: '안타 (홈 승부 세이프)', fumble: '실책 출루 (포구 실책)', throw: '실책 출루 (송구 실책)', bloop: '텍사스 안타', pop: '내야 뜬공 아웃', foul: '파울플라이 아웃', dive_miss: '안타 (다이빙 캐치 실패)', bang: '땅볼 아웃 (간발의 송구)' };
const paName = l => PLAY_NAME[l.play] || STYLE_NAME[l.style] || (l.event === 'OUT' ? (l.fly ? '뜬공 아웃' : '땅볼 아웃') : PA_NAME[l.event] || l.event);
const PITCH_E = { BALL: '볼', HBP: '사구', WILD: '폭투', STRIKE: '스트', FOUL: '파울', BUNT_FOUL: '번트파울' };
// 구종 칩 색(빠른 공은 따뜻한 색, 떨어지는 공은 차가운 색)
const PITCH_COLORS = { FB: '#ff6b5e', SI: '#ffa94d', CT: '#ffd43b', SL: '#69db7c', CU: '#4dabf7', CH: '#b197fc', FO: '#f783ac' };
const COND_ICON = ['⬇⬇', '⬇', '➖', '⬆', '⬆⬆'];
const RAISE_NOTE = { end: '남은 경기를 진행했어요', pinch: '대타로 교체됐어요', pulled: '강판됐어요', changed: '투수 교체', noshow: '오늘은 등판이 없었어요', bench: '오늘은 벤치에서 경기를 지켜봤어요' };
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
// raise(육성모드): { kind, role, playerId, cond } — 내 선수 장면(내 타석 / 내가 던지는 초 공격 / 마무리 9·10회초)만 직접 하고 나머지는 자동.
//   perks = { id, cond, traits }(컨디션·특성 효과). 끝까지 하면 onExit({ home, away, log, starterId, raise: { note } })
// stats: 우리 선수 시즌 기록 { bat: { id: { ab, h, hr } } } (타자 소개 띠에 시즌 타율을 보여 준다). 없으면 능력치를 보여 준다
// startMatch(육성모드): 미리 내 첫 장면까지 돌려 둔 경기. 있으면 새로 만들지 않고 거기서 이어 간다
export function showGame(root, { userTeam, cpuTeam, lineup, innings, cpuStarterId, title, net = null, cpuLineup = null, practice = null, stats = null, perks = null, raise = null, startMatch = null, season = null }, onExit) {
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
  else preloadPractice();
  const soloPitch = !!practice && practice.kind === 'pitch';   // 투구 연습: 타자 없이 던지고 제구만 본다
  // 불방망이·응원 열기: 내가 하는 일반 경기에서만(연습·1:1 대결은 없다)
  const heatOn = !practice && !net;
  let rallyShown = -1;           // 응원 폭발을 알린 때의 기록 길이(같은 폭발을 두 번 알리지 않는다)
  // 화면 연출 상태: 이번 타석 투구 위치(번호 점), 방금 공의 구속 표시, 타자 소개를 마지막으로 띄운 타석, 지난 점수(바뀌면 반짝)
  let paDots = [], dotsClear = false, speedTag = null, introKey = '', lastScore = null;
  // 조작 안내: 처음 몇 번만 길게, 익숙해지면 짧게(폰에 횟수를 남긴다)
  const HINT_KEY = 'baseball.hints.v1', HINT_FULL = 4;
  let hints = { bat: 0, pitch: 0 };
  try { hints = { ...hints, ...JSON.parse(localStorage.getItem(HINT_KEY) || '{}') }; } catch (e) { /* 저장소 막힘 */ }
  const hintSeen = k => { hints[k]++; try { localStorage.setItem(HINT_KEY, JSON.stringify(hints)); } catch (e) { /* 무시 */ } };
  const hintFull = k => hints[k] < HINT_FULL;
  let match = startMatch || createMatch({ userTeam, cpuTeam, userLineup: lineup, innings, rng, cpuStarterId, cpuLineup, heat: heatOn, perks });
  let raiseNote = null;
  let raiseFirst = !!startMatch && match.log.length > 0;   // 이어 받은 경기면 첫 장면 전에 '몇 회 · 내 타석/투구'를 한 번 보여 준다          // 육성모드: 내 선수가 어떻게 경기를 마쳤나(end / pinch / pulled / noshow)
  const condTag = id => (raise && id === raise.playerId ? ` <span class="cond">${COND_ICON[raise.cond + 2]}</span>` : '');
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
      </div>
      <span class="ctag"></span>
    </div>
    <div class="hud-r">
      <div class="hud-btns"><button class="more" aria-label="진행 메뉴"><svg viewBox="0 0 16 16"><path d="M2 3.2h12v1.8H2zM2 7.1h12v1.8H2zM2 11h12v1.8H2z"/></svg></button>
        <button class="exit" aria-label="나가기">✕</button></div>
      <div class="sub"><span class="mu"></span>${title ? `<span class="ttl">${title}</span>` : ''}</div>
    </div>
    <div class="stage"><canvas></canvas><div class="clutch-glow"></div><div class="fx-layer"></div><div class="lower3"></div><div class="linescore"></div><div class="pitch-pick"></div><div class="side-pick"></div><div class="controls"></div><div class="overlay hidden"></div><div class="cutin-layer"></div></div>
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
  let hudYv = null;
  function hudY() {
    if (hudYv == null) { const b = $('.board'); hudYv = b ? Math.round(b.offsetTop + b.offsetHeight - stage.offsetTop + 8) : 10; stage.style.setProperty('--hudy', hudYv + 'px'); }
    return hudYv;
  }
  function resize() {
    hudYv = null;
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
    // 점수가 나면 그 줄이 반짝이고 숫자가 계기판처럼 굴러 올라간다(2 → 3, 여러 점이면 한 칸씩 지나간다)
    for (const [s, cls] of [['away', '.ra'], ['home', '.rh']]) {
      const el = $(cls), v = g.score[s], was = +el.dataset.v;
      if (el.dataset.v === String(v)) continue;
      el.dataset.v = v;
      if (!lastScore || !(v > was)) { el.textContent = v; continue; }
      const nums = Array.from({ length: Math.min(v - was, 6) + 1 }, (_, i) => v - Math.min(v - was, 6) + i);
      el.innerHTML = `<span class="od" style="--n:${nums.length - 1}">${nums.map(n => `<u>${n}</u>`).join('')}</span>`;
      const row = el.parentElement; row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
    }
    lastScore = { ...g.score };
    $('.tms').dataset.bat = g.half === 'top' ? 'away' : 'home';
    $('.inn').innerHTML = `<small>${g.half === 'top' ? '▲' : '▼'}</small>${g.inning}`;
    root.querySelectorAll('.bases i').forEach((el, i) => el.classList.toggle('on', !!g.bases[i]));
    const dots = (cls, n, max) => Array.from({ length: max }, (_, i) => `<i class="${cls}${i < n ? ' on' : ''}"></i>`).join('');
    $('.bso').innerHTML = `<b>${g.balls}-${g.strikes}</b><span>${dots('o', g.outs, 2)}<em>${g.outs} OUT</em></span>`;
    $('.mu').innerHTML = soloPitch ? `<b>${mu.pitcher.name}</b> <small>· 투구 연습 ${practice.n}/${practice.goal}구</small>`
      : practice ? `<b>${mu.pitcher.name}</b> <span class="vs">vs</span> <b>${mu.batter.name}</b> <small>· 연습 ${practice.n}/${practice.goal}구</small>`
      : `<b>${mu.pitcher.name}</b>${condTag(mu.pitcher.id)} <small>${match.pitchCount[mu.pitchingSide]}구</small> <span class="vs">vs</span> <small>${g.battingIndex[mu.battingSide] + 1}번</small> <b>${mu.batter.name}</b>${condTag(mu.batter.id)}${heatOn && isHot(match.log, mu.batter.id) ? ` <span class="hot">🔥${hitsToday(match.log, mu.batter.id)}안타</span>` : ''}`;
  }
  const setControls = html => { controls.innerHTML = html; if (!['aim', 'pick'].includes(mode)) hideBullpenChip(); };
  function showMsg(text, color, ms, sub, then, hidden = false) {   // hidden: 컷인이 대신 보여 주므로 글자는 숨긴다(컷인은 터치로 건너뛴다)
    const m = { text, color, sub, hidden, at: performance.now(), then };
    m.timer = later(() => { if (msg === m) msg = null; if (then) then(); }, ms);
    msg = m;
  }
  // 컷인(홈런·피홈런·삼진) 건너뛰기: 남은 시간을 기다리지 않고 바로 다음으로. 친 손가락이 그대로 건너뛰지 않게 0.3초는 막는다
  function skipCutin() {
    const m = msg;
    if (!m || !m.hidden || performance.now() - m.at < 300) return false;
    clearTimeout(m.timer); timers = timers.filter(t => t !== m.timer);
    msg = null; cutins.clear();
    if (m.then) m.then();
    return true;
  }

  // 육성모드: 내 장면까지 넘긴다. 넘겼으면 상황을 잠깐 보여 주고 다시 nextPlay, 더 할 장면이 없으면 결과로. 처리했으면 true
  function raiseTurn() {
    const r = raiseStep(match, raise, rng);
    if (r.match !== match) {
      match = r.match; paDots = []; dotsClear = false; ball = null; play = null; speedTag = null;
      updateBoard(); setView();
    }
    const g = match.game, sc = `${cpuTeam.short} ${g.score.away} : ${g.score.home} ${userTeam.short}`;
    if (r.phase === 'steal') return askSteal(r.spot), true;
    if (r.phase === 'pull') return askPull(r), true;
    if (r.phase === 'done') {
      raiseNote = r.note; mode = 'msg'; setControls('');
      return showMsg(RAISE_NOTE[r.note] || RAISE_NOTE.end, '#9fb3cc', 1600, sc, showEnd), true;
    }
    if (!r.skipped && !raiseFirst) return false;
    raiseFirst = false;
    mode = 'msg'; setControls('');
    const where = `${g.inning}회${g.half === 'top' ? '초' : '말'}`, mine = r.pinchIn ? '🔥 대타 출전!' : raise.kind === 'bat' ? '내 타석' : '내 투구';
    showMsg(`${where} · ${mine}`, '#9fb3cc', 1300, `${sc} · ${g.outs}아웃 ${basesText(g.bases)}`, nextPlay);
    return true;
  }

  // 육성모드: 내 선발이 지쳤거나 한 이닝에 크게 맞았다 → 투수코치가 올라와 한 번 묻는다(더 던진다 / 내려간다)
  // 6회를 마치고 7회초를 시작할 때는 감독이 한 번 묻는다(why 'seventh')
  function askPull(r) {
    mode = 'pull'; setControls('');
    const p = gameLine(match.log, raise.playerId).pit, boss = r.why === 'seventh';
    const why = boss ? `6회까지 투구 수 <b>${match.pitchCount.home}개</b>` : r.why === 'tired' ? `투구 수 <b>${match.pitchCount.home}개</b> · 힘이 많이 떨어졌어요` : `지난 이닝 <b>${r.runs}실점</b>`;
    const today = p ? `오늘 ${ip(p)}이닝 · ${p.r}실점 · 삼진 ${p.so}` : '';
    const warn = boss ? '더 던지면 7회 마운드에 올라가요. 지치거나 크게 맞으면 투수코치가 다시 올라와요.'
      : `더 던지면 이 경기에선 다시 묻지 않아요. 지칠수록 구속·제구가 떨어지고, 완전히 지치거나 ${PULL_MORE_RUNS}점을 더 주면 바로 내려가요.`;
    overlay.innerHTML = `<div class="end-card menu-card pull-ask"><div class="tag">${boss ? '🎩 감독' : '🧢 투수코치 방문'}</div><h1 style="font-size:24px">${boss ? '"7회도 던져 볼래?"' : '"여기까지 할까?"'}</h1>
      <p class="hint">${why}${today ? `<br>${today}` : ''}</p>
      <p class="hint pull-warn">${warn}</p>
      <button class="primary" data-act="stay">💪 더 던진다</button>
      <button class="ghost" data-act="off">마운드를 내려간다</button></div>`;
    overlay.classList.remove('hidden');
    const answer = off => { closeOverlay(); match = raisePull(match, off, rng, r.why); nextPlay(); };
    overlay.querySelector('[data-act=stay]').onclick = () => answer(false);
    overlay.querySelector('[data-act=off]').onclick = () => answer(true);
  }

  // 육성모드: 내 타자가 1루(2루)에 나가 있다 → 다음 타자 첫 공 전에 도루할지 묻는다. 주력이 빠를수록 잘 산다
  function askSteal(spot) {
    mode = 'steal'; setControls('');
    const to = spot.base + 2, pct = Math.round(spot.p * 100);
    overlay.innerHTML = `<div class="end-card menu-card steal-ask"><div class="tag">🏃 주루</div><h1 style="font-size:24px">${to}루 도루할까요?</h1>
      <p class="hint">${basesText(match.game.bases)} · ${match.game.outs}아웃 · 성공 확률 약 <b>${pct}%</b></p>
      <button class="primary" data-act="go">🏃 도루!</button>
      <button class="ghost" data-act="stay">가만히 있기</button></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=stay]').onclick = () => { closeOverlay(); match = raiseSteal(match, raise.playerId, false, rng).match; nextPlay(); };
    overlay.querySelector('[data-act=go]').onclick = () => {
      closeOverlay();
      const prev = match.game, s = raiseSteal(match, raise.playerId, true, rng);
      mode = 'msg'; ball = null;
      const batter = matchup(match).batter;
      play = buildPlay({ event: s.ok ? 'STEAL' : 'CAUGHT_STEALING', steal: { lead: s.lead, trail: s.trail ?? null }, bats: batter.bats, bases: prev.bases, rng });
      play.sounds.sort((a, b) => a.t - b.t);
      play.start = performance.now() + 200; play.si = 0;
      play.then = () => {
        hold = matchup(match);
        match = s.match; updateBoard();
        vibrate(s.ok ? 40 : [20, 40, 20]);
        const half = match.game.half !== prev.half || match.game.inning !== prev.inning;
        showMsg(`${to}루 도루 ${s.ok ? '성공!' : '실패'}`, s.ok ? '#2ecc71' : '#e74c3c', 1500, s.ok ? '' : `${prev.outs + 1}아웃`, () => {
          play = null; hold = null;
          if (half) setView();
          nextPlay();
        });
      };
    };
  }

  // ── 진행 ──
  function nextPlay() {
    hold = null; tactic = { bunt: false, steal: false };
    if (dotsClear) { paDots = []; dotsClear = false; }
    speedTag = null;
    updateBoard();
    if (match.game.over) return showEnd();
    if (raise && raiseTurn()) return;
    updateClutch();
    showIntro();
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
      const b = matchup(match).batter, warn = heatOn && isHot(match.log, b.id) ? `<b class="r">🔥 오늘 ${hitsToday(match.log, b.id)}안타 · 조심!</b> ` : '';
      setControls(hintFull('pitch') ? `<p>${warn}스트라이크존 위를 <b>드래그</b>해서 포수 미트 위치를 정하세요</p>` : `<p>${warn}<small>드래그로 미트 위치</small></p>`);
      hintSeen('pitch');
      showBullpenChip();
    } else {
      const before = match.pitcher.away;
      match = cpuMaybeChangePitcher(match, rng);
      if (match.pitcher.away !== before) {
        updateBoard(); mode = 'msg';
        return showMsg(`${cpuTeam.short} 투수 교체`, '#9fb3cc', 1300, matchup(match).pitcher.name, nextPlay);
      }
      // 응원 폭발: 응원 열기가 꽉 찼다 → 이번 타자 한 타석 동안 배트가 커진다. 타석 전에 한 번 알린다
      if (heatOn && !auto && rallyShown !== match.log.length && rally(match.log, match.game.inning, match.game.half).full) {
        rallyShown = match.log.length; mode = 'msg';
        vibrate([50, 40, 50]);
        return showMsg('📣 응원 폭발!', '#ff922b', 1500, `${matchup(match).batter.name} · 이번 타석 배트가 커져요`, nextPlay);
      }
      mode = 'bwait';
      // 작전 칩을 누를 틈을 조금 더 준다(연습·자동 진행은 칩이 없다)
      pitchAt = performance.now() + CONFIG.WIND_CPU_MS + 700 + rng() * 900 + (practice || auto ? 0 : 500);
      setControls(auto ? '<p><b>자동 진행 중</b> · 타자가 알아서 쳐요 <small>(위 ▶▶ 버튼에서 끄기)</small></p>' : battingHint());
      if (!auto) hintSeen('bat');
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
    const bo0 = heatOn && !practice ? boostFor(match, matchup(match).batter.id, mySide, mySide) : null;
    const bo = bo0 && (bo0.hot || bo0.rally) ? bo0 : null;     // 육성 효과만 있으면 불방망이 글자는 안 띄운다
    const boost = bo ? `<b class="o">${bo.rally ? '📣 응원 폭발' : '🔥 불방망이'}</b> · ` : '';
    const sign = [tactic.bunt && '<b class="y">번트</b>', tactic.steal && '<b class="g">도루</b>'].filter(Boolean).join(' · ');
    if (tactic.bunt) return `<p>${boost}${sign} · 배트(노란 원)를 공 길에 대고 <b>손을 떼면 번트</b></p>`;
    if (!hintFull('bat') && !practice) return `<p>${boost}${sign ? sign + ' 사인! · ' : ''}<small>누른 채 조준 · 떼면 스윙</small></p>`;
    return `<p>${boost}${sign ? sign + ' 사인! · ' : ''}화면을 <b>누른 채 움직여</b> 배트(노란 원)를 공 길에 두고, <b>손을 떼면 스윙!</b></p>`;
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
    const r = soloPitch ? soloThrow(gpos, level) : playUserPitch(match, { type: pitchType, target, gaugePos: gpos, level }, rng);
    const start = performance.now() + CONFIG.WIND_USER_MS;
    const pitch = viewPitch(r.pitch);
    ball = { pitch, start, wind: CONFIG.WIND_USER_MS, arrival: start + pitch.travelMs, result: r };
    mode = 'flight';
    lastGauge = { pos: gpos, sweet: r.pitch.sweet, at: performance.now(), q: !r.pitch.onTarget ? 0 : r.pitch.err < r.pitch.sweet * 0.35 ? 2 : 1 };
    const grade = !r.pitch.onTarget ? '<b class="r">타이밍 실패 — 제구가 흔들렸어요</b>'
      : r.pitch.err < r.pitch.sweet * 0.35 ? '<b class="g">완벽한 타이밍!</b>' : '<b class="y">괜찮은 타이밍</b>';
    setControls(`<p>${grade}</p>`);
  }

  // 투구 연습 한 구: 경기 상태는 그대로, 공이 어디 꽂혔는지만(노린 곳은 aim에 남긴다)
  function soloThrow(gpos, level) {
    const mu = matchup(match);
    const pitch = computePitch({ pitcher: mu.pitcher, type: pitchType, target, gaugePos: gpos, pitchCount: 0, rng, level });
    return { match, pitch, swing: null, event: 'PRACTICE', contact: null, fly: null, style: null, runs: 0, paEnded: false, aim: { ...target } };
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
      const sw = cpuSwing({ batter: mu.batter, pitch, balls: match.game.balls, strikes: match.game.strikes, rng, prev: lastPitch(match), k: match.bat ? match.bat.k : 1 });
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
    if (k !== 'INPLAY' && k !== 'FOUL') startImpact();
    info = '';                                           // 구속·구종은 오른쪽 위 표시가 보여 준다
    if (k !== 'INPLAY' && k !== 'FOUL' && isPinpoint(r.pitch)) { lock = { at: performance.now(), x: r.pitch.plate.x, y: r.pitch.plate.y }; info = '🎯 핀포인트 제구'; }
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
    info = (r.contact.aimMiss ? '배트가 공 길에서 벗어났어요' : r.contact.bunt && k !== 'MISS' ? '번트' : `${diff < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(diff))}ms`);
    if (k === 'MISS') { playSound('whiff'); ball.result = r; return; }   // 공은 미트까지 날아간 뒤 판정
    const q = r.contact.quality;
    if (r.event === 'HR') playSound('homerun', { crowd: !practice });   // 맞는 순간 관중이 일어난다(받은 녹음 전체)
    else playSound(k === 'FOUL' ? 'foul' : 'hit', { q });
    vibrate(k === 'INPLAY' && q > 0.8 ? 70 : 35);
    shake(cv, r.contact.bunt ? 2 : k === 'INPLAY' ? 4 + q * 8 : 3);
    // 타이밍이 완벽한 정타: 맞는 순간 화면을 STOP_MS 멈췄다가 터트린다(타구·장면도 그만큼 늦게 출발)
    const perfect = !!bat && k === 'INPLAY' && !r.contact.bunt && Math.abs(diff) <= graceMs(bat.level) * PERFECT_K && q >= HIT_GOOD_Q;
    if (perfect) { startPerfect(); info = `PERFECT · ${info}`; }
    if (!r.contact.bunt) startHitFx(k === 'INPLAY' ? (r.event === 'HR' || q >= CONFIG.BALANCE.HR_Q ? 2 : q >= HIT_GOOD_Q ? 1 : 0) : 0);
    if (perfect) hitFx.at = freeze.until;
    ball.hitAt = perfect ? freeze.until : performance.now(); ball.contact = r.contact;
    apply(r, false);
    if (perfect && play) play.start += STOP_MS;
  }

  function takePitch() {
    if (net && !ball.result) {                           // 안 쳤다고 서버에 알리고 판정을 기다린다
      if (!ball.sent) { ball.sent = true; net.conn.send({ t: 'take', n: netN }); }
      mode = 'netwait'; return;
    }
    playSound('mitt', { speed: ball.pitch.speedKmh });
    const r = ball.result || resolveUserSwing(match, ball.pitch, null, rng, null, tactic);
    if (!ball.swung) info = '';
    apply(r, false);
  }

  // 결과 반영: 인플레이면 타구 화면 → 결과, 아니면 바로 결과
  function apply(r, userPitched) {
    mode = 'msg';
    if (ball && ball.pitch) speedTag = { v: ball.pitch.speedKmh, k: ball.pitch.type, name: PITCH_TYPES[ball.pitch.type].name, at: performance.now() };
    const prev = match.game;
    const res = { r };                                  // 수비 조작으로 결과가 바뀌면 res.r을 갈아 끼운다
    const finish = () => settle(prev, res.r, userPitched);
    const batter = matchup(match).batter;
    if (r.steal && !practice) {                         // 도루: 판정 전에 주자가 뛰고 포수가 던지는 장면
      play = buildPlay({ event: r.steal.ok ? 'STEAL' : 'CAUGHT_STEALING', steal: { lead: r.steal.lead, trail: r.steal.trail ?? null },
        bats: batter.bats, bases: prev.bases, rng });
      play.sounds.sort((a, b) => a.t - b.t);
      play.start = performance.now() + 200; play.si = 0;
      play.then = finish;
      return;
    }
    if (['BALL', 'STRIKE', 'FOUL', 'HBP', 'WILD', 'BUNT_FOUL', 'PRACTICE'].includes(r.event)) return finish();
    // 내가 친 타구가 다이빙 상황(호수비·텍사스 안타)이면 상대 수비수는 CPU_DIVE 확률로만 잡는다
    if (!userPitched && !practice && !net && ball && ball.pitch) {
      const ch = fieldChance(r, prev.bases);
      if (ch && ch.kind === 'dive') {
        const o = rng() < CPU_DIVE ? ch.good : r.event === 'SINGLE' ? null : ch.bad;   // 못 잡으면: 원래 안타는 그대로, 호수비는 다이빙 실패 안타로
        if (o) { r = applyDecision(match, ball.pitch, { event: o.event, contact: r.contact, fly: o.fly, style: o.style, swung: true }); delete r.pitch; delete r.swing; res.r = r; }
      }
    }
    // 대결이면 서버가 준 씨앗으로: 두 폰에서 같은 장면이 나온다
    play = (userPitched && fieldOn() && fieldScene(r, batter, prev, res))
      || buildPlay({ event: r.event, fly: r.fly, style: r.style, contact: r.contact, bats: batter.bats, bases: prev.bases, rng: r.seed != null ? createRng(r.seed) : rng, run: batter.speed });
    if (practice) play = practicePlay(play);            // 연습장: 수비수·주자 없이 공만
    play.sounds.sort((a, b) => a.t - b.t);
    play.start = performance.now() + 320; play.si = 0;
    play.then = finish;
  }

  // ── 수비 조작 ──
  // 아슬아슬한 수비면 성공/실패 두 장면을 같은 씨앗으로 만들어 둔다(터치할 순간까지 똑같다). 성공 장면부터 보여 주고,
  // 링이 나타나면 장면이 느려진다. 터치(또는 시간 초과)하는 순간 둘 중 하나로 갈아 끼우고 경기 결과도 그에 맞게 다시 정한다
  const fieldOn = () => !!prefs.fielding && !practice && !net && !auto;
  const FC_SLOW = 0.32;                                  // 링이 떠 있는 동안 장면은 0.32배 느리게
  const fcLead = kind => (kind === 'dive' ? 300 : 420);  // 터치할 순간 몇 ms(장면 시간) 전부터 링이 뜨나 — 다이빙은 더 짧게
  const FC_NAME = { dive: '다이빙!', throw: '1루 송구!', home: '홈 송구!' };
  function fieldScene(r, batter, prev, res) {
    const ch = fieldChance(r, prev.bases);
    if (!ch || !r.pitch) return null;
    const seed = Math.floor(rng() * 2147483647);
    const mk = o => { const sc = buildPlay({ ...o, contact: r.contact, bats: batter.bats, bases: prev.bases, rng: createRng(seed), run: batter.speed }); sc.sounds.sort((a, b) => a.t - b.t); return sc; };
    const good = mk(ch.good), bad = mk(ch.bad);
    if (!good.chance || !bad.chance || Math.min(good.chance.until, bad.chance.until) - good.chance.t < 0.12) return null;
    good.fc = { kind: ch.kind, ch, good, bad, res, pitch: r.pitch, contact: r.contact, tHit: toMs(good.chance.t), state: 'wait' };
    return good;
  }
  function fieldTick(now) {
    const f = play.fc, ms = now - play.start;
    if (!f.r0) {
      if (ms < f.tHit - fcLead(f.kind)) return;
      f.r0 = now; f.s0 = ms; f.hitAt = now + (f.tHit - ms) / FC_SLOW;
      vibrate(15);
    }
    play.start = now - (f.s0 + (now - f.r0) * FC_SLOW);
    if (now > f.hitAt + fieldWin(lvl(), f.kind)) decideField(null);
  }
  // err: 링이 겹친 순간과의 차이(ms, 빠르면 음수). null = 안 눌렀다
  function decideField(err) {
    const f = play && play.fc;
    if (!f || f.state !== 'wait') return;
    const grade = judgeTap(err, lvl(), f.kind), ok = grade !== 'miss', now = performance.now(), ms = now - play.start;
    const next = ok ? f.good : f.bad, o = ok ? f.ch.good : f.ch.bad;
    Object.assign(f, { state: 'done', grade, err, at: now });
    Object.assign(next, { fc: f, start: play.start, then: play.then, landed: false, si: 0 });
    while (next.si < next.sounds.length && toMs(next.sounds[next.si].t) <= ms) next.si++;
    play = next;
    f.res.r = applyDecision(match, f.pitch, { event: o.event, contact: f.contact, fly: o.fly, style: o.style, swung: true });
    const off = err == null ? '' : ` ${err < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(err))}ms`;
    info = ok ? `${grade === 'perfect' ? '완벽한 수비!' : '좋은 수비!'}${off}` : err == null ? '수비 터치를 놓쳤어요' : `수비 타이밍${off}`;
    vibrate(ok ? 40 : [20, 40, 20]);
  }
  function drawFieldPrompt(now) {
    const f = play.fc, cx = W / 2, cy = H * 0.7, R0 = Math.max(24, Math.min(W, H) * 0.075), GROW = 2.2;
    const say = (t, x, y, size, color, w = 5) => {
      ctx.font = `900 ${size}px system-ui,sans-serif`; ctx.lineWidth = w; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
    };
    const ring = (r, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2); ctx.stroke(); };
    ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    if (f.state === 'wait' && !f.r0) {
      say('🧤 수비 준비', cx, cy + 6, 16, `rgba(255,255,255,${0.6 + 0.4 * Math.sin(now / 110)})`, 4);
    } else if (f.state === 'wait') {
      const span = f.hitAt - f.r0, k = (f.hitAt - now) / span, band = fieldWin(lvl(), f.kind) * R0 * GROW / span;
      ctx.fillStyle = 'rgba(6,13,26,.38)'; ctx.beginPath(); ctx.arc(cx, cy, R0 * (1 + GROW) + 8, 0, Math.PI * 2); ctx.fill();
      ring(R0, 'rgba(46,204,113,.42)', band * 2);                 // 성공 구간
      ring(R0, '#a8ffcb', 3);                                     // 겹쳐야 할 원
      ring(R0 + k * R0 * GROW, `rgba(255,255,255,${Math.min(1, (1 - k) * 4)})`, 4);   // 줄어드는 링
      say(FC_NAME[f.kind], cx, cy - R0 * (1 + GROW) - 14, 24, '#ffd43b');
      ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fillText('링이 초록 원에 겹칠 때 터치', cx, cy + R0 * (1 + GROW) + 24);
    } else {
      const t = (now - f.at) / 800;
      if (t < 1) {
        const ok = f.grade !== 'miss', color = f.grade === 'perfect' ? '#ffd43b' : ok ? '#51cf66' : '#ff6b6b';
        ctx.globalAlpha = 1 - t * t;
        ring(R0 * (1 + t * 0.8), color, 5 * (1 - t) + 1);
        const s = t < 0.15 ? 1.5 - t / 0.15 * 0.5 : 1;
        ctx.translate(cx, cy + 9); ctx.scale(s, s);
        say(f.grade === 'perfect' ? '완벽!' : ok ? '좋아요!' : f.err == null ? '놓쳤다!' : f.err < 0 ? '빨랐다!' : '늦었다!', 0, 0, 26, color);
      }
    }
    ctx.restore();
  }

  // 이번 공으로 생긴 기록 메달: 경기 기록(연속 삼진·3구 삼진·연속 홈런…) + 개인 최고(구속·비거리·한 경기 탈삼진)
  function medalsFor(prev, r, userPitched, logN, hrM, delay) {
    const ms = [], paDone = match.log.length > logN, e = paDone ? match.log[match.log.length - 1] : null;
    if (paDone) ms.push(...highlightsOf(match.log, mySide));
    if (paDone && season && !practice) ms.push(...seasonMilestones(match.log, season.id, season));   // 육성모드 시즌 이정표
    const qs = practice ? null : qualityStart(match.log, mySide, prev, match.game, innings);
    if (qs) ms.push(qs);
    if (!net && !auto && hold) {
      const best = { rec: true, en: 'NEW PERSONAL BEST' };
      if (userPitched && ball && ball.pitch && ball.pitch.speedKmh) {
        const b = tryRecord('velo', hold.pitcher.id, ball.pitch.speedKmh);
        if (b) ms.push({ ...best, who: hold.pitcher.id, big: String(b.value), unit: 'km', label: '개인 최고 구속', sub: `이전 최고 ${b.prev}km` });
      }
      if (!userPitched && hrM) {
        const b = tryRecord('hr', hold.batter.id, hrM);
        if (b) ms.push({ ...best, who: hold.batter.id, big: String(b.value), unit: 'm', label: '개인 최장 홈런', sub: `이전 최장 ${b.prev}m` });
      }
      if (e && userPitched && e.event === 'STRIKEOUT') {
        const n = match.log.filter(q => q.pitcherId === e.pitcherId && q.event === 'STRIKEOUT').length, b = tryRecord('k', e.pitcherId, n, 6);
        if (b) { ms.splice(0, ms.length, ...ms.filter(m => m.today == null)); ms.push({ ...best, who: e.pitcherId, big: String(n), unit: 'K', label: '한 경기 최다 탈삼진', sub: `이전 최다 ${b.prev}개` }); }
      }
    }
    ms.slice(0, 3).forEach(m => queueMedal(m, delay));
  }

  function settle(prev, r, userPitched) {
    hold = matchup(match);
    const logN = match.log.length;
    match = r.match;
    if (ball && ball.pitch) paDots.push({ x: ball.pitch.plate.x, y: ball.pitch.plate.y, k: ball.pitch.type, n: paDots.length + 1 });
    if (match.log.length > logN || practice || match.game.half !== prev.half) dotsClear = true;   // 타석이 끝났다 → 다음 타석에 지운다
    if (practice) {                                     // 연습: 점수를 쌓고, 아웃·주자·이닝은 매번 되돌린다
      practice.n++; practice.pts += r.aim ? controlGrade(ball.pitch, r.aim).pts : swingPts(r.contact);
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
    }
    const cg = r.aim ? controlGrade(ball.pitch, r.aim) : null;   // 투구 연습: 제구 평가만
    if (cg) label = cg.label;
    else if (!practice) crowd(prev, r, userPitched);
    const good = r.steal && !userPitched ? r.steal.ok
      : userPitched ? (r.event === 'STRIKE' || OUTS.includes(r.event) || r.event === 'SINGLE_HOME_OUT') : (HITS.includes(r.event) || FREE.includes(r.event) || r.event === 'SAC_BUNT');
    const color = cg ? ['#e74c3c', '#ffd43b', '#2ecc71', '#2ecc71'][cg.q] : r.event === 'FOUL' ? '#ffffff' : good ? '#2ecc71' : '#e74c3c';
    // 불방망이: 이번 안타로 그 경기 2안타 이상이 됐다
    const nh = heatOn && match.log.length > logN && HIT_PA.includes(match.log[match.log.length - 1].event) ? hitsToday(match.log, hold.batter.id) : 0;
    const fire = nh >= 2 ? (nh === 2 ? '🔥 불방망이!' : `🔥 오늘 ${nh}안타!`) : '';
    // 홈런 비거리(타구 장면에서 잰 값). 경기 기록에도 남긴다
    const hrM = r.event === 'HR' && play && play.distM ? play.distM : 0;
    if (hrM && match.log.length > logN) match = { ...match, log: [...match.log.slice(0, -1), { ...match.log[match.log.length - 1], dist: hrM }] };
    const sub = [r.runs && !practice ? `${r.runs}점 득점!` : '', hrM ? `비거리 ${hrM}m` : '', info, fire].filter(Boolean).join(' · ');
    const g = match.game;
    const halfOver = !g.over && (g.half !== prev.half || g.inning !== prev.inning);
    updateBoard();
    // 컷인: 내가 친 홈런·맞은 홈런·내가 잡은 삼진. 연습·자동 진행에서는 건너뛴다
    const cut = !practice && !auto ? cutinFor(r, prev, userPitched) : null;
    const far = hrM ? ` · ${hrM}m` : '';
    if (cut) cutins.play(cut, { sub: cut === 'homerun' ? (HR_NAME[r.runs] || '홈런!!') + far : cut === 'homerun_bad' ? (HR_NAME[r.runs] || '피홈런') + far : '' });
    // 내가 타자일 때는 공 하나하나 결과(볼·스트라이크·파울·타구 결과)를 절반만 보여 줘서 빨리 다음 공으로(홈런·컷인은 그대로)
    // 내가 투수일 때도 볼·스트라이크·파울처럼 타석이 이어지는 공은 짧게, 타석이 끝난 결과(아웃·안타·볼넷 등)는 길게
    let msgMs = cut ? CUT_MS[cut] : r.event === 'HR' ? 2000 : userPitched && match.log.length > logN ? 1300 : 650;
    // 끝내기·역전: 컷인이 있으면 컷인 다음에, 없으면 지금 바로(그동안 결과 글자는 기다린다)
    const swingK = practice ? null : scoreSwing(prev, g, mySide, prev.half);
    let bigLater = null;
    if (swingK) { if (cut) bigLater = swingK; else { showBigScore(swingK, prev, g); msgMs = Math.max(msgMs, BIG_MS[swingK]); } }
    if (!practice) {
      greatPlay(r, prev);                               // 호수비 카드
      if (!g.over) medalsFor(prev, r, userPitched, logN, hrM, (cut ? CUT_MS[cut] : 250) + (swingK ? BIG_MS[swingK] : 0));
    }
    showMsg(label, color, msgMs, sub, afterMsg, !!cut);
    function afterMsg() {
      if (bigLater) { const k = bigLater; bigLater = null; showBigScore(k, prev, g); return later(afterMsg, BIG_MS[k]); }
      if (practice && practice.n >= practice.goal) return finishPractice();
      if (match.game.over) return showEnd();
      if (halfOver) {
        play = null; ball = null;
        const was = todAt(prev.inning).phase, now = todAt(g.inning).phase;
        const note = now !== was ? (now === 'night' ? ' · 조명이 켜졌어요' : now === 'dusk' ? ' · 해가 지고 있어요' : '') : '';
        showLineScore(2300, prev);
        return showMsg('공수교대', '#9fb3cc', 2300, `${g.inning}회${g.half === 'top' ? '초' : '말'}${note}`, nextPlay);
      }
      nextPlay();
    }
  }

  // 홈 관중(우리 팀 팬)의 반응. 홈런은 친 순간·넘어가는 순간에 따로 낸다
  // 관중 함성은 드물게: 우리 안타(홈런은 맞는 순간 긴 함성), 내가 잡은 삼진, 승리 때만
  function crowd(prev, r, userPitched) {
    const ev = r.event;
    if (ev === 'HR') return;
    if (!userPitched && HITS.includes(ev)) playSound('yell', { gain: r.runs ? 1 : 0.8 });
    else if (userPitched && (ev === 'STRIKE' || ev === 'BUNT_FOUL') && prev.strikes === 2) playSound('yell', { gain: 0.75 });
  }
  // 타구 장면 속 소리: 야수가 공을 잡는 소리, 홈런 공이 담장을 넘는 순간(우리 홈런이면 축하 음악, 상대면 탄식)
  function playCue(name) {
    if (name === 'mitt') return playSound('catch');
    if (name === 'ooh') return;                         // 호수비·아슬아슬한 장면의 '오~'는 뺐다(너무 잦다)
    if (name === 'cheer') return shownMu().battingSide === mySide ? playSound('jingle') : undefined;
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
    mode = 'end'; $('.more').hidden = true; $('.game').classList.add('ended');
    $('.game').classList.remove('clutch', 'pinch');   // 점수판·단추는 숨기고 결과 카드만
    const g = match.game;
    const won = g.result === mySide;
    const res = won ? '승리' : g.result === 'home' || g.result === 'away' ? '패배' : '무승부';
    // MVP · 이닝별 점수표 · 우리 타자 성적표
    const nameOf = id => {
      for (const s of ['home', 'away']) {
        const t = match.teams[s], b = t.batters.find(q => q.id === id), p = b || t.pitchers.find(q => q.id === id);
        if (p) return { name: p.name, team: t, p, kind: b ? 'b' : 'p' };
      }
      return { name: '?', team: userTeam, p: null };
    };
    const myIds = new Set([...match.teams[mySide].batters, ...match.teams[mySide].pitchers].map(p => p.id));
    const mvp = gameMvp(match.log, { mine: id => myIds.has(id), userSide: mySide, result: g.result });
    const who = mvp && nameOf(mvp.id);
    // 중계 마지막 장면: FINAL 꼬리표 → 큰 결과 → 두 팀 색 점수 띠 → 이닝 표 → MVP 자막
    const mvpHtml = mvp ? `<div class="fin-mvp" style="--c:${who.team.colors.main}"><em>MVP</em>${who.p ? face(who.p, who.kind) : ''}<div><small>GAME MVP · ${who.team.short}</small><b>${who.name}</b><p>${mvp.text}</p></div></div>` : '';
    const T = match.teams, sa = g.score.away, sh = g.score.home;
    const sb = `<div class="fin-sb"><div class="${sa < sh ? 'l' : ''}" style="--c:${T.away.colors.main}">${T.away.short}<b>${sa}</b></div>
      <span>FINAL<small>${g.inning}회</small></span><div class="${sh < sa ? 'l' : ''}" style="--c:${T.home.colors.main}"><b>${sh}</b>${T.home.short}</div></div>`;
    const line = playerLine({}, match.log).bat, order = match.lineups[mySide].order;
    const box = order.map(id => { const b = line[id], p = nameOf(id);
      return b ? `<tr class="${b.h ? 'h' : ''}"><td>${p.name}</td><td>${b.ab}-${b.h}</td><td>${b.hr || ''}</td><td>${b.rbi || ''}</td></tr>` : `<tr><td>${p.name}</td><td>-</td><td></td><td></td></tr>`; }).join('');
    overlay.innerHTML = `<div class="end-card fin ${won ? 'win' : res === '패배' ? 'lose' : ''}">
      <span class="fin-tag">FINAL · ${g.inning}회</span><h1>${res}</h1>
      ${sb}
      ${lineScoreHtml()}
      ${mvpHtml}
      <details class="box"><summary>${match.teams[mySide].short} 타자 성적</summary><table><tr><th>타자</th><th>타수-안타</th><th>홈런</th><th>타점</th></tr>${box}</table></details>
      <div class="fin-act"><button class="primary" data-act="menu">계속</button>
      <button class="ghost" data-act="log">경기 기록 보기</button></div></div>`;
    overlay.classList.remove('hidden');
    overlay.querySelector('[data-act=log]').onclick = () => showLog(match.log, '경기 기록', showEnd);
    if (won) { playSound('yellBig'); playSound('jingle'); vibrate([80, 60, 80, 60, 160]); cutins.play('win'); }
    overlay.querySelector('[data-act=menu]').onclick = () => (net ? exit() : exit({
      home: g.score.home, away: g.score.away, log: match.log, starterId: lineup.starterId, ...(raise ? { raise: { note: raiseNote || 'end' }, steals: match.steals || [] } : {}) }));
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
    // 세 묶음: 진행(자동·넘기기·기록) / 설정(스위치) / 소리(스위치 + 크기 바). 켜고 끄는 것은 스위치로, 되돌릴 수 없는 넘기기는 빨간 글씨로
    const sw = (a, label, desc, on) => `<button class="mc-row" data-act="${a}" role="switch" aria-checked="${!!on}"><span><b>${label}</b>${desc ? `<small>${desc}</small>` : ''}</span><i class="swt"></i></button>`;
    const snd = (a, label, key, on) => `<div class="mc-snd${on ? '' : ' off'}">${volRow('', label, key, prefs[key])}<button class="mc-sw" data-act="${a}" role="switch" aria-checked="${!!on}" aria-label="${label} 켜기"><i class="swt"></i></button></div>`;
    const levelDesc = { easy: '배트가 크고 잘 맞아요. 제구 게이지의 초록 구간이 넓고 느려요', normal: '배트가 작고, 제구 게이지가 좁고 빨라요. 공이 올 길은 대략 보여 줘요(선구안이 좋을수록 정확)', hard: '배트가 더 작고 궤적 안내가 없어요. 제구 게이지가 가장 좁고 빨라요' }[lvl()];
    overlay.innerHTML = `<div class="end-card menu-card">
      <div class="tag">${g.inning}회${g.half === 'top' ? '초' : '말'} · 진행 메뉴</div>
      ${net || raise ? '' : `<button class="primary" data-act="auto">${auto ? '자동 진행 끄기' : '자동 진행 켜기'}</button>
      <p class="hint">투수가 알아서 던지고, 타자가 알아서 칩니다</p>`}
      ${net ? '' : raise ? '<button class="ghost" data-act="game">남은 경기 자동으로 끝내기</button>' : `<div class="row2"><button class="ghost" data-act="half">이번 ${userPitching() ? '수비' : '공격'} 넘기기</button>
        <button class="ghost" data-act="inning">이번 이닝 넘기기</button></div>
      <button class="ghost danger" data-act="game">이번 경기 넘기기</button>`}
      <button class="ghost" data-act="log">경기 기록 보기</button>
      <div class="mc-h">설정</div>
      <div class="mc-list">
        <button class="mc-row" data-act="level"${net ? ' disabled' : ''}><span><b>난이도</b><small>${net ? '1:1 대결은 방을 만든 사람이 정한 난이도로 둘 다 같게 해요. ' : ''}${levelDesc}</small></span><em>${LEVEL_NAME[lvl()]}</em></button>
        ${sw('guide', '궤적 안내', '공이 올 길을 미리 보여 줘요', prefs.guide)}
        ${net ? '' : sw('fielding', '수비 조작', '아슬아슬한 수비(다이빙 캐치·1루 송구·홈 송구)에서 링이 초록 원에 겹칠 때 터치하면 아웃. 끄면 컴퓨터가 정해요', prefs.fielding)}
      </div>
      <div class="mc-h">소리</div>
      <div class="mc-list">${snd('sfx', '효과음', 'sfxVol', prefs.sfx)}${snd('amb', '관중·응원', 'ambVol', prefs.amb)}</div>
      <button class="ghost" data-act="close">닫기</button></div>`;
    overlay.classList.remove('hidden');
    const on = (a, fn) => { const el = overlay.querySelector(`[data-act=${a}]`); if (el) el.onclick = fn; };
    on('auto', () => {
      auto = !auto; closeOverlay();
      // 조준·구종 고르기·타석 대기 중(또는 자동 투구 대기 중)이면 바로 바뀐 방식으로 다시 시작
      if (['aim', 'pick', 'gauge', 'bwait'].includes(mode) || (mode === 'msg' && !msg && !play && !ball)) nextPlay();
    });
    on('guide', () => { prefs = { ...prefs, guide: !prefs.guide }; savePrefs(prefs); closeOverlay(); showMenu(); });
    on('fielding', () => { prefs = { ...prefs, fielding: !prefs.fielding }; savePrefs(prefs); closeOverlay(); showMenu(); });
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
    paDots = []; dotsClear = false; speedTag = null;
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
        <div class="out${good ? ' g' : ''}">${paName(l)}${l.dist ? ` <small>${l.dist}m</small>` : ''}${l.runs ? ` · <b>${l.runs}점</b> <small>(${cpuTeam.short} ${l.score.away} : ${l.score.home} ${userTeam.short})</small>` : ''}</div>
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
    if (confirm(net ? '대결을 그만둘까요? 상대 화면에서도 경기가 끝나요' : practice ? '연습을 그만둘까요? (중간에 나가면 경험치가 쌓이지 않아요)' : raise ? '경기를 그만둘까요? (이 경기는 없던 일이 되고, 오늘 경기를 다시 할 수 있어요)' : '경기를 그만둘까요? (시즌 경기는 기록되지 않고 다시 할 수 있어요)')) exit();
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
    if (cdown) return cdown.done();                     // 경기 시작 카운트다운 건너뛰기
    if (mode === 'bflight' && auto) return;
    if (skipCutin()) return;                            // 홈런·삼진 컷인 건너뛰기
    if (mode === 'gauge') throwUserPitch(e.timeStamp);
    else if ((mode === 'bwait' || mode === 'bflight') && !auto) startBatDrag(e);
    else if (play && play.fc && play.fc.state === 'wait') { if (play.fc.r0) decideField(e.timeStamp - play.fc.hitAt); }   // 수비 조작(링 전에는 무시)
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
  // 제구 게이지: 투수 오른쪽에 큰 야구공. 공의 오른쪽 실밥(')' 모양 호)을 따라 손가락 자리가 아래 끝(0) ↔ 위 끝(1)을 오가고, 가운데(0.5)가 한가운데.
  // 실밥 색: 초록 = 제구 성공 구간(sweet), 밝은 민트 = 완벽, 노랑 = 아깝다, 빨강 = 실패. 던진 뒤 잠깐(GAUGE_HOLD_MS) 멈춘 자리를 결과 색으로 반짝인다
  let lastGauge = null;
  const GAUGE_HOLD_MS = 550, ARC = 0.75, SEAM_N = 14;   // ARC: 실밥 호가 위아래로 벌어진 각도(라디안), SEAM_N: 실밥 수
  // 게이지 자리: 투수 몸 오른쪽(화면 밖으로 나가지 않게). 구종 칩도 여기 뜬다
  // R: 예전 반원 크기(구종 칩 자리 기준). 공 반지름 rb, 실밥 호는 중심 (sx, cy)·반지름 rs — 호의 가장 오른쪽이 예전 반원 오른쪽 끝(cx + R)
  function gaugeSpot() {
    const pa = pitcherAnchor(V, matchup(match).pitcher.throws);
    const R = Math.min(H * 0.12, W * 0.2), lw = Math.max(10, R * 0.17), rb = R * 0.92, rs = rb * 1.44;
    const cx = Math.min(pa.x + pa.scale * 40, W - R - rb * 0.6 - 8), cy = Math.min(pa.y - pa.scale * 120, H - rb - 10);
    const bx = cx + R - rb * 0.4;
    return { R, lw, cx, cy, rb, rs, bx, sx: bx - rb * 1.04 };
  }
  const seamZone = (p, sw) => { const e = Math.abs(p - 0.5) * 2; return e <= sw * 0.35 ? 3 : e <= sw ? 2 : e <= sw * 2 ? 1 : 0; };
  const SEAM_COL = ['#c8242a', '#f1c40f', '#2ecc71', '#a8ffcb'];
  function drawGauge(now) {
    let pos, sw, alpha = 1, q = -1;
    if (mode === 'gauge') {
      const mu = matchup(match);
      sw = sweetWidth(mu.pitcher.control, mu.fatigue, lvl()); pos = gaugePos(now - gaugeStart, period);
    } else if (lastGauge && now - lastGauge.at < GAUGE_HOLD_MS && V.kind === 'pitcher') {
      ({ pos, sweet: sw, q } = lastGauge); alpha = 1 - Math.max(0, (now - lastGauge.at) / GAUGE_HOLD_MS - 0.5) * 2;
    } else return;
    const { cy, lw, rb, rs, bx, sx } = gaugeSpot();
    const ang = p => ARC - 2 * ARC * p;              // p = 0 아래, 1 위 (화면은 y가 아래로 커진다)
    const at = (p, r = rs) => [sx + Math.cos(ang(p)) * r, cy + Math.sin(ang(p)) * r];
    ctx.save(); ctx.globalAlpha = alpha;
    // 공: 가죽 바탕 + 그림자
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
    const lg = ctx.createRadialGradient(bx - rb * 0.3, cy - rb * 0.35, rb * 0.1, bx, cy, rb);
    lg.addColorStop(0, 'rgba(255,255,255,.96)'); lg.addColorStop(0.6, 'rgba(226,219,205,.93)'); lg.addColorStop(1, 'rgba(168,158,142,.93)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(bx, cy, rb, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // 반대쪽 실밥(장식)과 게이지 실밥 선
    ctx.lineCap = 'round'; ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(200,36,42,.45)'; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(bx + rb * 1.04, cy, rs, Math.PI - ARC * 0.75, Math.PI + ARC * 0.75); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(200,36,42,.4)'; ctx.beginPath(); ctx.arc(sx, cy, rs, ang(1), ang(0)); ctx.stroke();
    // 성공 구간은 실밥 밑에 은은한 빛
    const glow = (p0, p1, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(sx, cy, rs, ang(p1), ang(p0)); ctx.stroke(); };
    glow(0.5 - sw / 2, 0.5 + sw / 2, 'rgba(46,204,113,.28)', lw * 1.5);
    glow(0.5 - sw * 0.175, 0.5 + sw * 0.175, 'rgba(168,255,203,.45)', lw * 1.5);
    // 실밥: V자 바늘땀. 구간 색으로
    const st = lw * 0.62;
    for (let k = 0; k < SEAM_N; k++) {
      const p = (k + 0.5) / SEAM_N, t = ang(p), [x, y] = at(p), nx = Math.cos(t), ny = Math.sin(t), tx = -ny, ty = nx, z = seamZone(p, sw);
      ctx.strokeStyle = SEAM_COL[z]; ctx.lineWidth = 3;
      if (z >= 2) { ctx.shadowColor = '#2ecc71'; ctx.shadowBlur = 6; }
      ctx.beginPath(); ctx.moveTo(x - nx * st + tx * 3, y - ny * st + ty * 3); ctx.lineTo(x - tx * 2, y - ty * 2); ctx.lineTo(x + nx * st + tx * 3, y + ny * st + ty * 3); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    const [mx, my] = at(0.5, rs + lw * 1.1);          // 한가운데 눈금(공 바깥)
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + lw * 0.6, my); ctx.stroke();
    // 손가락 자리: 지금 구간 색으로 빛나는 점. 움직일 때는 잔상
    const tone = SEAM_COL[seamZone(pos, sw)];
    if (q < 0) for (let k = 4; k >= 1; k--) {
      const [x, y] = at(gaugePos(now - gaugeStart - k * 22, period));
      ctx.fillStyle = `rgba(255,255,255,${0.2 - k * 0.04})`; ctx.beginPath(); ctx.arc(x, y, lw * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    const [fx, fy] = at(pos), fr = lw * 1.05;
    const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    fg.addColorStop(0, 'rgba(255,255,255,.95)'); fg.addColorStop(0.5, tone); fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.shadowColor = tone; ctx.shadowBlur = 14; ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (q >= 0) {                                    // 던진 뒤: 결과 색 고리가 퍼진다
      const t = (now - lastGauge.at) / GAUGE_HOLD_MS;
      ctx.strokeStyle = ['#ff6b5e', '#2ecc71', '#ffd75e'][q]; ctx.lineWidth = 3; ctx.globalAlpha = alpha * (1 - t);
      ctx.beginPath(); ctx.arc(fx, fy, lw * (0.9 + t * 2), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function drawHUD() {
    const mu = shownMu(), p = mu.pitcher, pc = match.pitchCount[mu.pitchingSide];
    const left = energy(pc, p.stamina), f = fatigue(pc, p.stamina);
    const hy = hudY();                                   // 왼쪽 위 점수판(방송 박스) 바로 아래부터
    panel(10, hy, 124, 38);
    ctx.font = '700 11.5px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e4ecf6';
    ctx.fillText(`${p.name} 체력${f > 0 ? ' · 지침' : ''}`, 18, hy + 15);
    const fc = f > 0.5 ? '#ff6b6b' : f > 0 ? '#ffd43b' : '#51cf66';
    bar(18, hy + 23, 108, 6, left, fc);
    if (heatOn && !userPitching() && !match.game.over) drawRally();
    drawSpeed(); return;                                 // 주자는 점수판 박스에 있다(예전 오른쪽 위 작은 다이아몬드는 그리지 않는다)
    const cx = W - 36, cy = 30, d = 11, bases = match.game.bases;
    panel(cx - 26, cy - 21, 52, 36);
    [[cx + d, cy], [cx, cy - d], [cx - d, cy]].forEach(([x, y], i) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      if (bases[i]) { ctx.shadowColor = 'rgba(255,212,59,.8)'; ctx.shadowBlur = 8; }
      ctx.fillStyle = bases[i] ? '#ffd43b' : 'rgba(255,255,255,.22)'; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    });
    drawSpeed();
  }
  // 중계 그래픽 같은 반투명 판(둥근 모서리 + 얇은 테두리 + 위쪽이 조금 밝다)
  function panel(x, y, w, h, r = 9) {
    ctx.save();
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(22,36,60,.78)'); gr.addColorStop(1, 'rgba(6,13,26,.72)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
    ctx.restore();
  }
  function bar(x, y, w, h, k, color) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
    if (k > 0) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * k), h, h / 2); ctx.fill(); }
    ctx.restore();
  }
  // 방금 공의 구속·구종(오른쪽 위, 메뉴·나가기 단추와 대결 자막 아래). 2.4초 동안 보이고 사라진다
  // 오른쪽 위 HUD 높이는 자막 줄 수·화면 크기에 따라 달라서, 공마다 한 번 재서 그 아래에 둔다
  const hudRY = () => { const r = $('.hud-r'); return r ? Math.round(r.offsetTop + r.offsetHeight - stage.offsetTop + 8) : 54; };
  function drawSpeed() {
    if (!speedTag) return;
    const t = performance.now() - speedTag.at;
    if (t > 2400) return;
    if (speedTag.y == null) speedTag.y = Math.max(54, hudRY());
    const a = Math.max(0, Math.min(1, t / 120, (2400 - t) / 300));
    // 단계: 0 보통 · 1 강속구(150km~, 주황 + 불꽃) · 2 MAX(160km~, 빨강·금 + 양쪽 불꽃 + 흔들림)
    const v = speedTag.v, lv = v >= SPEED_TIER[1] ? 2 : v >= SPEED_TIER[0] ? 1 : 0;
    const w = lv === 2 ? 118 : lv ? 104 : 96, h = lv ? 62 : 46, x = W - 10 - w, y = speedTag.y;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(0, (1 - Math.min(1, t / 160)) * -6);
    if (lv === 2 && t < 500) { const s = (1 - t / 500) * 3; ctx.translate(Math.sin(t / 18) * s, Math.cos(t / 23) * s * 0.5); }
    if (!lv) panel(x, y, w, h);
    else {
      const c = lv === 2 ? '#ff3b30' : '#ff922b';
      ctx.save();
      if (lv === 2) {
        const gr = ctx.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, 'rgba(60,8,8,.92)'); gr.addColorStop(1, 'rgba(20,6,10,.92)');
        ctx.fillStyle = gr;
      } else ctx.fillStyle = 'rgba(10,16,30,.88)';
      ctx.shadowColor = c; ctx.shadowBlur = lv === 2 ? 22 : 16;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = c; ctx.lineWidth = lv === 2 ? 2 : 1.5;
      ctx.beginPath(); ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 9); ctx.stroke();
      ctx.restore();
    }
    const fs = lv === 2 ? 30 : lv ? 26 : 24, ny = y + (lv ? 29 : 26);
    ctx.textAlign = 'right'; ctx.font = `900 ${fs}px system-ui,sans-serif`;
    if (lv === 2) {
      const g = ctx.createLinearGradient(0, ny - fs, 0, ny);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.45, '#ffd23f'); g.addColorStop(1, '#ff5a1f');
      ctx.fillStyle = g; ctx.shadowColor = 'rgba(255,90,31,.9)'; ctx.shadowBlur = 10;
    } else if (lv) { ctx.fillStyle = '#ffb15c'; ctx.shadowColor = 'rgba(255,146,43,.8)'; ctx.shadowBlur = 10; }
    else ctx.fillStyle = '#fff';
    ctx.fillText(String(v), x + w - 36, ny);
    ctx.shadowBlur = 0;
    ctx.font = '700 10.5px system-ui,sans-serif'; ctx.fillStyle = lv === 2 ? '#ffb3a8' : '#9fb3cc'; ctx.textAlign = 'left';
    ctx.fillText('km/h', x + w - 33, ny);
    ctx.textAlign = 'center'; ctx.font = '800 12px system-ui,sans-serif';
    ctx.fillStyle = lv === 2 ? '#ffb3a8' : DOT_COLOR[speedTag.k] || '#ffd43b';
    ctx.fillText(speedTag.name, x + w / 2, y + (lv ? 43 : 40));
    if (lv) {
      // 딱지: 강속구(주황) / MAX(빨강, 깜빡임)
      const label = lv === 2 ? 'MAX' : '강속구', bw = lv === 2 ? 36 : 40, bx = x + w / 2 - bw / 2, by = y + 47;
      ctx.save();
      if (lv === 2) ctx.globalAlpha = a * (0.55 + 0.45 * Math.abs(Math.sin(t / 110)));
      ctx.fillStyle = lv === 2 ? '#ff3b30' : '#ff922b';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, 12, 3); ctx.fill();
      ctx.fillStyle = lv === 2 ? '#fff' : '#111'; ctx.font = '900 9.5px system-ui,sans-serif';
      ctx.fillText(label, x + w / 2, by + 9.5);
      ctx.restore();
      // 불꽃: 150~ 왼쪽 하나, 160~ 양쪽. 살짝 흔들린다
      ctx.font = '20px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif'; ctx.textAlign = 'center';
      const fl = (fx, ph) => { const k = 1 + 0.12 * Math.sin(t / 60 + ph); ctx.save(); ctx.translate(fx, y + 2); ctx.rotate(-0.1 * Math.sin(t / 70 + ph)); ctx.scale(k, k); ctx.fillText('🔥', 0, 6); ctx.restore(); };
      fl(x + 1, 0);
      if (lv === 2) fl(x + w - 1, 1.7);
    }
    ctx.restore();
  }
  // 응원 열기 게이지(우리 공격 때 왼쪽 위, 투수 체력 아래). 꽉 차면 주황으로 깜빡인다
  function drawRally() {
    const g = match.game, rl = rally(match.log, g.inning, g.half), t = performance.now();
    const x = 10, y = hudY() + 42, w = 124, h = 30;
    panel(x, y, w, h);
    ctx.font = '700 11.5px system-ui,sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = rl.full ? '#ffb15c' : '#e4ecf6';
    ctx.fillText(rl.full ? '📣 응원 폭발!' : '📣 응원 열기', x + 8, y + 14);
    const sw = (w - 16 - (RALLY_MAX - 1) * 3) / RALLY_MAX;
    for (let i = 0; i < RALLY_MAX; i++) {
      const on = i < rl.value;
      ctx.globalAlpha = on && rl.full ? 0.65 + 0.35 * Math.sin(t / 140) : 1;
      bar(x + 8 + i * (sw + 3), y + 19, sw, 6, on ? 1 : 0, rl.full ? '#ff922b' : '#ffc078');
    }
    ctx.globalAlpha = 1;
  }
  function drawMsg() {
    if (!msg || msg.hidden) return;
    // 왼쪽 위 점수판·체력·응원 게이지(hudY 아래 72px까지)를 피해 그 아래에 띄운다
    const y = Math.max(V && V.kind === 'pitcher' && !play ? H * 0.2 : H * 0.14, hudY() + 108);
    // 튀어나오기: 크게 나타났다가 살짝 작아지며 자리 잡는다(0.26초)
    const t = Math.min(1, (performance.now() - (msg.at || 0)) / 260);
    const sc = t < 0.55 ? 1.6 - 0.75 * (t / 0.55) : 0.85 + 0.15 * Math.sin(((t - 0.55) / 0.45) * Math.PI / 2);
    ctx.save(); ctx.globalAlpha = Math.min(1, t * 3);
    ctx.translate(W / 2, y - 14); ctx.scale(sc, sc); ctx.translate(-W / 2, -(y - 14));
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    ctx.font = '900 40px system-ui,sans-serif'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(msg.text, W / 2, y); ctx.fillStyle = msg.color; ctx.fillText(msg.text, W / 2, y);
    ctx.restore(); ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    if (msg.sub) { ctx.font = '600 15px system-ui,sans-serif'; ctx.lineWidth = 4; ctx.strokeText(msg.sub, W / 2, y + 28); ctx.fillStyle = '#e4ecf6'; ctx.fillText(msg.sub, W / 2, y + 28); }
    ctx.textAlign = 'left';
  }

  function frame(dt, now) {
    if (!W || !V) resize();
    setAmbience(!practice);                             // 연습장에는 관중이 없다: 웅성거림·환호·야유 없이
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (practice && !practiceArtSettled()) {            // 연습장 그림을 불러오는 중: 경기장이 잠깐 비치지 않게 어둡게만
      if (pitchAt) pitchAt = Math.max(pitchAt, now + CONFIG.WIND_CPU_MS + 500);
      ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, W, H); drawMsg();
      return;
    }
    if (mode === 'bwait' && pitchAt && overlayOpen()) pitchAt = Math.max(pitchAt, now + CONFIG.WIND_CPU_MS + 500);
    else if (mode === 'bwait' && pitchAt && now >= pitchAt) throwCpuPitch();

    if (play && play.fc && play.fc.state === 'wait' && now >= play.start) fieldTick(now);
    if (play && now >= play.start) {
      const mu = shownMu(), ms = now - play.start;
      drawPlay3D(ctx, W, H, play, ms, { field: uni[mu.pitchingSide], bat: uni[mu.battingSide] }, { practice: !!practice });
      while (play.si < play.sounds.length && toMs(play.sounds[play.si].t) <= ms) playCue(play.sounds[play.si++].name);
      if (ms >= play.decisiveMs && !play.landed) {
        play.landed = true;
        if (play.event === 'HR') vibrate([60, 40, 60]);
        later(play.then, 350);
      }
      if (play.fc) drawFieldPrompt(now);
      if (!play.landed && !(play.fc && play.fc.state === 'wait')) {
        ctx.font = '600 12px system-ui,sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText('터치하면 건너뛰기', W - 12, H - 16); ctx.textAlign = 'left';
      }
      drawMsg();
      return;
    }

    const realNow = now;                                // 히트스톱: 멈춘 동안 장면(투수·타자·공)은 맞은 순간에 머문다
    if (freeze && now < freeze.until) now = freeze.at;
    // 공 잔상: 바로 전 위치 몇 개를 옅게 → 구종마다 휘는 길이 보인다
    const drawTrail = t => {
      if (V.kind === 'pitcher') return drawSpeedTrail(t);
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
      if (!soloPitch) drawB();
      if (bp && bp.prog <= 1.02) { drawTrail(now); drawBall(ctx, bp.x, bp.y, bp.r, bp.spin); }
      drawP();
      finishFrame(ctx, W, H, now);
    } else {
      drawP();
      drawB();
      finishFrame(ctx, W, H, now);
      // 타자는 카메라 가까이 옆에 크게 서 있어서 존·공은 그 위에 그린다(공이 몸에 가리지 않게)
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
    drawImpact(realNow);
    drawHitFx(realNow);
    drawLock(realNow);
    drawPerfect(realNow);
    drawMsg();
  }
  // ── 미트 임팩트(내가 던질 때): 구속 단계 색 잔상 → 미트에 닿으면 빛 + 바닥에 퍼지는 타원 충격파 ──
  // 150km 미만 파랑 · 150~ 주황(+흔들림) · 160~ 빨강(이중 충격파 + 번쩍임). 단계는 구속 표시(SPEED_TIER)와 같다
  const tierOf = v => (v >= SPEED_TIER[1] ? 2 : v >= SPEED_TIER[0] ? 1 : 0);
  const TIER_COLOR = ['#7ab6ff', '#ff922b', '#ff3b30'];
  let impact = null;
  function drawSpeedTrail(t) {
    const lv = tierOf(ball.pitch.speedKmh), c = TIER_COLOR[lv], pts = [];
    for (let i = 0; i <= 7; i++) {
      const tt = t - i * 14;
      if (tt < ball.start) break;
      pts.push(ballScreen(V, ball.pitch, ball.start, Math.min(tt, ball.arrival)));
    }
    if (pts.length < 2) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 10;
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - i / pts.length;
      ctx.globalAlpha = (lv ? 0.7 : 0.5) * k; ctx.lineWidth = Math.max(1, pts[i - 1].r * 1.5 * k);
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
    ctx.restore();
  }
  function startImpact() {
    const lv = tierOf(ball.pitch.speedKmh), [x, y] = toS(V, ball.pitch.plate.x, ball.pitch.plate.y);
    impact = { at: performance.now(), x, y, lv, c: TIER_COLOR[lv] };
    if (lv) { shake(stage, lv === 2 ? 6 : 3); vibrate(lv === 2 ? 35 : 15); }
  }
  // ── 타격 임팩트(내가 칠 때): 방망이가 지나간 빛나는 호 + 맞은 점 섬광 + 사방으로 튀는 불꽃 + 충격 고리 ──
  // 단계: 0 빗맞음·파울(흰색) · 1 정타(금색) · 2 홈런급(주황→빨강, 고리 두 겹)
  const HIT_GOOD_Q = 0.55;
  const HIT_COLOR = ['#ffffff', '#ffd23f', '#ff5a1f'];
  let hitFx = null;
  function startHitFx(lv) {
    const mu = matchup(match), bats = mu.batter.bats === 'S' ? (mu.pitcher.throws === 'L' ? 'R' : 'L') : mu.batter.bats;
    const [x, y] = toS(V, ball.pitch.plate.x, ball.pitch.plate.y);
    hitFx = { at: performance.now(), x, y, lv, side: batterAnchor(V, bats).x > x ? 1 : -1 };
  }
  function drawHitFx(now) {
    if (!hitFx) return;
    const t = hitFx.fixed ?? now - hitFx.at, D = 520;   // fixed: 확인용(__ui.showHitFx)
    if (t > D) { hitFx = null; return; }
    const { x, y, lv, side } = hitFx, c = HIT_COLOR[lv], s = V.zw / 120;
    const ease = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
    ctx.save(); ctx.lineCap = 'round';
    // 방망이 길: 타자 쪽에서 맞은 점을 지나 반대쪽으로 쓸고 지나간다(앞 90ms 동안 그려지고 사라진다)
    const P0 = [x + side * 140 * s, y - 60 * s], P1 = [x + side * 20 * s, y + 90 * s], P2 = [x - side * 130 * s, y + 30 * s];
    const reveal = ease(t / 90), fadeA = t < 130 ? 1 : Math.max(0, 1 - (t - 130) / 320), N = 22, lw = [10, 18, 26][lv] * s * 0.7;
    const at = u => [(1 - u) * (1 - u) * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) * (1 - u) * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
    ctx.shadowColor = c; ctx.shadowBlur = [4, 8, 14][lv];
    for (let i = 1; i <= N; i++) {
      const u0 = (i - 1) / N * reveal, u1 = i / N * reveal, k = i / N;
      const [ax, ay] = at(u0), [bx, by] = at(u1);
      ctx.globalAlpha = fadeA * k * (lv ? 0.95 : 0.75);
      ctx.strokeStyle = lv === 2 ? (k < 0.45 ? '#ffd23f' : k < 0.75 ? '#ff922b' : '#ff3b30') : c;
      ctx.lineWidth = lw * (0.35 + 0.65 * k);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    // 맞은 점 섬광
    if (t < 300) {
      const cr = 30 * [0.8, 1.3, 2][lv] * s * (0.4 + 0.6 * ease(t / 60) + 0.4 * t / 300);
      const g = ctx.createRadialGradient(x, y, 0, x, y, cr);
      g.addColorStop(0, '#fff'); g.addColorStop(0.35, c); g.addColorStop(1, c + '00');
      ctx.globalAlpha = t < 60 ? 1 : 1 - (t - 60) / 240; ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
    }
    // 충격 고리(홈런급은 두 겹)
    const ring = (d, w) => {
      const u = (t - d) / 420;
      if (u <= 0 || u >= 1) return;
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = c; ctx.lineWidth = w * s; ctx.shadowColor = c; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, 15 * s * (0.3 + [2.5, 4, 6][lv] * ease(u)), 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    };
    ring(0, 3); if (lv === 2) ring(70, 2);
    // 불꽃: 사방으로 튀는 빛줄기
    const n = [8, 14, 22][lv], su = t / 380;
    if (su < 1) {
      for (let i = 0; i < n; i++) {
        const a = (i * 360 / n + (i % 3) * 7) * Math.PI / 180, L = ([40, 70, 110][lv] + (i % 4) * 14) * s;
        const d0 = 10 * s + L * 0.9 * ease(su), len = L * (0.2 + 0.8 * ease(su)) * 0.5;
        const ax = x + Math.cos(a) * d0, ay = y + Math.sin(a) * d0, bx = x + Math.cos(a) * (d0 - len), by = y + Math.sin(a) * (d0 - len);
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, c); g.addColorStop(1, c + '00');
        ctx.globalAlpha = su < 0.1 ? 1 : 1 - (su - 0.1) / 0.9; ctx.strokeStyle = g; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ══ 경기 연출: 클러치 · 끝내기/역전 · PERFECT 히트스톱 · 핀포인트 제구 · 호수비 카드 · 기록 메달 ══
  const fxLayer = $('.fx-layer');
  const esc = v => String(v).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const fxAdd = (html, ms) => {                         // 연출 한 조각을 ms 동안 띄웠다가 걷는다
    const box = document.createElement('div'); box.innerHTML = html.trim();
    const el = box.firstChild; fxLayer.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  };
  const playerOf = id => {
    for (const s of ['home', 'away']) { const t = match.teams[s], b = t.batters.find(q => q.id === id), p = b || t.pitchers.find(q => q.id === id); if (p) return { p, team: t, kind: b ? 'b' : 'p' }; }
    return null;
  };
  const nameOf = id => { const x = playerOf(id); return x ? x.p.name : ''; };

  // 1) 클러치: 화면 테두리가 숨 쉬듯 빛나고 점수판 옆에 '찬스'(우리 공격 · 금색) / '위기'(우리 수비 · 빨강) 딱지
  let clutchNow = false;
  function updateClutch() {
    const on = !practice && !match.game.over && clutchOf(match.game, innings || 9);
    const ours = matchup(match).battingSide === mySide, gm = $('.game');
    gm.classList.toggle('clutch', on); gm.classList.toggle('pinch', on && !ours);
    $('.ctag').textContent = ours ? '찬스' : '위기';
    if (on && !clutchNow) vibrate([30, 70, 30]);
    clutchNow = on;
  }

  // 2) 끝내기·역전: 화면이 어두워지고 가운데 큰 점수판에서 우리 점수가 굴러 바뀐다
  const BIG_MS = { walkoff: 2600, comeback: 1900 };
  function showBigScore(kind, before, after) {
    const T = match.teams, side = s => {
      const a = before.score[s], b = after.score[s], n = Math.min(b - a, 6);
      const nums = b > a ? Array.from({ length: n + 1 }, (_, i) => b - n + i) : [b];
      return `<div class="bs-tm${s === mySide ? ' me' : ''}" style="--c:${T[s].colors.main}"><small>${esc(T[s].short)}</small><b><span class="od" style="--n:${nums.length - 1}">${nums.map(v => `<u>${v}</u>`).join('')}</span></b></div>`;
    };
    fxAdd(`<div class="bigscore ${kind}" style="--ms:${BIG_MS[kind]}ms"><div class="bs-row">${side('away')}<span>:</span>${side('home')}</div>
      <div class="bs-l">${kind === 'walkoff' ? '끝내기 승리' : '역 전 !'}</div></div>`, BIG_MS[kind]);
    vibrate(kind === 'walkoff' ? [80, 50, 80, 50, 140] : [60, 40, 90]);
  }

  // 3) 기록 메달: 금메달이 빙글 돌며 떨어져 박히고 아래에 무슨 기록인지. 여러 개면 하나씩 차례로
  const MEDAL_MS = 2600, REC_KEY = 'baseball.records.v1';
  let medalFree = 0, records = {};
  try { records = JSON.parse(localStorage.getItem(REC_KEY) || '{}') || {}; } catch (e) { /* 저장소 막힘 */ }
  const saveRecords = () => { try { localStorage.setItem(REC_KEY, JSON.stringify(records)); } catch (e) { /* 무시 */ } };
  function queueMedal(m, delay = 0) {
    const at = Math.max(performance.now() + delay, medalFree);
    medalFree = at + MEDAL_MS - 250;
    later(() => {
      // 중계 하단 자막: 왼쪽에서 팀 색 띠가 깔리고 얼굴 · 영문 머리말 · 제목 · 한 줄 설명, 오른쪽에 숫자 타일
      const who = playerOf(m.who), team = who ? who.team : match.teams[mySide], big = String(m.big), unit = m.unit || '';
      const sub = [who && who.p.name, m.sub].filter(Boolean).map(esc).join(' · ');
      fxAdd(`<div class="lt3${m.rec ? ' rec' : ''}" style="--c:${team.colors.main}"><i class="lt-gold"></i><div class="lt-band"></div>
        ${who ? face(who.p, who.kind, 'lt-face') : ''}<div class="lt-tx${who ? '' : ' nf'}"><div class="k">${esc(m.en || 'HIGHLIGHT')}</div><div class="t">${esc(m.label)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>
        <div class="lt-num"><b class="${big.length + unit.length > 3 ? 'sm' : ''}">${esc(big)}${unit ? `<small>${esc(unit)}</small>` : ''}</b></div></div>`, MEDAL_MS);
      playSound('catch', { gain: 0.5 }); vibrate(30);
    }, at - performance.now());
  }
  // 개인 최고 기록(이 폰에 선수마다 남긴다). 처음 세운 값은 조용히 남기고, 넘을 때만 메달(min 아래면 남기기만)
  function tryRecord(kind, id, value, min = 0) {
    const r = bestOf(records, kind, id, value);
    if (r.rec === records) return null;
    records = r.rec; saveRecords();
    return r.best && value >= min ? r.best : null;
  }

  // 4) 호수비 카드: 잡은 수비수 얼굴 + 무슨 수비였나 + 난이도 별
  const FIELD_POS = { P: '투수', C: '포수', '1B': '1루수', '2B': '2루수', SS: '유격수', '3B': '3루수', LF: '좌익수', CF: '중견수', RF: '우익수' };
  function greatPlay(r, prev) {
    const fc = play && play.fc, perfect = fc && fc.grade === 'perfect';
    const what = r.style === 'wall' ? ['펜스 앞 점프 캐치', 5] : r.style === 'dive' && r.event === 'OUT' ? ['다이빙 캐치', perfect ? 5 : 4]
      : r.event === 'SINGLE_HOME_OUT' ? ['홈 보살', 4] : r.style === 'bang' ? ['간발의 송구', perfect ? 4 : 3] : null;
    if (!what || !play || !play.ball) return;
    const h = play.ball.find(q => q.type === 'hold' && q.who !== 'C' && q.who !== 'P') || play.ball.find(q => q.type === 'hold' && q.who !== 'C');
    if (!h) return;
    const side = prev.half === 'top' ? 'home' : 'away', t = match.teams[side];
    const p = h.who === 'P' ? t.pitchers.find(q => q.id === match.pitcher[side]) : t.batters.find(q => match.lineups[side].order.includes(q.id) && q.pos === h.who);
    const stars = '★'.repeat(what[1]) + '☆'.repeat(5 - what[1]);
    fxAdd(`<div class="gplay${side === mySide ? ' me' : ''}" style="--c:${t.colors.main}">${p ? face(p, h.who === 'P' ? 'p' : 'b') : ''}
      <div><small>${FIELD_POS[h.who] || ''} · ${what[0]}</small><b>${esc(p ? p.name : t.short)}</b><em>${stars}</em></div></div>`, 2300);
    medalFree = Math.max(medalFree, performance.now() + 2200);      // 기록 자막은 호수비 카드가 내려간 뒤에
  }

  // 5) PERFECT: 타이밍이 완벽하면 맞는 순간 화면을 잠깐 멈추고(히트스톱), 큰 고리가 공으로 좁혀지며 번쩍 + PERFECT
  const STOP_MS = 110, PERFECT_K = 0.4;
  let freeze = null;
  function startPerfect() {
    const t = performance.now(), [x, y] = toS(V, ball.pitch.plate.x, ball.pitch.plate.y);
    freeze = { at: t, until: t + STOP_MS, x, y };
    later(() => fxAdd(`<div class="perfect" style="left:${Math.round(x)}px;top:${Math.round(y)}px">PERFECT</div>`, 950), STOP_MS);
    vibrate([15, 30, 60]);
  }
  function drawPerfect(now) {
    if (!freeze) return;
    const t = freeze.fixed ?? now - freeze.at;
    if (t > 600) { freeze = null; return; }
    const { x, y } = freeze, R = ballRadius(V) * 1.5;
    ctx.save(); ctx.strokeStyle = '#3ddc84'; ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 12;
    if (t < STOP_MS) {
      const u = t / STOP_MS;
      ctx.globalAlpha = 0.4 + 0.6 * u; ctx.lineWidth = 3 + 2 * u;
      ctx.beginPath(); ctx.arc(x, y, R * (1 + 5 * (1 - u) * (1 - u)), 0, Math.PI * 2); ctx.stroke();
    } else {
      const u = (t - STOP_MS) / (600 - STOP_MS), r = R * (1 + 5 * u);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.3, 'rgba(61,220,132,.75)'); g.addColorStop(1, 'rgba(61,220,132,0)');
      ctx.globalAlpha = Math.max(0, 1 - u * 1.6); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = Math.max(0, 1 - u); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R * (1 + 3 * u), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // 6) 핀포인트 제구: 내 공이 존 구석에 꽂히면 네 모서리 꺾쇠가 공으로 조여들며 LOCK ON
  let lock = null;
  const isPinpoint = p => p.isStrike && p.onTarget !== false && Math.abs(p.plate.x) >= 0.6 && Math.abs(p.plate.y) >= 0.55;
  function drawLock(now) {
    if (!lock) return;
    const t = lock.fixed ?? now - lock.at;
    if (t > 1200) { lock = null; return; }
    const [x, y] = toS(V, lock.x, lock.y), e = 1 - Math.pow(1 - Math.min(1, t / 180), 3), d = 13 + 34 * (1 - e), L = 10;
    ctx.save(); ctx.globalAlpha = t < 950 ? 1 : 1 - (t - 950) / 250;
    ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 3; ctx.shadowColor = '#3ddc84'; ctx.shadowBlur = 8; ctx.lineCap = 'square';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + sx * d, cy = y + sy * d;
      ctx.beginPath(); ctx.moveTo(cx, cy - sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * L, cy); ctx.stroke();
    }
    if (t > 170) {
      const right = x < W * 0.62, tx = right ? x + d + 8 : x - d - 8;
      ctx.shadowBlur = 6; ctx.font = '900 14px system-ui,sans-serif'; ctx.textAlign = right ? 'left' : 'right';
      ctx.globalAlpha *= Math.min(1, (t - 170) / 80);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText('LOCK ON', tx, y + 5);
      ctx.fillStyle = '#3ddc84'; ctx.fillText('LOCK ON', tx, y + 5);
    }
    ctx.restore();
  }
  function drawImpact(now) {
    if (!impact) return;
    const t = impact.fixed ?? now - impact.at, D = 700;   // fixed: 확인용(__ui.showImpact)으로 한 순간에 멈춰 둔다
    if (t > D) { impact = null; return; }
    const { x, y, lv, c } = impact, k = [0.8, 1.15, 1.5][lv], zw = V.zw;
    const ease = u => 1 - Math.pow(1 - Math.min(1, u), 3);
    ctx.save();
    // 미트 빛
    const gu = t / 520, gr = zw * (0.12 + 0.3 * k * ease(t / 120));
    if (gu < 1) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
      g.addColorStop(0, c); g.addColorStop(1, c + '00');
      ctx.globalAlpha = 0.85 * (1 - gu); ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
    }
    // 바닥에 퍼지는 타원 충격파(160~ 는 두 겹)
    const wave = (d, w) => {
      const u = (t - d) / 460;
      if (u <= 0 || u >= 1) return;
      const rx = zw * (0.1 + 0.62 * k * ease(u));
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = c; ctx.lineWidth = w * (1 - u * 0.6);
      ctx.shadowColor = c; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    };
    wave(0, 3.5);
    if (lv === 2) wave(80, 2);
    ctx.restore();
    if (lv === 2 && t < 130) { ctx.save(); ctx.globalAlpha = 0.4 * (1 - t / 130); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
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
    const bo = heatOn && !tactic.bunt ? boostFor(match, batter.id, mySide, mySide) : null;   // 불방망이·응원 폭발·육성 효과
    const reach = batReach(batter.contact, lvl()), bk = tactic.bunt ? BUNT.reach : bo ? bo.reach : 1;
    const fire = bo && (bo.hot || bo.rally);     // 육성 효과만 있으면 배트 크기만 바뀌고 불방망이 표시는 없다
    const rx = reach.rx * bk, ry = reach.ry * bk;
    const at = flash || batAim;
    const [cx, cy] = toS(V, at.x, at.y), RX = rx * V.zw / 2, RY = ry * V.zh / 2;
    const sweet = !flash && timingOn(now);
    const col = flash ? (flash.hit ? '46,204,113' : '255,107,94') : sweet ? '61,220,132' : fire ? '255,146,43' : '255,214,64';
    const a = flash ? 1 - (now - flash.at) / 450 : batDrag ? 1 : 0.8;
    // 조준 고리: 어두운 테 → 은은한 바깥 빛 → 밝은 고리 → 안쪽 정타 고리 + 가운데 점과 눈금. 지금 떼면 맞는 순간엔 초록으로 커지며 빛난다
    const rgba = k => `rgba(${col},${k})`, ring = (kx, ky = kx) => { ctx.beginPath(); ctx.ellipse(cx, cy, RX * kx, RY * ky, 0, 0, Math.PI * 2); };
    ctx.save(); ctx.globalAlpha = sweet ? 1 : a; ctx.lineCap = 'round';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(RX, RY));
    g.addColorStop(0, rgba(0)); g.addColorStop(0.55, rgba(sweet ? .1 : .03)); g.addColorStop(1, rgba(sweet ? .34 : .18));
    ctx.save(); ring(1); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(cx - RX, cy - RY, RX * 2, RY * 2); ctx.restore();
    ctx.strokeStyle = 'rgba(4,10,22,.55)'; ctx.lineWidth = sweet ? 6.5 : 5.5; ring(1); ctx.stroke();           // 잔디·흙 위에서도 또렷하게
    const pulse = sweet ? 0.5 + 0.5 * Math.sin(now / 55) : 0;
    ctx.strokeStyle = rgba(sweet ? .3 + .2 * pulse : .2); ctx.lineWidth = sweet ? 9 + 5 * pulse : 7;           // 바깥 빛
    ring(1 + (sweet ? 6 + 3 * pulse : 5) / RX, 1 + (sweet ? 6 + 3 * pulse : 5) / RY); ctx.stroke();
    ctx.shadowColor = rgba(.9); ctx.shadowBlur = sweet ? 18 : 8;
    ctx.strokeStyle = rgba(1); ctx.lineWidth = sweet ? 3.6 : 2.8; ring(1); ctx.stroke();                      // 고리 = 이 안으로 공이 오면 맞는다
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(.6); ctx.lineWidth = 1.4; ring(0.4); ctx.stroke();                                  // 안쪽 고리 = 정타
    ctx.strokeStyle = rgba(.95); ctx.lineWidth = 2.2;                                                          // 눈금 넷(좌우가 길다 = 배트 방향)
    [[-1, 0, 0.3], [1, 0, 0.3], [0, -1, 0.16], [0, 1, 0.16]].forEach(([ux, uy, len]) => {
      ctx.beginPath(); ctx.moveTo(cx + ux * RX * (1 - len), cy + uy * RY * (1 - len)); ctx.lineTo(cx + ux * RX * 0.9, cy + uy * RY * 0.9); ctx.stroke();
    });
    ctx.fillStyle = rgba(1); ctx.beginPath(); ctx.arc(cx, cy, Math.max(2.4, RY * 0.07), 0, Math.PI * 2); ctx.fill();
    if ((tactic.bunt || fire) && !flash) {                                          // 번트 자세·불방망이 표시
      ctx.shadowBlur = 0; ctx.fillStyle = `rgba(${col},1)`; ctx.font = '800 13px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(tactic.bunt ? '번트' : bo.rally ? '📣 응원 폭발' : '🔥 불방망이', cx, cy - RY - 6);
    }
    ctx.restore();
  }
  // 스트라이크존: 판정 존(ZONE_K) 크기로 그린다
  function drawZone(alpha) {
    const [x0, y0] = toS(V, (V.mirror ? 1 : -1) * ZONE_K, ZONE_K), zw = V.zw * ZONE_K, zh = V.zh * ZONE_K;
    ctx.strokeStyle = `rgba(4,10,22,${alpha * 0.45})`; ctx.lineWidth = 3.5; ctx.strokeRect(x0, y0, zw, zh);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.8})`; ctx.lineWidth = 1.4; ctx.strokeRect(x0, y0, zw, zh);
    const c = Math.min(zw, zh) * 0.16;                     // 네 귀퉁이 꺾쇠(밝고 굵게)
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, alpha * 1.4)})`; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(([px, py, sx, sy]) => {
      const x = x0 + zw * px, y = y0 + zh * py;
      ctx.beginPath(); ctx.moveTo(x + sx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * c); ctx.stroke();
    });
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x0 + zw * i / 3, y0); ctx.lineTo(x0 + zw * i / 3, y0 + zh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y0 + zh * i / 3); ctx.lineTo(x0 + zw, y0 + zh * i / 3); ctx.stroke();
    }
    drawDots();
  }
  // 이번 타석에 들어온 공 위치: 번호 붙은 점(직구 계열 빨강, 휘는 공 파랑, 떨어지는 공 초록). 공이 날아오는 동안은 흐리게
  function drawDots() {
    if (!paDots.length || practice) return;
    const r = Math.max(7, V.zw * 0.075), dim = ball && !ball.result && !ball.hitAt && (mode === 'bflight' || mode === 'flight') ? 0.45 : 0.95;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${Math.round(r * 1.15)}px system-ui,sans-serif`;
    paDots.forEach((d, i) => {
      const [x, y] = toS(V, d.x, d.y), last = i === paDots.length - 1;
      ctx.globalAlpha = dim * (last ? 1 : 0.8);
      ctx.fillStyle = DOT_COLOR[d.k] || '#ffd43b'; ctx.strokeStyle = last ? '#fff' : 'rgba(0,0,0,.55)'; ctx.lineWidth = last ? 2 : 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(String(d.n), x, y + 0.5);
    });
    ctx.restore();
  }

  // ── 타자 소개 띠(타석에 들어설 때 왼쪽에서 밀려 나왔다 들어간다) ──
  const POS = { C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자' };
  function showIntro() {
    if (practice) return;
    const g = match.game, mu = matchup(match), key = `${g.inning}${g.half}${g.battingIndex[mu.battingSide]}${match.log.length}`;
    if (key === introKey) return;
    introKey = key;
    const b = mu.batter, mine = mu.battingSide === mySide, team = match.teams[mu.battingSide];
    const st = stats && stats.bat && stats.bat[b.id];
    const season = st && st.ab ? `시즌 ${avg(st)}${st.hr ? ` · ${st.hr}홈런` : ''}` : `컨택 ${b.contact} · 파워 ${b.power}`;
    const el = $('.lower3');
    el.style.setProperty('--c', team.colors.main);
    el.innerHTML = `<i>${b.num ?? g.battingIndex[mu.battingSide] + 1}</i><div><b>${b.name}${heatOn && isHot(match.log, b.id) ? ' 🔥' : ''}</b>`
      + `<small>${g.battingIndex[mu.battingSide] + 1}번 · ${POS[b.pos] || b.pos} · ${b.bats === 'L' ? '좌타' : b.bats === 'S' ? '양타' : '우타'}${mine ? '' : ` · ${team.short}`}</small></div>`
      + `<div class="l3s"><em>${season}</em><small>${todayText(match.log, b.id)}</small></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // ── 이닝별 점수표(공수교대 때 잠깐, 경기 끝 화면) ──
  function lineScoreHtml(cur = 0) {                     // cur: 방금 끝난 이닝(그 열을 노랗게)
    const ls = lineScore(match.log, match.game), cell = v => (v == null ? '' : v), c = i => (i + 1 === cur ? ' class="cur"' : '');
    const head = Array.from({ length: ls.n }, (_, i) => `<th${c(i)}>${i + 1}</th>`).join('');
    const row = (side, team) => `<tr><td class="tn" style="--c:${team.colors.main}">${team.short}</td>${ls[side].map((v, i) => `<td${c(i)}>${cell(v)}</td>`).join('')}<td class="rr">${ls.R[side]}</td><td class="hh">${ls.H[side]}</td></tr>`;
    return `<table class="ls${ls.n > 9 ? ' x' : ''}"><tr><th></th>${head}<th class="rr">R</th><th class="hh">H</th></tr>${row('away', match.teams.away)}${row('home', match.teams.home)}</table>`;
  }
  // 공수교대: 화면 아래 방송 띠(노란 꼬리표 '몇 회 종료' + 파란 띠 '몇 점 냈나' + 이닝 표)
  function showLineScore(ms, prev) {
    const el = $('.linescore');
    const side = prev.half === 'top' ? 'away' : 'home', t = match.teams[side];
    const runs = lineScore(match.log, match.game)[side][prev.inning - 1] || 0;
    el.innerHTML = `<div class="ls-hd"><span>${prev.inning}회${prev.half === 'top' ? '초' : '말'} 종료</span><b>${t.short} ${runs ? `${runs}득점` : '무득점'}</b></div>${lineScoreHtml(prev.inning)}`;
    el.classList.add('show');
    later(() => el.classList.remove('show'), ms - 200);
  }

  // ── 경기 시작 카운트다운: 3·2·1 고리가 줄어들고 PLAY BALL. 아래 작은 띠에 두 팀 선발. 화면을 누르면 바로 시작 ──
  let cdown = null;
  function startCountdown(then) {
    mode = 'msg'; setControls('');
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const pit = side => {
      const t = match.teams[side], p = t.pitchers.find(q => q.id === match.pitcher[side]);
      if (!p) return '';
      const st = stats && stats.pit && stats.pit[p.id];
      return `<div class="cd-p ${side}" style="--c:${t.colors.main}">${face(p, 'p')}<div><b>${esc(p.name)}</b><small>${esc(t.short)} · ${st && st.outs ? `평균자책 ${era(st)}` : `${p.velo}km`}</small></div></div>`;
    };
    const who = raise ? '내 장면까지 자동으로 진행해요' : userPitching() ? '내가 던져요' : '내가 쳐요';
    const el = document.createElement('div');
    el.className = 'cdown';
    el.innerHTML = `<div class="cd-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" pathLength="100" transform="rotate(-90 50 50)"/></svg><b>3</b></div>
      <div class="cd-pb">PLAY BALL<small>1회초 · ${esc(match.teams.away.short)} 공격 · ${who}</small></div>
      <div class="cd-mu">${pit('away')}<em>VS</em>${pit('home')}</div>`;
    stage.appendChild(el);
    const ring = el.querySelector('.cd-ring'), num = ring.querySelector('b');
    const pop = () => { ring.classList.remove('pop'); void ring.offsetWidth; ring.classList.add('pop'); };
    let k = 3;
    const tick = () => {
      if (!cdown) return;
      if (--k > 0) { num.textContent = k; pop(); playSound('catch', { gain: 0.4 }); cdown.t = later(tick, 700); return; }
      el.classList.add('go'); vibrate(40);
      cdown.t = later(done, 900);
    };
    const done = () => {
      if (!cdown) return;
      clearTimeout(cdown.t); cdown = null;
      el.classList.add('out'); setTimeout(() => el.remove(), 320);
      then();
    };
    cdown = { t: later(tick, 700), done };
    pop();
  }

  // 확인용: 지금 타석에 정해진 타구 장면을 바로 띄운다(수비 조작 확인)
  const testPlay = (event, fly = false, style = null, pull = 0, batting = false) => { const pitch = cpuPitchToUser(match, rng); ball = batting ? { pitch } : null; apply({ ...applyDecision(match, pitch, { event, contact: { kind: 'INPLAY', pull, quality: 0.6 }, fly, style, swung: true }), pitch }, !batting); };
  window.__ui = { showLineScore, testPlay, showSpeed: (v, k = 'FB') => { speedTag = { v, k, name: PITCH_TYPES[k].name, at: performance.now() }; },
    showHitFx: (lv, fixed) => { const b = ball; ball = { pitch: { plate: { x: 0.1, y: 0 } } }; startHitFx(lv); ball = b; if (fixed != null) hitFx.fixed = fixed; },
    showImpact: (v, fixed) => { const b = ball; ball = { pitch: { speedKmh: v, plate: { x: 0.15, y: -0.1 } } }; startImpact(); ball = b; if (fixed != null) impact.fixed = fixed; } };
  window.__fx = {                                       // 확인용: 연출을 바로 띄운다(fixed = 그 시각에 멈춘 그림)
    clutch: on => { $('.game').classList.toggle('clutch', on); $('.game').classList.toggle('pinch', on && userPitching()); $('.ctag').textContent = userPitching() ? '위기' : '찬스'; },
    big: kind => showBigScore(kind, { score: { away: 3, home: kind === 'walkoff' ? 3 : 2 } }, { score: { away: 3, home: 4 } }),
    medal: m => queueMedal(m),
    perfect: fixed => { const b = ball; ball = { pitch: { plate: { x: 0.1, y: 0 } } }; startPerfect(); ball = b; if (fixed != null) freeze.fixed = fixed; },
    lock: fixed => { lock = { at: performance.now(), x: -0.7, y: -0.65, fixed }; },
    gplay: (style = 'dive', who = 'CF', ev = 'OUT') => { const p = play; play = { ball: [{ type: 'hold', who }] }; greatPlay({ event: ev, style }, { half: 'top' }); play = p; },
    score: (a, h) => { match = { ...match, game: { ...match.game, score: { away: a, home: h } } }; updateBoard(); },
  };
  window.__match = f => { if (f) { match = f(match); updateBoard(); } return match; };   // 확인용
  window.__game = () => ({ mode, dragging, V: !!V, W, H, target, ball: !!ball, ballStart: ball ? ball.start : null, arrival: ball ? ball.arrival : null, swung: !!(ball && ball.swung), pitchAt, play: play && play.start ? { ms: Math.round(performance.now() - play.start), event: play.event, fc: play.fc ? { state: play.fc.state, ring: !!play.fc.r0, hitAt: play.fc.hitAt, grade: play.fc.grade || null } : null } : null });
  const loop = startLoop(frame);
  resize();
  updateBoard();
  if (raiseFirst) nextPlay();                          // 이어 받은 경기: '플레이볼' 대신 바로 '몇 회 · 내 장면'
  else if (practice || net) showMsg('플레이볼!', '#f1c40f', 1100, '1회초', nextPlay);   // 연습·1:1 대결은 짧게(대결은 두 폰 박자를 맞춘다)
  else startCountdown(nextPlay);
  return { exit };
}
