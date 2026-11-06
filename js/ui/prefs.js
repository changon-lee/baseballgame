// 플레이 설정(이 기기에만 저장): 궤적 안내, 타격 난이도
// guide: 내가 칠 때 상대 공이 올 길을 대략 보여 준다
// level: 'easy' | 'normal' | 'hard' — 어려울수록 배트(칠 수 있는 원)가 작고, 어려움에선 궤적 안내가 안 보인다
const KEY = 'bb.prefs';
const DEF = { guide: true, level: 'normal' };
export const LEVELS = ['easy', 'normal', 'hard'];
export const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };

export function loadPrefs() {
  try {
    const p = { ...DEF, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') };
    if (!LEVELS.includes(p.level)) p.level = p.hard ? 'hard' : 'normal';   // 예전 설정(hard: true/false)
    delete p.hard;
    return p;
  } catch (e) { return { ...DEF }; }
}
export function savePrefs(p) {
  try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 저장 못 해도 이번 경기엔 적용 */ }
}
