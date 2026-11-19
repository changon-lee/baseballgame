// 기록 백업 창(메인 화면에서 연다): 백업 파일 저장 · 백업 파일로 되돌리기
import { makeBackup, backupName, readBackup, restoreBackup, markBackup, backupAge, summarize } from '../core/backup.js';

const sumText = s => [s.raise ? `육성 선수 ${s.raise}명` : '', s.season ? `시즌모드 ${s.season} 시즌 진행 중` : s.seasons ? `시즌모드 ${s.seasons}시즌` : ''].filter(Boolean).join(' · ') || '저장된 진행이 거의 없어요';
const when = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export const ageText = n => (n == null ? '아직 백업한 적이 없어요' : n === 0 ? '오늘 백업했어요' : `마지막 백업 ${n}일 전`);

// 파일을 폰에 남긴다: 공유 창(카카오톡·드라이브·파일 앱)이 되면 그걸로, 아니면 내려받기. 저장했으면 true
async function saveFile(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ files: [file], title: '삼성 라이온즈 야구 기록 백업' });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;     // 공유 창을 닫았다
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

export function showBackup(root, storage, onClose) {
  const el = document.createElement('div');
  el.className = 'bk';
  root.appendChild(el);
  const close = () => { el.remove(); onClose(); };
  const view = (note = '') => {
    const now = summarize(makeBackup(storage).data);
    el.innerHTML = `<div class="bk-card" role="dialog" aria-label="기록 백업">
      <h2>기록 백업</h2>
      <p class="bk-now"><b>지금 기록</b>${sumText(now)}<small>${ageText(backupAge(storage))}</small></p>
      <p class="bk-hint">기록은 이 폰의 브라우저에만 저장돼요. 인터넷 사용 기록을 지울 때 <b>사이트 데이터</b>까지 지우면 사라지니, 파일로 저장해 두세요. 폰을 바꿀 때도 이 파일로 옮겨요.</p>
      ${note ? `<p class="bk-note">${note}</p>` : ''}
      <button class="primary" data-act="save">백업 파일 저장</button>
      <button class="ghost" data-act="load">백업 파일로 되돌리기</button>
      <button class="ghost small bk-x" data-act="close">닫기</button>
      <input type="file" accept=".json,application/json" hidden>
    </div>`;
    const input = el.querySelector('input');
    el.querySelector('[data-act=close]').onclick = close;
    el.querySelector('[data-act=save]').onclick = async () => {
      const b = makeBackup(storage), ok = await saveFile(JSON.stringify(b), backupName(b.at));
      if (ok) { markBackup(storage, b.at); view('✅ 백업 파일을 저장했어요. 카카오톡 나에게 보내기나 드라이브처럼 지워지지 않는 곳에 두세요.'); }
    };
    el.querySelector('[data-act=load]').onclick = () => input.click();
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const r = readBackup(await f.text());
      if (!r.ok) return view(`⚠️ ${r.reason === 'empty' ? '비어 있는 백업 파일이에요' : '이 게임의 백업 파일이 아니에요'}`);
      confirmView(r);
    };
  };
  const confirmView = r => {
    el.innerHTML = `<div class="bk-card" role="dialog" aria-label="백업으로 되돌리기">
      <h2>이 백업으로 되돌릴까요?</h2>
      <p class="bk-now"><b>${when(r.backup.at)} 백업</b>${sumText(r.summary)}</p>
      <p class="bk-hint warn">지금 이 폰에 있는 기록은 <b>모두 지워지고</b> 백업 파일의 기록으로 바뀌어요.</p>
      <button class="primary" data-act="yes">되돌리기</button>
      <button class="ghost" data-act="no">취소</button>
    </div>`;
    el.querySelector('[data-act=no]').onclick = () => view();
    el.querySelector('[data-act=yes]').onclick = () => {
      if (!restoreBackup(storage, r.backup)) return view('⚠️ 저장소에 쓰지 못했어요. 지금 기록은 그대로예요.');
      location.reload();                                // 화면들이 들고 있는 기록을 새로 읽는다
    };
  };
  el.onclick = e => { if (e.target === el) close(); };
  view();
}
