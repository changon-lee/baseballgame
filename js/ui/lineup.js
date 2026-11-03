// 타순 편집: 두 선수를 차례로 탭하면 자리를 바꾼다. 벤치 선수 ↔ 타순 선수면 교체.
import { saveLineup } from '../core/team.js';

export function showLineup(root, team, storage, lineup, onDone) {
  const order = [...lineup.order];
  let starterId = lineup.starterId, picked = null, note = '', done = false;
  const finish = l => { if (done) return; done = true; onDone(l); };   // 한 번만 나간다
  const byId = id => team.batters.find(b => b.id === id);
  const batsLabel = b => (b.bats === 'L' ? '좌' : b.bats === 'R' ? '우' : '양');

  const render = () => {
    const bench = team.batters.filter(b => !order.includes(b.id));
    const row = (b, slot) => `
      <button class="pl ${picked === b.id ? 'picked' : ''}" data-id="${b.id}">
        <span class="slot">${slot}</span><span class="nm">${b.name}</span><span class="pos">${b.pos}</span>
        <span class="bats">${batsLabel(b)}타</span>
        <span class="st">파${b.power} 컨${b.contact} 선${b.eye}</span>
      </button>`;
    root.innerHTML = `
    <div class="screen lineup">
      <header class="bar"><button class="ghost small" id="back">←</button><h2>${team.name} 타순</h2></header>
      <p class="hint">${picked ? '바꿀 선수를 한 번 더 탭하세요' : '두 선수를 차례로 탭하면 자리가 바뀌어요'}</p>
      <div class="list">${order.map((id, i) => row(byId(id), i + 1)).join('')}</div>
      <h3>벤치</h3>
      <div class="list">${bench.map(b => row(b, '–')).join('')}</div>
      <h3>선발투수</h3>
      <div class="chips">${team.pitchers.filter(p => p.role === 'SP').map(p => `
        <button class="chip ${p.id === starterId ? 'on' : ''}" data-sp="${p.id}">${p.name}<small>${p.velo}km · 제구 ${p.control}</small></button>`).join('')}
      </div>
      ${note ? `<p class="note">${note}</p>` : ''}
      <div class="menu-actions"><button class="primary" id="save">저장</button></div>
    </div>`;
    root.querySelectorAll('[data-id]').forEach(el => { el.onclick = () => tap(el.dataset.id); });
    root.querySelectorAll('[data-sp]').forEach(el => { el.onclick = () => { starterId = el.dataset.sp; render(); }; });
    root.querySelector('#back').onclick = () => finish({ order: [...order], starterId });
    root.querySelector('#save').onclick = () => {
      const l = { order: [...order], starterId };
      if (saveLineup(storage, team, l)) return finish(l);
      note = '이 브라우저에서는 저장이 안 돼요 (이번 경기에만 적용돼요)';
      render();
      setTimeout(() => finish(l), 1400);
    };
  };

  const tap = id => {
    if (!picked) { picked = id; return render(); }
    if (picked === id) { picked = null; return render(); }
    const a = order.indexOf(picked), b = order.indexOf(id);
    if (a >= 0 && b >= 0) [order[a], order[b]] = [order[b], order[a]];
    else if (a >= 0) order[a] = id;
    else if (b >= 0) order[b] = picked;
    picked = null;
    render();
  };
  render();
}
