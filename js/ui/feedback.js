// 손맛: 효과음(Web Audio로 직접 합성), 진동(안드로이드만), 화면 흔들림
let AC = null;

// 아이폰은 사용자의 첫 터치 안에서 오디오를 깨워야 소리가 난다
export function unlockAudio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { AC = null; }
}

function noise(dur, freq, q, gain, attack = 0.002, type = 'bandpass') {
  if (!AC) return;
  const n = Math.max(1, Math.floor(AC.sampleRate * dur)), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(), t = AC.currentTime;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(AC.destination); src.start();
}
function tone(freq, dur, gain, type = 'sine', end = 0.5) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * end, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination); o.start(); o.stop(t + dur);
}

const SOUNDS = {
  hit: () => { noise(0.09, 2600, 1.2, 1.0); tone(1150, 0.08, 0.5, 'triangle'); tone(420, 0.06, 0.35, 'square', 0.6); },
  foul: () => { noise(0.06, 2000, 1.4, 0.6); tone(800, 0.05, 0.3, 'triangle'); },
  mitt: () => { noise(0.07, 380, 1, 0.9); tone(110, 0.09, 0.6); },
  whiff: () => noise(0.2, 700, 0.7, 0.28, 0.05),
  homerun: () => { noise(0.1, 2800, 1.2, 1.0); tone(1300, 0.1, 0.6, 'triangle'); },
  cheer: () => { noise(2.0, 1300, 0.4, 0.55, 0.35); noise(1.6, 600, 0.5, 0.3, 0.3); },
  ooh: () => noise(0.9, 900, 0.5, 0.3, 0.2),
  strikeout: () => { tone(660, 0.12, 0.25, 'square', 1); setTimeout(() => tone(880, 0.18, 0.25, 'square', 1), 120); },
};
export function playSound(name) { try { SOUNDS[name] && SOUNDS[name](); } catch (e) { /* 소리 실패는 무시 */ } }

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
