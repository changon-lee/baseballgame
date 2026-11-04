// 경기 화면: 투구(조준 → 구종 → 게이지), 타격(타이밍 터치), 타구 화면, 투수 교체, 경기 종료
import { CONFIG } from '../config.js';
import { createRng } from '../core/rng.js';
import { PITCH_TYPES, gaugePos, sweetWidth, gaugePeriod, energy, aimFromTouch, fatigue } from '../core/pitch.js';
import { availableRelievers } from '../core/team.js';
import { createMatch, matchup, playUserPitch, cpuPitchToUser, resolveUserSwing, changePitcher, cpuMaybeChangePitcher } from '../core/match.js';
import { startLoop } from './loop.js';
import { unlockAudio, playSound, vibrate, shake } from './feedback.js';
import { makeView, toS, zoneRect, ballScreen, ballRadius, pitcherAnchor, batterAnchor, setReleaseOverride } from './art/view.js';
import { drawPitcherSprite, drawBatterSprite, drawCatcherSprite, spriteReleaseOffset } from './art/sprites.js';
import { buildBackdrop, standsReady } from './art/stadium.js';
import { uniformFor } from './art/uniforms.js';
import { pitcherPoseAt, batterPoseAt } from './art/rig.js';
import { drawBatter, drawPitcher, drawCatcherAndUmpire, drawBall } from './art/figures.js';
import { planPlay, drawFieldView } from './art/fieldview.js';

