// 기록 백업: 이 게임이 폰(브라우저 저장소)에 남긴 모든 것(시즌·육성·타순·기록·설정)을 파일 하나로 묶고, 그 파일로 되돌린다.
// 브라우저 방문 기록을 지우면서 사이트 데이터까지 지우면 저장소가 비므로, 파일로 따로 보관해 둔다.
// 저장소(storage)는 localStorage 모양({ length, key(i), getItem, setItem, removeItem })이면 된다
export const BACKUP_APP = 'samsung-baseball';
export const BACKUP_AT = 'bb.backupAt';                 // 마지막으로 백업(또는 되돌린) 시각. 백업 파일에는 넣지 않는다
const RAISE_KEY = 'baseball.raise.v1', CAREER_KEY = 'baseball.career.v1';
export const ownKey = k => /^(baseball\.|bb\.)/.test(k) && k !== BACKUP_AT;
const DAY = 86400000;

const ownKeys = storage => {
  const ks = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k != null && ownKey(k)) ks.push(k); }
  return ks;
};

export function makeBackup(storage, now = Date.now()) {
  const data = {};
  for (const k of ownKeys(storage)) data[k] = storage.getItem(k);
  return { app: BACKUP_APP, v: 1, at: now, data };
}

// 파일 이름: 삼성야구-백업-20261119-1402.json
export const backupName = (now = Date.now()) => {
  const d = new Date(now), p = n => String(n).padStart(2, '0');
  return `삼성야구-백업-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
};

// 무엇이 들어 있나(되돌리기 전에 보여 준다): { raise: 키우는 선수 수, seasons: 마친 시즌 수, season: 진행 중인 시즌 연도 | null }
export function summarize(data) {
  const parse = k => { try { return JSON.parse(data[k]); } catch (e) { return null; } };
  const r = parse(RAISE_KEY), c = parse(CAREER_KEY);
  return {
    raise: r && Array.isArray(r.slots) ? r.slots.filter(Boolean).length : 0,
    seasons: c && Array.isArray(c.history) ? c.history.length : 0,
    season: c && c.season && c.season.year ? c.season.year : null,
  };
}

// 파일 내용(글자) → { ok, backup, summary } 또는 { ok: false, reason: 'json' | 'format' | 'empty' }
export function readBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch (e) { return { ok: false, reason: 'json' }; }
  if (!b || b.app !== BACKUP_APP || b.v !== 1 || !b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return { ok: false, reason: 'format' };
  const ks = Object.keys(b.data);
  if (ks.some(k => !ownKey(k) || typeof b.data[k] !== 'string')) return { ok: false, reason: 'format' };
  if (!ks.length) return { ok: false, reason: 'empty' };
  return { ok: true, backup: b, summary: summarize(b.data) };
}

// 지금 기록을 지우고 백업으로 되돌린다. 하나라도 못 쓰면 원래대로 돌려놓고 false
export function restoreBackup(storage, backup, now = Date.now()) {
  const before = makeBackup(storage).data;
  const put = data => { for (const k of ownKeys(storage)) storage.removeItem(k); for (const [k, v] of Object.entries(data)) storage.setItem(k, v); };
  try { put(backup.data); storage.setItem(BACKUP_AT, String(now)); return true; }
  catch (e) { try { put(before); } catch (e2) { /* 저장소가 막혔다 */ } return false; }
}

export const markBackup = (storage, now = Date.now()) => { try { storage.setItem(BACKUP_AT, String(now)); } catch (e) { /* 무시 */ } };
// 마지막 백업 뒤 며칠 지났나(한 번도 안 했으면 null)
export const backupAge = (storage, now = Date.now()) => {
  let t = null;
  try { t = Number(storage.getItem(BACKUP_AT)); } catch (e) { return null; }
  return t > 0 ? Math.max(0, Math.floor((now - t) / DAY)) : null;
};
// 지킬 기록이 있나(시즌을 했거나 육성 선수가 있다)
export const hasProgress = storage => { const s = summarize(makeBackup(storage).data); return s.raise > 0 || s.seasons > 0 || s.season != null; };
