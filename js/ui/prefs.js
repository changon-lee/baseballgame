// 플레이 설정(이 기기에만 저장): 궤적 안내, 타격 난이도
// guide: 내가 칠 때 상대 공이 올 길을 대략 보여 준다 / hard: 배트가 작아지고 궤적 안내가 안 보인다
const KEY = 'bb.prefs';
const DEF = { guide: true, hard: false };

export function loadPrefs() {
  try { return { ...DEF, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEF }; }
}
export function savePrefs(p) {
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 저장 못 해도 이번 경기엔 적용 */ }
}
