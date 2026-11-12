// 손맛: 효과음·관중 소리, 진동(안드로이드만), 화면 흔들림
// 소리는 assets/audio 의 녹음(tools/make_audio.py 로 만든다)을 쓰고, 아직 못 불러왔거나 실패하면 Web Audio 로 직접 합성한다.
// 두 갈래로 나눠 끄고 켤 수 있다: 효과음(방망이·글러브·헛스윙) / 관중·응원(관중 소리·응원 북·환호·탄식)
let AC = null, SFX = null, AMB = null;
const DIR = new URL('../../assets/audio/', import.meta.url);
const FILES = ['bat_crack', 'bat_hr', 'mitt_pop', 'glove_catch', 'swing_whoosh', 'fence_hit', 'ball_bounce',
  'crowd_ooh', 'crowd_aww', 'crowd_cheer', 'crowd_cheer_big', 'jingle_hr', 'crowd_loop'];
const LOOPS = { crowd_loop: 30 };   // 반복 소리의 원래 길이(초): mp3 앞뒤 빈 소리를 빼고 이만큼만 돈다
const RAW = {}, BUF = {};
let fetching = false;
const opts = { sfx: true, amb: true, sfxVol: 1, ambVol: 1 };
const amb = { want: false, nodes: {} };

// 파일은 미리 받아 두고(오디오를 깨우기 전에도 된다), 소리로 풀기는 오디오가 생긴 뒤에 한다
export function preloadAudio() {
  if (fetching || typeof fetch !== 'function') return;
  fetching = true;
  for (const n of FILES) {
    fetch(new URL(n + '.mp3', DIR))
      .then(r => (r.ok ? r.arrayBuffer() : null))
      .then(ab => { if (ab) { RAW[n] = ab; decode(n); } })
      .catch(() => { /* 없으면 합성 소리로 */ });
  }
}
function decode(n) {
  if (!AC || !RAW[n] || BUF[n]) return;
  const ab = RAW[n]; RAW[n] = null;
  const done = b => { if (b && !BUF[n]) { BUF[n] = b; if (n in LOOPS) syncAmb(); } };
  try { const p = AC.decodeAudioData(ab, done, () => {}); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 무시 */ }
}

// 아이폰은 사용자의 첫 터치 안에서 오디오를 깨워야 소리가 난다.
// 사파리는 '손을 뗄 때(touchend·pointerup)'와 클릭만 사용자 동작으로 쳐 준다. 손가락이 닿는 순간(pointerdown)에 깨우면
// AudioContext 가 잠긴 채(suspended) 남아 아무 소리도 안 난다 → 문서 전체에서 손을 뗄 때마다 깨어 있는지 확인한다
export function unlockAudio() {
  try {
    // 아이폰 무음(벨소리) 스위치를 켜 둬도 게임 소리는 나게: 음악 앱처럼 '재생' 세션(사파리 16.4+)
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { /* 무시 */ }
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const lim = AC.createDynamicsCompressor();             // 여러 소리가 겹쳐도 찢어지지 않게
      lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = 0.003; lim.release.value = 0.2;
      lim.connect(AC.destination);
      SFX = AC.createGain(); AMB = AC.createGain();
      SFX.gain.value = opts.sfx ? opts.sfxVol : 0; AMB.gain.value = opts.amb ? opts.ambVol : 0;
      SFX.connect(lim); AMB.connect(lim);
      preloadAudio();
      for (const n of FILES) decode(n);
    }
    // 'interrupted'(사파리: 전화·다른 앱 소리 뒤)도 다시 깨운다
    if (AC.state !== 'running' && !document.hidden) {
      const p = AC.resume(); if (p && p.catch) p.catch(() => {});
      // 옛 iOS 는 사용자 동작 안에서 소리를 한 번 내야 풀린다: 아주 짧은 빈 소리
      const s = AC.createBufferSource(); s.buffer = AC.createBuffer(1, 1, 22050); s.connect(AC.destination); s.start(0);
    }
    syncAmb();
  } catch (e) { if (!SFX) AC = null; }   // 만들다 실패하면 다음 터치에서 다시
}
const wake = () => { if (!AC || AC.state !== 'running') unlockAudio(); };
if (typeof document !== 'undefined') {
  for (const t of ['touchend', 'pointerup', 'click', 'keydown']) document.addEventListener(t, wake, { capture: true, passive: true });
}

