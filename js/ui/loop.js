// 프레임 루프: 프레임 간격을 상한으로 자르고, 화면이 숨겨지면 멈춘다.
import { CONFIG } from '../config.js';

export const clampDt = (dtMs, maxMs = CONFIG.MAX_DT_MS) => Math.max(0, Math.min(maxMs, dtMs));

export function startLoop(onFrame) {
  let last = null, running = true, paused = false, id = 0;
  const tick = now => {
    if (!running) return;
    id = requestAnimationFrame(tick);
    if (paused) { last = null; return; }
    const dt = last == null ? 0 : clampDt(now - last);
    last = now;
    onFrame(dt, now);
  };
  const onVis = () => { paused = document.hidden; };
  document.addEventListener('visibilitychange', onVis);
  id = requestAnimationFrame(tick);
  return {
    stop() { running = false; cancelAnimationFrame(id); document.removeEventListener('visibilitychange', onVis); },
    pause() { paused = true; },
    resume() { paused = false; },
  };
}
