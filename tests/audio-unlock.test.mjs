// 아이폰 소리: 오디오는 '손을 뗄 때(touchend/pointerup/click)' 깨워야 하고, 무음 스위치에도 소리가 나게 한다 (ui/feedback.js)
// 사파리처럼 굴러가는 가짜 document/window 로 확인한다: pointerdown 안에서는 resume 이 안 먹는다
import { test } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
const on = (type, fn) => { (listeners[type] ||= []).push(fn); };
let gesture = false;                       // 지금 사용자 활성 이벤트(손 뗌·클릭) 안인가
const made = [];
class FakeAC {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; made.push(this); }
  resume() { if (gesture) this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  node() { const p = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} }); return { gain: p(), threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), frequency: p(), Q: p(), playbackRate: p(), connect: x => x || {}, start() {}, stop() {} }; }
  createDynamicsCompressor() { return this.node(); }
  createGain() { return this.node(); }
  createBufferSource() { return this.node(); }
  createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
  decodeAudioData() {}
}
globalThis.document = { hidden: false, addEventListener: on };
globalThis.window = { AudioContext: FakeAC, addEventListener: on };
Object.defineProperty(globalThis, 'navigator', { value: { audioSession: { type: 'auto' } }, configurable: true });
globalThis.fetch = () => Promise.reject(new Error('no network'));

const fire = (type, isGesture) => { gesture = isGesture; for (const fn of listeners[type] || []) fn({ type }); gesture = false; };

test('iPhone: a touch that only goes down does not unlock, lifting the finger does', async () => {
  const fb = await import('../js/ui/feedback.js');
  gesture = false; fb.unlockAudio();                 // 게임 화면 pointerdown 에서 부른 것: 사파리는 여기서 resume 을 거절한다
  assert.equal(made.length, 1);
  assert.equal(made[0].state, 'suspended');
  fire('touchend', true);                            // 손을 떼는 순간 다시 깨운다
  assert.equal(made[0].state, 'running');
  assert.equal(made.length, 1, 'one AudioContext only');
  assert.equal(fb.audioDebug().state, 'running');
});

test('iPhone: comes back after the app was in the background or a call interrupted it', async () => {
  const fb = await import('../js/ui/feedback.js');
  made[0].state = 'interrupted';                     // 사파리 전용 상태(전화·다른 앱 소리)
  fire('click', true);
  assert.equal(fb.audioDebug().state, 'running');
});

test('iPhone: the silent switch does not mute the game (audio session is playback)', async () => {
  await import('../js/ui/feedback.js');
  fire('pointerup', true);
  assert.equal(navigator.audioSession.type, 'playback');
});