// 다른 앱·탭으로 가면 관중 소리도 멈춘다
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    try { if (AC) { if (document.hidden) AC.suspend(); else AC.resume(); } } catch (e) { /* 무시 */ }
  });
}

// sfxVol·ambVol: 0~1 소리 크기(효과음 / 관중·응원 배경음)
export function setAudioOptions({ sfx = true, amb: a = true, sfxVol = 1, ambVol = 1 } = {}) {
  const v = x => (Number.isFinite(+x) ? Math.max(0, Math.min(1, +x)) : 1);
  opts.sfx = sfx; opts.amb = a; opts.sfxVol = v(sfxVol); opts.ambVol = v(ambVol);
  if (!AC) return;
  SFX.gain.setTargetAtTime(sfx ? opts.sfxVol : 0, AC.currentTime, 0.05);
  AMB.gain.setTargetAtTime(a ? opts.ambVol : 0, AC.currentTime, 0.15);
}
// 볼륨을 만질 때 들어 보는 소리
export function previewSound(kind) { playSound(kind === 'amb' ? 'cheer' : 'hit', kind === 'amb' ? { gain: 0.6 } : { q: 0.8 }); }

// 경기장 분위기: 관중 웅성거림
export function setAmbience(on) {
  if (amb.want === on) return;
  amb.want = on; syncAmb();
}
function leadIn(b) {                                       // mp3 앞에 붙은 빈 소리 길이
  const d = b.getChannelData(0), lim = Math.min(d.length, 4096);
  for (let i = 0; i < lim; i++) if (Math.abs(d[i]) > 1e-4) return i / b.sampleRate;
  return 0;
}
function syncAmb() {
  if (!AC) return;
  const t = AC.currentTime;
  for (const [n, len] of Object.entries(LOOPS)) {
    const level = amb.want ? 0.3 : 0;
    let node = amb.nodes[n];
    if (!node && level > 0 && BUF[n]) {
      const b = BUF[n], s = AC.createBufferSource(), g = AC.createGain(), st = leadIn(b);
      s.buffer = b; s.loop = true; s.loopStart = st; s.loopEnd = Math.min(b.duration, st + len);
      g.gain.value = 0;
      s.connect(g).connect(AMB); s.start(0, st);
      node = amb.nodes[n] = { s, g };
    }
    if (!node) continue;
    node.g.gain.cancelScheduledValues(t);
    node.g.gain.setTargetAtTime(level, t, level > node.g.gain.value ? 0.6 : 0.35);
    if (!amb.want) { try { node.s.stop(t + 2); } catch (e) { /* 무시 */ } delete amb.nodes[n]; }
  }
}

// ── 녹음 재생 ──
function sample(n, gain = 1, rate = 1, bus = SFX) {
  const b = BUF[n];
  if (!AC || !b) return false;
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = b; s.playbackRate.value = rate; g.gain.value = gain;
  s.connect(g).connect(bus); s.start();
  return true;
}
const jit = a => 1 + (Math.random() * 2 - 1) * a;          // 매번 살짝 다르게
const clamp01 = v => Math.max(0, Math.min(1, v));

// ── 합성(녹음이 없을 때) ──
function noise(dur, freq, q, gain, attack = 0.002, type = 'bandpass', bus = SFX) {
  if (!AC) return;
  const n = Math.max(1, Math.floor(AC.sampleRate * dur)), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(), t = AC.currentTime;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus); src.start();
}
function tone(freq, dur, gain, type = 'sine', end = 0.5) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * end, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(SFX); o.start(); o.stop(t + dur);
}
const SYNTH = {
  hit: () => { noise(0.09, 2600, 1.2, 1.0); tone(1150, 0.08, 0.5, 'triangle'); tone(420, 0.06, 0.35, 'square', 0.6); },
  foul: () => { noise(0.06, 2000, 1.4, 0.6); tone(800, 0.05, 0.3, 'triangle'); },
  mitt: () => { noise(0.07, 380, 1, 0.9); tone(110, 0.09, 0.6); },
  whiff: () => noise(0.2, 700, 0.7, 0.28, 0.05),
  cheer: () => { noise(2.0, 1300, 0.4, 0.55, 0.35, 'bandpass', AMB); noise(1.6, 600, 0.5, 0.3, 0.3, 'bandpass', AMB); },
  ooh: () => noise(0.9, 900, 0.5, 0.3, 0.2, 'bandpass', AMB),
};