const LABEL = {
  BALL: '볼', STRIKE: '스트라이크', FOUL: '파울', SINGLE: '안타!', DOUBLE: '2루타!', TRIPLE: '3루타!', HR: '홈런!!',
  SAC_FLY: '희생플라이', DOUBLE_PLAY: '병살타',
};
const HITS = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'];
const OUTS = ['OUT', 'SAC_FLY', 'DOUBLE_PLAY'];

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
        <button class="exit" aria-label="나가기">✕</button>
      </div>
      <div class="sub"><span class="mu"></span>${title ? `<span class="ttl">${title}</span>` : ''}</div>
    </div>
    <div class="stage"><canvas></canvas><div class="overlay hidden"></div></div>
    <div class="controls"></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const cv = $('canvas'), stage = $('.stage'), controls = $('.controls'), overlay = $('.overlay');
  const ctx = cv.getContext('2d');

  let W = 0, H = 0, DPR = 1, V = null;
  const bg = {};
  let mode = 'msg';              // aim | pick | gauge | flight | bwait | bflight | play | msg | bullpen | end
  let target = { x: 0, y: 0 }, dragging = false, pitchType = null, gaugeStart = 0, period = CONFIG.GAUGE_PERIOD_MS;
  let ball = null;              // { pitch, start, wind, arrival, result, swung, hitAt, contact }
  let pitchAt = 0, swingAt = null, play = null, msg = null, info = '';
  let timers = [];
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
  }
  const userPitching = () => matchup(match).userRole === 'pitch';
  function setView() { if (W) V = makeView(userPitching() ? 'pitcher' : 'catcher', W, H); }
  window.addEventListener('resize', resize);

  // ── 스코어보드 ──
  function updateBoard() {
    const g = match.game, mu = matchup(match);
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
    updateBoard();
    if (match.game.over) return showEnd();
    ball = null; play = null; swingAt = null; pitchAt = 0;
    setView();
    // 화면이 숨겨진 동안에는 다음 공을 준비하지 않는다(돌아오면 onVisibility가 이어서 진행)
    if (document.hidden) { interrupted = true; mode = 'msg'; return; }
    if (userPitching()) {
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
      setControls('<p>공이 오면 <b>타이밍에 맞춰 화면을 터치</b>해서 스윙!</p>');
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

  function showPitchButtons() {
    const p = matchup(match).pitcher;
    mode = 'pick';
    setControls(`<p>구종을 고르세요 <small>(다시 드래그하면 위치 변경)</small></p>
      <div class="row">${p.pitches.map(k => `<button data-k="${k}">${PITCH_TYPES[k].name}</button>`).join('')}</div>`);
    controls.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => {
        pitchType = b.dataset.k; mode = 'gauge'; gaugeStart = performance.now();
        period = gaugePeriod(matchup(match).fatigue);
        setControls(`<p><b>${PITCH_TYPES[pitchType].name}</b> · 게이지가 <b class="g">초록 구간 한가운데</b>일 때 화면을 터치!</p>`);
      };
    });
  }

  function throwUserPitch(ts) {
    const gpos = gaugePos(ts - gaugeStart, period);
    const r = playUserPitch(match, { type: pitchType, target, gaugePos: gpos }, rng);
    const start = performance.now() + CONFIG.WIND_USER_MS;
    ball = { pitch: r.pitch, start, wind: CONFIG.WIND_USER_MS, arrival: start + r.pitch.travelMs, result: r };
    mode = 'flight';
    const grade = !r.pitch.onTarget ? '<b class="r">타이밍 실패 — 제구가 흔들렸어요</b>'
      : r.pitch.err < r.pitch.sweet * 0.35 ? '<b class="g">완벽한 타이밍!</b>' : '<b class="y">괜찮은 타이밍</b>';
    setControls(`<p>${grade}</p>`);
  }

  function throwCpuPitch() {
    const pitch = cpuPitchToUser(match, rng);
    ball = { pitch, start: pitchAt, wind: CONFIG.WIND_CPU_MS, arrival: pitchAt + pitch.travelMs, result: null, swung: false };
    mode = 'bflight';
  }

  // 내가 던진 공이 도착
  function arriveUserPitch() {
    const r = ball.result;
    if (r.swing) swingAt = performance.now() - 70;
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
    ball.swung = true; swingAt = performance.now();
    const diff = ts - ball.arrival;
    const r = resolveUserSwing(match, ball.pitch, diff, rng);
    const k = r.contact.kind;
    info = `${ball.pitch.speedKmh}km/h ${PITCH_TYPES[ball.pitch.type].name} · ${diff < 0 ? '빠름' : '늦음'} ${Math.abs(Math.round(diff))}ms`;
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
    play = planPlay(r.event, r.fly, r.contact, batter, rng, performance.now() + 320);
    play.bases = [...prev.bases];
    play.then = finish;
  }

  function settle(prev, r, userPitched) {
    match = r.match;
    let label = LABEL[r.event] || (r.fly ? '뜬공 아웃' : '땅볼 아웃');
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
        return showMsg('공수교대', '#9fb3cc', 1200, `${g.inning}회${g.half === 'top' ? '초 · 내가 투수' : '말 · 내가 타자'}`, nextPlay);
      }
      nextPlay();
    });
  }

  function showEnd() {
    mode = 'end';
    const g = match.game;
    const res = g.result === 'home' ? '승리' : g.result === 'away' ? '패배' : '무승부';
    overlay.innerHTML = `<div class="end-card ${g.result === 'home' ? 'win' : ''}">
      <div class="tag">경기 종료 · ${g.inning}회</div><h1>${res}</h1>
      <div class="final"><span>${cpuTeam.short}</span><b>${g.score.away}</b><i>:</i><b>${g.score.home}</b><span>${userTeam.short}</span></div>
      <button class="primary" data-act="menu">계속</button></div>`;
    overlay.classList.remove('hidden');
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
  $('.exit').onclick = () => {
    if (mode === 'end') return overlay.querySelector('[data-act=menu]').click();
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
    if (e.target.closest('button')) return;
    if (mode === 'gauge') throwUserPitch(e.timeStamp);
    else if (mode === 'bflight') userSwing(e.timeStamp);
  }
  root.addEventListener('pointerdown', onRootDown);

  // ── 그리기 ──
  function drawGauge(now) {
    const mu = matchup(match), sw = sweetWidth(mu.pitcher.control, mu.fatigue);
    const bw = W * 0.82, bx = (W - bw) / 2, by = H - 32, bh = 16;
    ctx.fillStyle = 'rgba(6,14,26,.85)'; ctx.fillRect(bx - 5, by - 5, bw + 10, bh + 10);
    ctx.fillStyle = '#22344d'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#27ae60'; ctx.fillRect(bx + bw * (0.5 - sw / 2), by, bw * sw, bh);
    ctx.fillStyle = '#8affb8'; ctx.fillRect(bx + bw * (0.5 - sw * 0.35 / 2), by, bw * sw * 0.35, bh);
    const mx = bx + bw * gaugePos(now - gaugeStart, period);
    ctx.fillStyle = '#fff'; ctx.fillRect(mx - 2, by - 7, 4, bh + 14);
  }
  function drawHUD() {
    const mu = matchup(match), p = mu.pitcher, pc = match.pitchCount[mu.pitchingSide];
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
    if (mode === 'bwait' && pitchAt && now >= pitchAt) throwCpuPitch();

    if (play && now >= play.start) {
      const { landed } = drawFieldView(ctx, W, H, play, now, uni[matchup(match).pitchingSide], play.bases);
      if (landed && !play.landed) {
        play.landed = true;
        if (play.event === 'HR') { playSound('cheer'); vibrate([60, 40, 60]); } else if (play.hit) playSound('ooh'); else playSound('mitt');
        later(play.then, 500);
      }
      drawMsg();
      return;
    }

    if (!bg[V.kind] || bg[V.kind].ready !== standsReady(V.kind)) bg[V.kind] = buildBackdrop(V.kind, V, W, H, DPR, userTeam);
    ctx.drawImage(bg[V.kind], 0, 0, W, H);
    const mu = matchup(match);
    const bp = ball && !ball.hitAt && now >= ball.start ? ballScreen(V, ball.pitch, ball.start, now) : null;
    const pp = ball ? pitcherPoseAt(now, ball.start, ball.wind) : mode === 'bwait' && pitchAt ? pitcherPoseAt(now, pitchAt, CONFIG.WIND_CPU_MS) : pitcherPoseAt(now, null, 0);
    const pa = pitcherAnchor(V, mu.pitcher.throws), ba = batterAnchor(V, mu.batter.bats === 'S' ? (mu.pitcher.throws === 'L' ? 'R' : 'L') : mu.batter.bats);
    const bpose = batterPoseAt(now, { swingAt, pitchStart: ball ? ball.start : null, travelMs: ball ? ball.pitch.travelMs : 1 });
    const releaseAt = ball ? ball.start : mode === 'bwait' && pitchAt ? pitchAt : null;
    const pitcherArgs = { ...pa, pose: pp.pose, uni: uni[mu.pitchingSide], holdBall: pp.holdBall, player: mu.pitcher,
      throws: mu.pitcher.throws, now, releaseAt, windMs: ball ? ball.wind : CONFIG.WIND_CPU_MS };
    const batterArgs = { ...ba, pose: bpose, uni: uni[mu.battingSide], now, swingAt };
    const drawP = () => drawPitcherSprite(ctx, pitcherArgs) || drawPitcher(ctx, pitcherArgs);
    const drawB = () => drawBatterSprite(ctx, batterArgs) || drawBatter(ctx, batterArgs);

    if (V.kind === 'pitcher') {
      const aiming = mode === 'aim' || mode === 'pick' || mode === 'gauge' || (ball && !ball.hitAt);
      if (!drawCatcherSprite(ctx, V, aiming ? target : null)) drawCatcherAndUmpire(ctx, V, aiming ? target : null, uni.home);
      drawZone(0.7);
      drawB();
      if (bp && bp.prog <= 1.02) drawBall(ctx, bp.x, bp.y, bp.r, bp.spin);
      drawP();
    } else {
      drawP();
      drawZone(0.32);
      if (bp && bp.prog <= 1.02) drawBall(ctx, bp.x, bp.y, bp.r, bp.spin);
      drawB();
    }
    drawHUD();
    if (mode === 'gauge') drawGauge(now);

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
  function drawZone(alpha) {
    const [x0, y0] = toS(V, V.mirror ? 1 : -1, 1);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, V.zw, V.zh);
    ctx.lineWidth = 1; ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.35})`;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(x0 + V.zw * i / 3, y0); ctx.lineTo(x0 + V.zw * i / 3, y0 + V.zh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0, y0 + V.zh * i / 3); ctx.lineTo(x0 + V.zw, y0 + V.zh * i / 3); ctx.stroke();
    }
  }

  window.__game = () => ({ mode, dragging, V: !!V, W, H, target, ball: !!ball, ballStart: ball ? ball.start : null, arrival: ball ? ball.arrival : null, swung: !!(ball && ball.swung), pitchAt });
  const loop = startLoop(frame);
  resize();
  updateBoard();
  showMsg('플레이볼!', '#f1c40f', 1100, `1회초 · 내가 투수 (${matchup(match).pitcher.name})`, nextPlay);
  return { exit };
}
