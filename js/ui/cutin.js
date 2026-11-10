// 컷인: 홈런 · 삼진 · 승리 장면.
// 기본은 코드로 만든 연출(CSS 애니메이션)이고, assets/cutin/manifest.json 에 영상·그림을 적어 두면 그걸 연출 뒤에 깔아 준다.
//   manifest 예: { "homerun": "homerun.webm", "strikeout": "k.mp4", "win": "win.webp" }  (키 = 아래 종류 이름)

// 종류별 길이(ms). 경기 화면은 이 시간만큼 결과 글자를 숨기고 컷인을 보여 준다
export const CUT_MS = { homerun: 2400, homerun_bad: 1700, strikeout: 1600, win: 4800 };

// 이번 공의 결과에 어떤 컷인을 보여 줄까(없으면 null)
//   r: 결과({ event, runs }), prev: 이 공 이전 경기 상태(볼카운트), userPitched: 내가 던진 공인가
export function cutinFor(r, prev, userPitched) {
  if (r.event === 'HR') return userPitched ? 'homerun_bad' : 'homerun';     // 내가 치면 축하, 맞으면 탄식
  if (r.event === 'STRIKE' && prev.strikes === 2 && userPitched) return 'strikeout';
  return null;
}
export const HR_NAME = { 1: '솔로 홈런', 2: '투런 홈런', 3: '쓰리런 홈런', 4: '만루 홈런' };

// ── 영상·그림 파일(선택) ──
const BASE = new URL('../../assets/cutin/', import.meta.url);
let manifest = null, loading = null;
function loadManifest() {
  if (loading || typeof fetch !== 'function') return loading;
  loading = fetch(new URL('manifest.json', BASE)).then(r => (r.ok ? r.json() : {})).then(m => { manifest = m && typeof m === 'object' ? m : {}; }).catch(() => { manifest = {}; });
  return loading;
}
const isVideo = f => /\.(webm|mp4|mov)$/i.test(f);
function mediaHtml(kind) {
  const f = manifest && typeof manifest[kind] === 'string' ? manifest[kind] : null;
  if (!f || /[\\/]/.test(f)) return '';                                   // 파일 이름만 허용
  const url = new URL(f, BASE).href;
  return isVideo(f)
    ? `<video class="c-media" src="${url}" autoplay muted playsinline loop onerror="this.remove()"></video>`
    : `<img class="c-media" src="${url}" alt="" onerror="this.remove()">`;
}

const COLORS = ['#ffd23f', '#ffffff', '#4b8fff', '#ff5d5d', '#3ddc84', '#ff9d3d'];
const confetti = n => Array.from({ length: n }, () => {
  const l = Math.random() * 100, d = 1.6 + Math.random() * 1.6, de = Math.random() * 0.9, r = Math.floor(Math.random() * 720 - 360);
  const s = 6 + Math.random() * 7, c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return `<i class="c-conf" style="left:${l.toFixed(1)}%;--d:${d.toFixed(2)}s;--de:${de.toFixed(2)}s;--r:${r}deg;--s:${s.toFixed(1)}px;background:${c}"></i>`;
}).join('');
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const HTML = {
  homerun: sub => `<div class="c-flash"></div><div class="c-rays"></div>
    <div class="c-band"><b>HOME RUN</b></div><div class="c-sub">${sub || '홈런!!'}</div><i class="c-ball">⚾</i>`,
  homerun_bad: sub => `<div class="c-dim"></div><div class="c-emoji">😱</div><div class="c-title">피홈런</div><div class="c-sub">${sub || ''}</div>`,
  strikeout: () => `<div class="c-dim"></div><div class="c-k">K</div><div class="c-slash"></div><div class="c-title">STRIKE OUT</div><div class="c-sub">삼진!</div>`,
  win: () => `<div class="c-trophy">🏆</div><div class="c-title">VICTORY</div>`,
};

// layer: 경기 화면 위에 얹는 빈 칸(pointer-events: none). 돌려주는 play(kind, { sub })는 컷인을 하나 띄운다
export function createCutins(layer) {
  loadManifest();
  return {
    play(kind, { sub = '' } = {}) {
      if (!layer || !HTML[kind]) return;
      const ms = CUT_MS[kind], el = document.createElement('div');
      el.className = `cutin k-${kind}`; el.style.setProperty('--ms', ms + 'ms');
      const party = (kind === 'homerun' || kind === 'win') && !reduced();
      el.innerHTML = mediaHtml(kind) + HTML[kind](sub) + (party ? confetti(kind === 'win' ? 70 : 36) : '');
      layer.appendChild(el);
      setTimeout(() => el.remove(), ms + 250);
    },
    clear() { if (layer) layer.innerHTML = ''; },
  };
}
