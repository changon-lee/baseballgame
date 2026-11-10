// 소리 크기 바(효과음 · 배경음). 경기 진행 메뉴와 허브 설정이 같이 쓴다.
import { unlockAudio, previewSound } from './feedback.js';

// key: 'sfxVol'(효과음) | 'ambVol'(배경음 = 관중·응원), value: 0~1
export const volRow = (icon, label, key, value) => {
  const pct = Math.round(Math.max(0, Math.min(1, +value)) * 100);
  return `<label class="vol"><span>${icon} ${label}</span>`
    + `<input type="range" min="0" max="100" step="5" value="${pct}" data-vol="${key}" style="--p:${pct}%" aria-label="${label} 크기">`
    + `<em>${pct}%</em></label>`;
};

// onInput(v): 움직이는 동안 계속(0~1). onCommit(): 손을 뗐을 때 한 번(저장 등). 뗄 때 들어 볼 소리도 난다
export function bindVol(el, onInput, onCommit) {
  const em = el.parentElement.querySelector('em');
  el.addEventListener('input', () => {
    el.style.setProperty('--p', el.value + '%');
    if (em) em.textContent = el.value + '%';
    onInput(+el.value / 100);
  });
  el.addEventListener('change', () => {
    unlockAudio();
    onCommit();
    previewSound(el.dataset.vol === 'ambVol' ? 'amb' : 'sfx');
  });
}