// o: { q: 타구 질(0~1), speed: 구속 km/h, gain: 크기 배율 }
const SOUNDS = {
  // 방망이 소리는 받은 녹음(bat_crack) 그대로. 잘 맞을수록 크게만 한다
  hit: o => { const q = o.q === undefined ? 0.7 : o.q; if (!sample('bat_crack', 0.55 + 0.45 * q)) SYNTH.hit(); },
  // 우리 홈런(crowd): 받은 녹음 전체('딱' + 함성). 관중 소리를 껐거나 상대 홈런이면 '딱'만
  homerun: o => { if (o.crowd && opts.amb && sample('bat_hr', 1)) return; if (!sample('bat_crack', 1)) SYNTH.hit(); },
  foul: () => { if (!sample('bat_crack', 0.6)) SYNTH.foul(); },
  mitt: o => {                                             // 포수 미트: 빠른 공일수록 크고 단단하게
    const k = clamp01(((o.speed || 140) - 115) / 40);
    if (!sample('mitt_pop', 0.55 + 0.45 * k, (0.97 + 0.06 * k) * jit(0.015))) SYNTH.mitt();
  },
  catch: () => { if (!sample('glove_catch', 0.75, jit(0.05))) SYNTH.mitt(); },   // 야수가 잡는 소리
  whiff: () => { if (!sample('swing_whoosh', 0.7, jit(0.05))) SYNTH.whiff(); },
  fence: () => { sample('fence_hit', 0.8, jit(0.04)); },
  bounce: () => { sample('ball_bounce', 0.6, jit(0.06)); },
  strikeout: () => { tone(660, 0.12, 0.18, 'square', 1); setTimeout(() => tone(880, 0.18, 0.18, 'square', 1), 120); },
  // 관중(관중·응원 쪽으로 나간다)
  cheer: o => { if (!sample('crowd_cheer', 0.8 * (o.gain || 1), jit(0.03), AMB)) SYNTH.cheer(); },
  roar: o => { if (!sample('crowd_cheer_big', o.gain || 1, 1, AMB)) SYNTH.cheer(); },
  ooh: o => { if (!sample('crowd_ooh', 0.8 * (o.gain || 1), jit(0.04), AMB)) SYNTH.ooh(); },
  aww: o => { sample('crowd_aww', 0.65 * (o.gain || 1), jit(0.03), AMB); },
  jingle: () => { sample('jingle_hr', 0.85, 1, AMB); },
};
// 확인용: 지금 불러온 소리와 돌고 있는 반복 소리
export const audioDebug = () => ({ state: AC && AC.state, loaded: Object.keys(BUF), loops: Object.keys(amb.nodes) });
export function playSound(name, o = {}) { try { if (AC && SOUNDS[name]) SOUNDS[name](o); } catch (e) { /* 소리 실패는 무시 */ } }

// 안드로이드 크롬만 진동. 아이폰은 조용히 아무 일 없음.
export function vibrate(pattern) {
  try { if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern); } catch (e) { /* 무시 */ }
}

export function shake(el, strength) {
  try {
    el.animate([
      { transform: 'translate(0,0)' },
      { transform: `translate(${strength}px,${-strength}px)` },
      { transform: `translate(${-strength}px,${strength * 0.6}px)` },
      { transform: `translate(${strength * 0.4}px,0)` },
      { transform: 'translate(0,0)' },
    ], { duration: 220 });
  } catch (e) { /* 무시 */ }
}
