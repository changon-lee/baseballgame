# 삼성 라이온즈 야구게임 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 브라우저에서 바로 하는 삼성 라이온즈 vs KBO 구단 야구게임. 투구는 조준점 드래그 → 구종 선택 → 타이밍 게이지, 타격은 타이밍 터치. GitHub Pages로 배포한다.

**Architecture:** 빌드 없는 정적 사이트(ES 모듈 + Canvas 2D)다. 게임 규칙, 투구, 타격, 결과 판정, 컴퓨터 AI는 DOM을 모르는 순수 함수 모듈(`js/core/`)로 두고 Node 내장 테스트 러너로 검증한다. 화면과 입력, 소리, 진동은 `js/ui/`에 두고 폰에서 직접 해보며 확인한다.

**Tech Stack:** HTML/CSS/JavaScript(ES2020 모듈), Canvas 2D, Web Audio API(효과음 직접 합성), Vibration API(안드로이드만), `localStorage`, Node 20+ `node --test`(테스트 전용, 배포물에 포함 안 됨), 로컬 미리보기는 `python -m http.server`.

**Spec:** `docs/superpowers/specs/2026-11-03-baseball-game-design.md`

## Global Constraints

- 모바일 웹브라우저(안드로이드 크롬, 아이폰 사파리), **세로 화면** 기준. 설치 없음.
- 진동은 안드로이드만(`navigator.vibrate`). 아이폰은 진동 없이 타격음 + 화면 흔들림.
- 선수는 KBO 실명. 명단·능력치는 코드와 분리된 데이터 파일(`js/data/rosters.js`)에 둔다.
- 저장은 브라우저 저장소만, 저장 대상은 **타순(+선발투수)뿐**. 진행 중 경기는 저장 안 함.
- 이닝 수는 경기 전 **3 / 5 / 9** 선택, 기본 9.
- 수비·주루는 자동. 사용자가 하는 건 투구와 타격, 감독 기능은 **타순 짜기와 투수 교체만**.
- 시즌, 트레이드, 육성, 온라인, 3D 없음.
- 배포는 GitHub Pages(공개 저장소), 빌드 단계 없이 정적 파일 그대로.
- 런타임 외부 의존성 0개(CDN 포함). 테스트도 npm 패키지 없이 `node:test`, `node:assert`만 쓴다.
- 모든 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 줄을 붙인다.

## Review Focus

1. **터치 지연** — 타격 판정은 `pointerdown` 이벤트의 `event.timeStamp`와 공 도착 예정 시각(같은 `performance.now()` 기준)의 차이로 계산한다. 렌더 프레임 시각으로 판정하면 안 된다. → Task 5의 `swingResult`가 시각을 숫자 인자로만 받는지 테스트한다.
2. **손가락이 조준점을 가림** — 조준점은 손가락 위치보다 위쪽으로 띄워서 표시하고, 존 밖 일정 범위로 제한한다. → Task 4의 `aimFromTouch` 테스트.
3. **경기가 끝나지 않음** — 연장 상한(설정 이닝 + 2), 끝내기, 9회초 종료 후 홈팀 리드 시 9회말 생략, 상한 동점은 무승부. → Task 3 테스트.
4. **저장소 막힘 / 옛 저장 데이터** — 사파리 개인정보 보호 모드에서 `localStorage`가 예외를 던지거나, 명단 파일을 고친 뒤 저장된 타순에 없는 선수가 있으면 기본 타순으로 돌아가야 한다. → Task 6 테스트.
5. **화면 꺼짐 / 탭 전환** — 돌아왔을 때 프레임 간격이 몇 초로 튀어서 공이 순간이동하거나 게이지가 이상해지면 안 된다. 프레임 간격은 상한으로 자르고, `visibilitychange`로 숨겨지면 일시정지한다. → Task 7의 `clampDt` 테스트.

---

## File Structure

```
index.html            진입점, viewport/터치 설정, 화면 컨테이너
style.css             세로 레이아웃, 큰 버튼, touch-action 차단
.nojekyll             GitHub Pages가 파일을 그대로 서빙하도록
js/config.js          조정용 상수 모음(속도 배율, 판정 창 등)
js/data/rosters.js    10개 구단 명단·능력치 (사용자가 PC에서 고치는 파일)
js/core/rng.js        시드 가능한 난수
js/core/rules.js      볼카운트, 아웃, 주자, 점수, 이닝, 경기 종료
js/core/pitch.js      구종 표, 게이지, 피로, 투구 계산, 조준점 변환
js/core/batting.js    스윙 판정(타이밍 → 헛스윙/파울/인플레이 + 타구질)
js/core/outcome.js    타구질 → 아웃/안타/장타/홈런/병살
js/core/ai.js         컴퓨터 투수 선택, 컴퓨터 타자 스윙
js/core/team.js       타순 검증, 저장/불러오기, 불펜 사용 가능 여부
js/core/match.js      한 경기 진행(위 모듈 조합, 투수 교체, 투구 수)
js/ui/loop.js         rAF 루프, clampDt, 일시정지
js/ui/feedback.js     효과음 합성, 진동, 화면 흔들림
js/ui/menu.js         상대팀·이닝 선택 화면
js/ui/lineup.js       타순·선발투수 화면
js/ui/game.js         경기 화면(캔버스 그리기, 투구/타격 입력, 교체 버튼)
js/main.js            화면 전환
tests/*.test.mjs      core 모듈 테스트
```

좌표 규칙(모든 core 모듈 공통): 스트라이크존은 정규화 좌표 `x ∈ [-1, 1]`(왼쪽→오른쪽, 포수 시점), `y ∈ [-1, 1]`(아래→위)다. `|x| ≤ 1 && |y| ≤ 1`이면 스트라이크다. 공 반지름은 무시한다.

---

### Task 1: 프로젝트 뼈대, 난수, 설정

**Files:**
- Create: `index.html`, `style.css`, `.nojekyll`, `.gitignore`, `js/config.js`, `js/core/rng.js`, `js/main.js`
- Test: `tests/rng.test.mjs`

**Interfaces:**
- Produces: `createRng(seed: number) => () => number` (0 이상 1 미만, mulberry32), `randNormal(rng) => number` (Box–Muller, 평균 0 표준편차 1)
- Produces: `js/config.js`의 `export const CONFIG = { SPEED_SCALE: 1.6, MOUND_DISTANCE_M: 18.44, MAX_DT_MS: 50, EXTRA_INNINGS: 2 }` (이후 Task가 키를 추가함)

- [ ] **Step 1: Node 확인** — Run: `node --version` / Expected: `v20` 이상. 인식이 안 되면 터미널을 다시 시작해 달라고 사용자에게 요청하고 멈춘다.
- [ ] **Step 2: git 초기화** — `git init -b main`. `.gitignore`에 `node_modules/`, `.DS_Store`를 넣는다.
- [ ] **Step 3: 실패하는 테스트 작성** `tests/rng.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randNormal } from '../js/core/rng.js';

test('same seed gives same sequence', () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
test('values are in [0,1)', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) { const v = r(); assert.ok(v >= 0 && v < 1); }
});
test('randNormal has mean near 0', () => {
  const r = createRng(7); let s = 0;
  for (let i = 0; i < 5000; i++) s += randNormal(r);
  assert.ok(Math.abs(s / 5000) < 0.05);
});
```

- [ ] **Step 4: 실패 확인** — Run: `node --test tests/` / Expected: FAIL (모듈 없음)
- [ ] **Step 5: `js/core/rng.js` 구현** (위 Interfaces 시그니처대로)
- [ ] **Step 6: 뼈대 작성** — `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`, `<div id="app">`, `<script type="module" src="js/main.js">`. `style.css`: `html,body{margin:0;height:100%;overscroll-behavior:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}`, 삼성 블루 `#074CA1` 기반 색. `js/main.js`는 일단 "삼성 라이온즈 야구" 제목만 그린다. `.nojekyll`은 빈 파일.
- [ ] **Step 7: 통과 확인** — Run: `node --test tests/` / Expected: PASS 3. 그리고 `python -m http.server 8000`을 띄우고 `curl -s localhost:8000 | grep viewport`로 viewport 줄이 나오는지 확인한다.
- [ ] **Step 8: 커밋** — `git add -A && git commit -m "chore: scaffold static site, rng, test runner"`

---

### Task 2: 10개 구단 명단 데이터

**Files:**
- Create: `js/data/rosters.js`
- Test: `tests/rosters.test.mjs`

**Interfaces:**
- Produces:

```js
// 능력치는 모두 1~100 정수. velo만 km/h(최고 구속).
// Batter  { id, name, pos, bats:'L'|'R'|'S', power, contact, eye }
// Pitcher { id, name, throws:'L'|'R', role:'SP'|'RP', velo, control, stamina, pitches: PitchType[] }
// Team    { id, name, short, color, batters: Batter[], pitchers: Pitcher[] }
export const TEAMS;          // Team[] 길이 10
export const USER_TEAM_ID;   // 'samsung'
export function getTeam(id)  // Team | undefined
```

- `id`는 구단 안에서 유일하다(예: `'samsung-b01'`, `'samsung-p01'`).
- PitchType은 `'FB'|'SI'|'SL'|'CU'|'CH'|'FO'|'CT'` 중에서 고른다(Task 4가 정의).

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEAMS, USER_TEAM_ID, getTeam } from '../js/data/rosters.js';
const PT = ['FB','SI','SL','CU','CH','FO','CT'];

test('10 teams, samsung included', () => {
  assert.equal(TEAMS.length, 10);
  assert.equal(getTeam(USER_TEAM_ID).name, '삼성 라이온즈');
});
for (const t of TEAMS) test(`${t.id} roster is playable`, () => {
  assert.ok(t.batters.length >= 9);
  assert.ok(t.pitchers.filter(p => p.role === 'SP').length >= 2);
  assert.ok(t.pitchers.filter(p => p.role === 'RP').length >= 4);
  const ids = [...t.batters, ...t.pitchers].map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of t.batters) for (const k of ['power','contact','eye'])
    assert.ok(Number.isInteger(b[k]) && b[k] >= 1 && b[k] <= 100, `${b.name}.${k}`);
  for (const p of t.pitchers) {
    assert.ok(p.velo >= 130 && p.velo <= 165, p.name);
    for (const k of ['control','stamina']) assert.ok(p[k] >= 1 && p[k] <= 100);
    assert.ok(p.pitches.includes('FB') || p.pitches.includes('SI'));
    assert.ok(p.pitches.every(x => PT.includes(x)));
  }
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rosters.test.mjs` / Expected: FAIL
- [ ] **Step 3: 데이터 작성** — 10개 구단(삼성, LG, KIA, 두산, KT, SSG, 롯데, 한화, NC, 키움)마다 알고 있는 2026 시즌 기준 주전 야수 9~12명, 선발 2~3명, 불펜 4~6명을 넣는다. 능력치는 실제 성적과 평판으로 매기되 리그 평균 타자를 약 50, 최상급을 85~95로 둔다. 선발 stamina는 70~95, 불펜은 25~45로 한다. 파일 맨 위에 한국어 주석으로 "능력치 뜻과 범위, 고치는 법"을 적는다. 사용자가 이 파일을 직접 고친다.
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `git commit -am "feat: add KBO rosters" ` (새 파일은 `git add` 먼저)

---

### Task 3: 경기 규칙

**Files:**
- Create: `js/core/rules.js`
- Test: `tests/rules.test.mjs`

**Interfaces:**
- Produces:

```js
// EventType: 'BALL'|'STRIKE'|'FOUL'|'OUT'|'SAC_FLY'|'DOUBLE_PLAY'|'SINGLE'|'DOUBLE'|'TRIPLE'|'HR'
// GameState {
//   innings, maxInnings, inning, half:'top'|'bottom', outs, balls, strikes,
//   bases:[bool,bool,bool], score:{away,home}, battingIndex:{away,home},
//   over:boolean, result: null|'home'|'away'|'draw'
// }
export function createGameState({ innings }): GameState      // maxInnings = innings + CONFIG.EXTRA_INNINGS
export function battingSide(state): 'away'|'home'           // top → away
export function applyEvent(state, type: EventType): { state: GameState, runs: number, paEnded: boolean }
```

- 원본 state는 변경하지 않고 새 객체를 반환한다.
- 삼성은 항상 **홈팀**이다(Claude의 결정). 이건 Task 7에서 쓰고, rules는 홈/원정만 안다.
- 진루 규칙(결정론적): `BALL` 4개면 볼넷이고 밀어내기만 한다. `SINGLE`은 모든 주자가 1루씩 가되 2루 주자는 홈인한다. `DOUBLE`은 모든 주자가 2루씩 간다(1루 주자는 3루). `TRIPLE`, `HR`은 주자 전원 홈인이다. `SAC_FLY`는 아웃 1개 + 3루 주자 홈인이다. `DOUBLE_PLAY`는 아웃 2개 + 1루 주자를 지운다. `FOUL`은 2스트라이크면 카운트를 그대로 둔다. `STRIKE` 3개면 아웃이다.
- 타석이 끝나면(`paEnded`) 카운트를 0-0으로 돌리고 `battingIndex[side] = (i+1) % 9`로 넘긴다.
- 3아웃이면 공수 교대와 주자 초기화를 한다.
- 종료 판정: (a) 말 공격 중 `inning ≥ innings`이고 홈 리드가 되는 순간 끝내기로 종료(그 플레이의 점수는 다 인정). (b) `inning ≥ innings`에서 초 종료 시 홈 리드면 종료. (c) `inning ≥ innings`에서 말 종료 시 동점이 아니면 종료. (d) `inning == maxInnings` 말 종료 시 동점이면 `'draw'`로 종료.

- [ ] **Step 1: 실패하는 테스트 작성** — 다음 테스트를 이름과 단언 그대로 쓴다.
  - `walk forces runners only`: 2루에만 주자, BALL ×4 → `bases` = `[true,true,false]`, 득점 0
  - `bases loaded walk scores 1`: 만루 BALL ×4 → `runs === 1`
  - `single scores runner from second`: 주자 1·2루 SINGLE → `bases` = `[true,true,false]`, `runs === 1`
  - `foul with two strikes keeps count`: 0-2에서 FOUL → `strikes === 2`
  - `three strikes is out and next batter`: STRIKE ×3 → `outs === 1`, `battingIndex.away === 1`
  - `sac fly scores from third`: 3루 주자 1아웃 SAC_FLY → `runs === 1`, `outs === 2`
  - `three outs switch sides`: 초 3아웃 → `half === 'bottom'`, `bases` 전부 false
  - `home leading after top of last inning ends game`: innings 3, 3회초 시작 시 홈 2:0, OUT ×3 → `over && result === 'home'`
  - `walk-off ends immediately`: 3회말 동점 주자 3루 SINGLE → `over && result === 'home'`
  - `tie after max innings is draw`: innings 3(max 5), 5회말 종료까지 동점 → `result === 'draw'`
  - `9-inning game has max 11`: `createGameState({innings:9}).maxInnings === 11`
  - 테스트용 헬퍼 `setup(overrides)`는 `{...createGameState({innings:3}), ...overrides}`로 상태를 만든다.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rules.test.mjs` / Expected: FAIL
- [ ] **Step 3: `js/core/rules.js` 구현**
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `feat: game rules state machine`

---

### Task 4: 투구 모델

**Files:**
- Create: `js/core/pitch.js`
- Modify: `js/config.js` (키 추가)
- Test: `tests/pitch.test.mjs`

**Interfaces:**
- Consumes: `createRng`, `randNormal` (Task 1), Pitcher 형태 (Task 2)
- Produces:

```js
export const PITCH_TYPES = {
  FB: { name:'직구',     speedMul:1.00, breakX: 0.00, breakY: 0.10 },
  SI: { name:'투심',     speedMul:0.97, breakX: 0.25, breakY:-0.15 },
  CT: { name:'커터',     speedMul:0.94, breakX:-0.20, breakY: 0.00 },
  SL: { name:'슬라이더', speedMul:0.88, breakX:-0.45, breakY:-0.15 },
  CU: { name:'커브',     speedMul:0.80, breakX:-0.20, breakY:-0.60 },
  CH: { name:'체인지업', speedMul:0.85, breakX: 0.25, breakY:-0.35 },
  FO: { name:'포크',     speedMul:0.86, breakX: 0.00, breakY:-0.55 },
};  // breakX는 우투수 기준이고 좌투수는 부호를 뒤집는다
export const BALL_R = 0.17;                               // 공 반지름(존 가로 반폭 기준)
export function gaugePos(elapsedMs, periodMs): number     // 0→1→0 삼각파
export function gaugeError(pos): number                   // |pos-0.5|*2, 0=완벽
export function fatigue(pitchCount, stamina): number      // clamp((pitchCount - stamina*0.5)/(stamina*0.9), 0, 1)
export function energy(pitchCount, stamina): number       // 1 - clamp(pitchCount/(stamina*1.4), 0, 1)  (체력 막대 표시용)
export function sweetWidth(control, f): number            // (0.07 + control/100*0.12) * (1 - 0.6*f)
export function gaugePeriod(f): number                    // CONFIG.GAUGE_PERIOD_MS * (1 - 0.25*f)
export function isStrike(plate): boolean                  // |x| ≤ 1+BALL_R && |y| ≤ 1+BALL_R/1.2 (공이 존에 걸치면 스트라이크)
export function computePitch({ pitcher, type, target:{x,y}, gaugePos, pitchCount, rng }):
  { type, speedKmh, plate:{x,y}, travelMs, breakX, breakY, isStrike:boolean, onTarget:boolean }
export function aimFromTouch(touch:{x,y}, zoneRect:{left,top,width,height}, liftPx): {x,y}
```

- `computePitch`의 계산은 이렇다.
  - `f = fatigue(...)`, `sweet = sweetWidth(control, f)`, `err = gaugeError(gaugePos)`, `onTarget = err <= sweet`
  - `speedKmh = velo * speedMul * (onTarget ? 1 : 0.96) * (1 - 0.07*f) * (1 - 0.01*rng())`, 소수점 버림
  - 흩어짐: `spread = (0.06 + (1-control/100)*0.25) * (onTarget ? 1 + (err/sweet)*0.8 : 2.5 + 4*err) * (1 + 1.2*f)`
  - 반환값에 `err`, `sweet`도 넣는다(UI가 "완벽/괜찮음/실패"를 표시: `err < sweet*0.35`면 완벽)
  - `isStrike: isStrike(plate)`
  - 이 수치들은 스파이크 3(`spike/index.html`)에서 사용자가 해보고 확정한 값이다.
  - `plate = target + spread * randNormal` (x, y 각각)
  - `travelMs = MOUND_DISTANCE_M / (speedKmh/3.6) * 1000 * CONFIG.SPEED_SCALE`
- `aimFromTouch`는 손가락 화면 좌표를 존 정규화 좌표로 바꾼다. 이때 `liftPx`만큼 위로 띄우고, 결과는 `[-1.6, 1.6]`으로 제한한다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `gauge is triangle wave`: `gaugePos(0,1000)===0`, `gaugePos(500,1000)===1`, `gaugePos(1000,1000)===0`, `gaugePos(250,1000)===0.5`
  - `better control widens sweet spot`: `sweetWidth(90, 0) > sweetWidth(40, 0)`
  - `fatigue narrows sweet spot`: `sweetWidth(80, 1)` ≈ `sweetWidth(80, 0) * 0.4`
  - `fatigue starts past half stamina`: `fatigue(40, 88)===0`, `fatigue(60, 88) > 0`, `fatigue(200, 30)===1`
  - `ball touching zone edge is a strike`: `isStrike({x:1.1, y:0})===true`, `isStrike({x:1.2, y:0})===false`, `isStrike({x:0, y:1.13})===true`
  - `on-target pitch lands near target`: control 80 투수, target {0.5,0.5}, gaugePos 0.5, seed 1~200 평균 오차 < 0.25
  - `off-timing pitch scatters more`: 같은 조건에서 gaugePos 0.05면 평균 오차가 on-target의 2배 이상
  - `ace throws harder than tired self`: velo 155 FB, pitchCount 0의 평균 speedKmh > pitchCount 150의 평균 + 5
  - `curve is slower than fastball`
  - `aim lifts above finger and clamps`: zoneRect `{left:100,top:100,width:200,height:200}`, touch `(200,250)`, liftPx 50 → `{x:0, y:0}`; touch `(-500,-500)` → `{x:-1.6, y:1.6}`
  - `isStrike matches zone`: plate가 존 안이면 true (rng를 고정 반환 0.5인 함수로 주입)
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/pitch.test.mjs` / Expected: FAIL
- [ ] **Step 3: 구현** — `js/core/pitch.js`를 만들고, `CONFIG`에 `GAUGE_PERIOD_MS: 900`, `AIM_LIFT_PX: 60`, `WIND_CPU_MS: 800`, `WIND_USER_MS: 550`을 추가한다.
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `feat: pitch model with gauge, control, fatigue`

---

### Task 5: 스윙 판정, 타구 결과, 컴퓨터 AI

**Files:**
- Create: `js/core/batting.js`, `js/core/outcome.js`, `js/core/ai.js`
- Modify: `js/config.js`
- Test: `tests/batting.test.mjs`, `tests/balance.test.mjs`

**Interfaces:**
- Consumes: `computePitch`, `PITCH_TYPES`, `fatigue` (Task 4), `EventType` (Task 3)
- Produces:

```js
// batting.js
export function timingWindowMs(contact): number            // 완벽 창 반폭: 18 + contact*0.3
export function swingResult({ timingDiffMs, batter, pitch, rng }):
  { kind:'MISS'|'FOUL'|'INPLAY', quality:number /*0..1*/, pull:number /*-1..1, +는 당겨침(빠른 타이밍)*/ }
// outcome.js
export function battedBall({ quality, pull, power, outs, runnerOnFirst, runnerOnThird, rng }): EventType
// ai.js
export function cpuChoosePitch({ pitcher, balls, strikes, rng }): { type, target:{x,y}, gaugePos:number }
export function cpuSwing({ batter, pitch, balls, strikes, rng }): { swing:boolean, timingDiffMs:number }
```

- `timingDiffMs = 탭 시각 - 공 도착 시각`이다. 음수는 빠른 스윙, 양수는 늦은 스윙이다. 두 시각 모두 호출하는 쪽이 넘기고, 이 모듈은 시계를 읽지 않는다. (Review Focus 1)
- `swingResult`의 동작:
  - `|diff| > timingWindowMs*5` 또는 공이 존에서 멀면(`max(|x|,|y|) > 1.5`) MISS다.
  - 그 밖에는 `quality = 1 - |diff|/(timingWindowMs*5)`에 존 이탈 감점을 `-(max(|x|,|y|)-1)*0.5`만큼 주고, 구종 변화량이 클수록 소량 감점한다.
  - `quality < 0.25`면 FOUL 또는 MISS(반반)다.
  - `pull = clamp(-diff/(timingWindowMs*3), -1, 1)`, 파울 라인 밖(`|pull| > 0.9`)이면 FOUL이다.
- `battedBall`: 홈런 확률은 `quality > 0.8`일 때 power에 비례해 커지는 식이다. 정확한 표는 구현하는 사람이 정하되, 아래 밸런스 테스트를 통과해야 한다. `OUT`이면서 `runnerOnFirst && outs < 2`면 일정 확률로 `DOUBLE_PLAY`, 뜬공 아웃이면서 `runnerOnThird && outs < 2`면 `SAC_FLY`를 반환한다.
- `cpuChoosePitch`: 카운트에 따라 존 안팎을 섞는다(2스트라이크면 유인구 비율을 올림). `gaugePos`는 `0.5 + randNormal*0.12*(1-control/100+0.3)`이다.
- `cpuSwing`: 존 안이면 스윙 확률이 높다(eye가 높을수록 존 밖 공에 덜 속음). 스윙 시 `timingDiffMs ~ Normal(0, σ)`로, σ는 contact가 높을수록 작고 구속과 변화량이 클수록 크다.

- [ ] **Step 1: 실패하는 테스트 작성** `tests/batting.test.mjs`
  - `perfect timing on middle pitch is good contact`: diff 0, plate (0,0) → `kind==='INPLAY' && quality > 0.9`
  - `very late swing misses`: diff 400 → `MISS`
  - `early swing pulls`: diff = -timingWindowMs(50) → `pull > 0`
  - `high contact has wider window`: `timingWindowMs(90) > timingWindowMs(30)`
  - `swingResult never reads the clock`: `performance.now`와 `Date.now`를 던지는 함수로 바꿔치기한 상태에서 호출해도 예외가 없어야 함
  - `sac fly only with runner on third and <2 outs`: `runnerOnThird:false`일 때 1000번 중 `SAC_FLY` 0회
- [ ] **Step 2: 실패하는 밸런스 테스트 작성** `tests/balance.test.mjs` — 시드 고정, 리그 평균 투수(velo 145, control 50, FB/SL/CH)와 평균 타자(50/50/50)로 컴퓨터 대 컴퓨터 3000타석을 시뮬레이션한다. 한 타석은 볼카운트 루프로 돌리며, 볼넷 판정은 이 테스트 안의 작은 루프에서 직접 센다. 단언은 다음과 같다.
  - 타율(안타/타수)이 `0.220 ~ 0.310`
  - 홈런/타석이 `0.01 ~ 0.05`
  - 삼진/타석이 `0.12 ~ 0.28`
  - 볼넷/타석이 `0.05 ~ 0.14`
  - 파워 90 타자의 홈런율이 파워 30 타자의 2배 이상
- [ ] **Step 3: 실패 확인** — Run: `node --test tests/` / Expected: 새 테스트 FAIL
- [ ] **Step 4: 세 모듈 구현** — 밸런스 수치는 `CONFIG`의 `BALANCE` 객체에 모아서 나중에 손볼 수 있게 한다.
- [ ] **Step 5: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS. 밸런스가 범위를 벗어나면 `CONFIG.BALANCE`만 조정한다.
- [ ] **Step 6: 커밋** — `feat: swing, batted-ball outcomes, CPU AI with balance tests`

---

### Task 6: 타순, 저장, 불펜

**Files:**
- Create: `js/core/team.js`
- Test: `tests/team.test.mjs`

**Interfaces:**
- Consumes: Team 형태, `getTeam` (Task 2)
- Produces:

```js
export function defaultLineup(team): { order: string[9], starterId: string }   // 타자 앞 9명, 첫 SP
export function isValidLineup(team, lineup): boolean   // 9명 유일, 전부 team.batters에 존재, starterId가 SP
export function loadLineup(storage, team): { order, starterId }   // storage는 localStorage 같은 객체, 예외·무효 시 default
export function saveLineup(storage, team, lineup): boolean        // 예외 시 false, 던지지 않음
export function availableRelievers(team, usedIds: Set<string>, currentId): Pitcher[]  // 사용한 투수와 현재 투수 제외
```

- 저장 키: `'baseball.lineup.' + team.id`, 값은 JSON이다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `default lineup is valid`
  - `save then load round-trips`: 메모리 객체로 만든 가짜 storage 사용
  - `throwing storage falls back to default`: `getItem`과 `setItem`이 둘 다 throw → `loadLineup`은 default, `saveLineup`은 `false` (Review Focus 4)
  - `stale lineup with removed player falls back`: 저장값에 없는 id `'gone-b99'` → default
  - `corrupt json falls back`: 저장값 `'{oops'` → default
  - `used pitchers are not available again`: 사용한 투수, 현재 투수 제외. 모두 썼으면 빈 배열
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/team.test.mjs` / Expected: FAIL
- [ ] **Step 3: `js/core/team.js` 구현**
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `feat: lineup storage and bullpen availability`

---

### Task 7: 경기 진행 (match) + 루프 유틸

**Files:**
- Create: `js/core/match.js`, `js/ui/loop.js`
- Test: `tests/match.test.mjs`, `tests/loop.test.mjs`

**Interfaces:**
- Consumes: Task 3~6의 전부
- Produces:

```js
// match.js — 삼성 = home, CPU = away
// Match { game: GameState, teams:{home,away}, lineups:{home,away},
//         pitcher:{home,away}: id, pitchCount:{home,away}, used:{home:Set,away:Set} }
export function createMatch({ userTeam, cpuTeam, userLineup, innings, rng }): Match
export function matchup(match): { batter, pitcher, userRole:'pitch'|'bat', fatigue:number }
export function playUserPitch(match, { type, target, gaugePos }, rng):
  { match, pitch, swing:{swing,timingDiffMs}|null, event: EventType }
export function cpuPitchToUser(match, rng): Pitch                     // 공 정보만 반환, 상태는 바꾸지 않음
export function resolveUserSwing(match, pitch, timingDiffMs: number|null, rng):
  { match, event: EventType }                                         // null = 스윙 안 함 → isStrike로 BALL/STRIKE
export function changePitcher(match, side, pitcherId): Match           // availableRelievers에 없는 id면 그대로 반환
export function cpuMaybeChangePitcher(match, rng): Match              // 원정 투수 fatigue ≥ 0.5면 교체
// loop.js
export function clampDt(dtMs, maxMs = CONFIG.MAX_DT_MS): number       // 0 ≤ 결과 ≤ maxMs
export function startLoop(onFrame:(dtMs)=>void): { stop(), pause(), resume() }  // visibilitychange 시 자동 pause
```

- 투구 1개를 마칠 때마다 해당 팀의 `pitchCount`가 +1 된다. 교체하면 새 투수의 카운트는 0부터 시작하고, 이전 투수는 `used`에 들어간다.
- 컴퓨터 원정팀 선발은 `rng`로 SP 중 하나를 고른다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `user pitches in top, bats in bottom`: `matchup(createMatch(...)).userRole === 'pitch'`, 초 3아웃 뒤에는 `'bat'`
  - `pitch count increments per pitch`
  - `changePitcher resets count and marks used`
  - `cannot bring back a used pitcher`
  - `no swing on strike-zone pitch is STRIKE`, `no swing on far ball is BALL`
  - `cpu changes tired pitcher`: 원정 투수 pitchCount 150 → `cpuMaybeChangePitcher` 후 id가 바뀜
  - `full CPU-vs-CPU 9 inning game ends`: 시드 1~20에서 양쪽 다 AI 함수로 자동 진행, 각각 3000투구 이내 `game.over === true` (Review Focus 3)
  - `clampDt`: `clampDt(5000) === 50`, `clampDt(-3) === 0`, `clampDt(16) === 16` (Review Focus 5)
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/` / Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현** — `startLoop`는 `requestAnimationFrame`과 `document`를 쓰므로 Node 테스트에서 import만 되고 호출되지 않게 한다. 전역 참조는 함수 안에서만 한다.
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 5: 커밋** — `feat: match controller and frame loop`

---

### Task 8: 메뉴와 타순 화면

**Files:**
- Create: `js/ui/menu.js`, `js/ui/lineup.js`
- Modify: `js/main.js`, `style.css`

**Interfaces:**
- Consumes: `TEAMS`, `USER_TEAM_ID`, `getTeam` (Task 2), `loadLineup`, `saveLineup`, `isValidLineup` (Task 6)
- Produces: `showMenu(root, onStart:({cpuTeamId, innings})=>void)`, `showLineup(root, team, onDone:(lineup)=>void)`, `main.js`의 화면 전환(메뉴 → 타순 → 경기). 경기 화면은 Task 10 전까지 "경기 화면 준비 중" 자리표시로 둔다.

- 메뉴: 상대 9개 구단 버튼(구단 색), 이닝 3/5/9 토글(기본 9), "경기 시작" 버튼이 있다. "타순 편집" 버튼은 타순 화면으로 간다.
- 타순 화면: 1~9번 타자 목록에서 두 줄을 차례로 탭하면 자리가 바뀐다(드래그보다 폰에서 확실함). 벤치 선수를 탭한 뒤 타순 선수를 탭하면 교체된다. 선발투수는 SP 중에서 고른다. "저장" 시 `saveLineup`을 호출하고, `false`면 "이 브라우저에서는 저장이 안 돼요(이번 경기에만 적용)"를 표시한다.
- 모든 버튼은 최소 높이 48px이다.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 수동 확인** — `python -m http.server 8000`, PC 브라우저 개발자도구의 모바일 화면(375×667)에서 다음을 확인한다. 상대 선택 → 이닝 선택 → 타순에서 1번↔3번 교체 → 저장 → 새로고침 후 유지. 콘솔 에러가 없어야 한다.
- [ ] **Step 3: 회귀 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 4: 커밋** — `feat: menu and lineup screens`

---

### Task 9: 2D 일러스트 아트 (선수, 구장, 타구 화면)

스파이크 3(`spike/index.html`)의 관절 리그, 배경, 타구 화면을 출발점으로 삼아 모듈로 옮기고 **더 리얼하고 섬세하게** 고도화한다.

**Files:**
- Create: `js/ui/art/rig.js`, `js/ui/art/figures.js`, `js/ui/art/stadium.js`, `js/ui/art/fieldview.js`, `js/ui/art/uniforms.js`, `art-preview.html`
- Test: `tests/rig.test.mjs`

**Interfaces:**
- Produces:

```js
// rig.js — 순수 함수(테스트 대상)
export function lerpPose(a, b, t): Pose
export function seqPose(keys: [number, Pose][], u): Pose          // ease-in-out 보간
export const BAT_POSES = { STANCE, LOAD, CONTACT, FINISH }          // 옆모습 타자, +x = 투수 쪽
export const PIT_POSES = { SET, LIFT, COCK, RELEASE, FOLLOW }       // 정면 투수, 우투 기준 던지는 팔 = -x
export function pitcherPoseAt(now, releaseAt, windMs): { pose, holdBall }
export function batterPoseAt(now, { swingAt, pitchStart, travelMs }): Pose
// uniforms.js
export function uniformFor(team, side:'home'|'away'): Uniform      // 홈=흰색+구단색, 원정=회색+구단색. Team에 colors:{main, sub}를 추가
// figures.js — ctx를 인자로 받음
export function drawBatter(ctx, { x, y, scale, facing, pose, uni, player })
export function drawPitcher(ctx, { x, y, scale, mirror, pose, uni, back, holdBall, player })
export function drawCatcherAndUmpire(ctx, view, mitt:{x,y}|null, uni)
export function drawBall(ctx, x, y, r, spin)
// stadium.js — 시점별 배경을 오프스크린 캔버스로 한 번 그려 캐시
export function buildBackdrop(kind:'catcher'|'pitcher', view, W, H, dpr, homeTeam): HTMLCanvasElement
// fieldview.js
export function planPlay(event, swing, batter, bases, rng): Play     // 스파이크의 startPlay 규칙 그대로
export function drawFieldView(ctx, W, H, play, now, uni): { landed:boolean }
```

- `Team`에 `colors: { main, sub }`를 더한다(Task 2 데이터에 추가). 예: 삼성 `{main:'#074CA1', sub:'#ffffff'}`, LG `{main:'#c30452', sub:'#1c1c22'}`.

**고도화 기준(스파이크 3 대비)** — 다음을 모두 갖춘다:
- 선수: 머리·목·몸통·팔(위팔/아래팔)·손·다리(허벅지/정강이)·신발이 분리된 리그. 각 부위에 그라데이션 명암과 하이라이트 한 줄. 유니폼은 단추선, 소매 라인, 벨트, 바지 주름, 스타킹이 보인다. 얼굴은 정면일 때 눈·눈썹·코 그림자, 옆모습일 때 코·귀 실루엣. 헬멧은 광택 하이라이트, 모자는 챙 그림자.
- 등번호와 이름은 투수 뒷모습에 표시(유니폼 색 대비).
- 동작: 와인드업 5단계(SET→LIFT→COCK→RELEASE→FOLLOW), 스윙 4단계(STANCE→LOAD→CONTACT→FINISH), 몸통이 회전하는 느낌이 나도록 어깨 폭을 단계별로 바꾼다.
- 구장: 관중(2~3가지 색 계열 + 응원 막대 점), 지붕/조명탑 실루엣, 광고판, 펜스 패딩, 잔디 줄무늬, 흙 질감(점 노이즈), 분필 라인, 홈플레이트·타석, 마운드 투수판.
- 공: 방사형 그라데이션 + 실밥, 날아올 때 회전하듯 실밥 각도가 변한다.
- 타구 화면: 수비수를 위에서 본 작은 선수(모자, 어깨, 글러브), 타구 궤적 점선, 공 높이에 따른 그림자 크기.

- [ ] **Step 1: 실패하는 테스트 작성** `tests/rig.test.mjs`
  - `lerpPose midpoint`: 두 포즈의 `t=0.5` 관절 좌표가 평균
  - `seqPose clamps ends`: `u<0`이면 첫 포즈, `u>1`이면 마지막 포즈
  - `pitcher holds ball before release, not after`: `pitcherPoseAt(release-10, release, 800).holdBall===true`, `pitcherPoseAt(release+10, ...).holdBall===false`
  - `batter is in CONTACT pose ~70ms after swing`: `batterPoseAt(swingAt+70, {swingAt})`의 `hands`가 `BAT_POSES.CONTACT.hands`와 같음
  - `all poses share the same joint keys`: 각 포즈 묶음 안에서 키 집합이 동일
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/rig.test.mjs` / Expected: FAIL
- [ ] **Step 3: `rig.js`, `uniforms.js` 구현** → 테스트 PASS
- [ ] **Step 4: `figures.js`, `stadium.js`, `fieldview.js` 구현**
- [ ] **Step 5: `art-preview.html` 작성** — 해시로 장면을 고른다(`#pitch`, `#bat`, `#swing`, `#windup`, `#field`, `#catcher`). 각 장면은 특정 순간의 포즈로 정지 화면을 그린다. 이 파일은 개발 확인용이고 메뉴에서는 연결하지 않는다.
- [ ] **Step 6: 화면 확인** — 크롬 헤드리스로 390×780 스크린샷을 장면별로 찍는다. Read 도구로 직접 보고 고도화 기준 목록을 하나씩 대조한다:
  `"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=390,780 --virtual-time-budget=1500 --screenshot=<스크래치패드>\art_<장면>.png "http://localhost:8000/art-preview.html#<장면>"`
- [ ] **Step 7: 회귀 확인 & 커밋** — `node --test tests/` PASS, `feat: detailed 2D illustration art`

---

### Task 10: 경기 화면 — 투구, 타격, 손맛

**Files:**
- Create: `js/ui/game.js`, `js/ui/feedback.js`
- Modify: `js/main.js`, `style.css`

**Interfaces:**
- Consumes: `createMatch`, `matchup`, `playUserPitch`, `cpuPitchToUser`, `resolveUserSwing`, `changePitcher`, `cpuMaybeChangePitcher` (Task 7), `startLoop`, `clampDt` (Task 7), `aimFromTouch`, `gaugePos`, `PITCH_TYPES` (Task 4), `availableRelievers` (Task 6)
- Produces: `showGame(root, { userTeam, cpuTeam, lineup, innings }, onExit)`. `feedback.js`의 `unlockAudio()`, `playSound(name:'mitt'|'hit'|'homerun'|'cheer'|'strikeout')`, `vibrate(ms)`, `shake(el, strength)`

**화면 배치(세로)**: 위에 스코어보드(이닝 초/말, 점수, B-S-O, 주자 다이아몬드), 가운데 캔버스, 아래 조작 영역. 캔버스는 Task 9의 아트 모듈로 그린다. 공수에 따라 시점이 바뀐다(투구 = 투수 뒤 시점, 타격 = 포수 뒤 시점, 인플레이 = 위에서 본 타구 화면). 시점 좌표 변환, 공 궤적(원근 + 늦게 꺾이는 변화구), 릴리스 지점은 스파이크 3의 `makeView`, `toS/fromS`, `ballScreen`, `releasePoint`를 따른다.

**투구(수비 이닝)**
1. 존 위에서 손가락을 누른 채 끈다. `aimFromTouch`로 손가락보다 위에 조준점이 보인다.
2. 손을 떼면 조준점이 고정되고, 아래에 그 투수의 구종 버튼이 나온다.
3. 구종을 누르면 게이지가 `gaugePos(elapsed, gaugePeriod(f))`로 왕복한다. 가운데에 `sweetWidth(control, f)`만큼 초록 구간이 있고, 그 가운데 35% 폭은 더 밝은 "완벽" 구간이다. 표시와 판정에 같은 값을 쓴다. 터치하면 내 투수가 `CONFIG.WIND_USER_MS` 동안 와인드업한 뒤 공을 놓는다.
4. 화면 아무 곳이나 탭하면 투구한다 → `playUserPitch`. 공이 `travelMs` 동안 날아가고, 컴퓨터 타자 스윙 애니메이션 후 결과 텍스트(스트라이크/볼/안타/홈런...)와 소리가 난다.
5. 구속을 "147km/h"처럼 표시한다.

**타격(공격 이닝)**
1. 짧은 대기(0.8~1.6초 랜덤) 후 `cpuPitchToUser`로 공이 날아온다. 공은 멀리서 작게 시작해 커지며 `breakX/breakY`만큼 휘어 `plate`에 도착한다.
2. `pointerdown`의 `event.timeStamp`와 `도착시각 = 투구시작 performance.now() + travelMs`로 `timingDiffMs`를 계산한다 → `resolveUserSwing`. 탭하지 않고 공이 지나가면 `null`이다.
3. 공이 맞으면(`INPLAY`/`FOUL`) `vibrate(quality > 0.8 ? 60 : 30)`, `playSound('hit')`, `shake(canvas, quality*8)`를 한다. 홈런은 `'homerun'` + `'cheer'`다.
4. 결과 텍스트를 1초 표시한 뒤 다음 공으로 넘어간다.

**투수 교체**: 수비 이닝 중 상단 "투수 교체" 버튼을 누르면 `availableRelievers` 목록(이름, 구속, 제구, 체력)이 나온다. 선택하면 `changePitcher`를 호출한다. 현재 투수의 투구 수와 피로 막대는 항상 보인다.

**경기 종료**: 승/패/무와 최종 점수를 보여주고 "메뉴로" 버튼을 둔다.

**feedback.js 규칙**
- `vibrate`는 `typeof navigator.vibrate === 'function'`일 때만 호출하고 예외를 삼킨다(아이폰은 조용히 아무 일 없음).
- `unlockAudio`는 첫 `pointerdown`에서 `AudioContext.resume()`을 한다(아이폰은 이걸 해야 소리가 남).
- 소리는 Web Audio로 합성한다. 노이즈 버스트 + 짧은 사인 감쇠로 '딱'을 만든다. 외부 파일은 없다.
- `shake`는 CSS transform 애니메이션 200ms다.

- [ ] **Step 1: `feedback.js` 구현**
- [ ] **Step 2: `game.js` 투구 흐름 구현** — 조준 → 구종 → 게이지 → 결과
- [ ] **Step 3: 수동 확인(투구)** — PC 모바일 에뮬레이션에서 1회초를 끝까지 던진다. 조준점이 손가락 위에 뜨는지, 초록 구간에서 누르면 공이 조준점 근처로 가는지, 바깥에서 누르면 크게 빠지는지 본다.
- [ ] **Step 4: `game.js` 타격 흐름 구현**
- [ ] **Step 5: 수동 확인(타격)** — 1회말에서 타이밍 맞춘 탭이 안타나 파울을 만들고, 아주 늦은 탭은 헛스윙인지, 그냥 두면 볼/스트라이크 판정이 나는지 확인한다.
- [ ] **Step 6: 투수 교체, 경기 종료 구현** — 3이닝 경기를 끝까지 해서 결과 화면이 나오는지 확인한다.
- [ ] **Step 7: 실기기 확인** — PC와 폰을 같은 와이파이에 연결하고 `python -m http.server 8000`을 띄운 뒤 폰에서 `http://<PC IP>:8000`을 연다. 사용자에게 다음을 확인해 달라고 요청한다. 안드로이드 진동, 아이폰 소리, 화면이 스크롤/확대되지 않음, 버튼 크기, 다른 앱 갔다 와도 공이 순간이동하지 않음.
- [ ] **Step 8: 회귀 확인** — Run: `node --test tests/` / Expected: 전부 PASS
- [ ] **Step 9: 커밋** — `feat: game screen with pitching, batting, feedback`

---

### Task 11: GitHub Pages 배포

**Files:**
- Create: `README.md` (게임 주소, 명단 고치는 법, 로컬 실행 법 — 한국어, 짧게)

- [ ] **Step 1: 저장소 생성** — GitHub MCP의 `get_me`로 계정을 확인하고, `create_repository`로 **공개** 저장소 `samsung-baseball`을 만든다. 이름은 사용자가 원하면 바꾼다.
- [ ] **Step 2: 푸시** — `git remote add origin https://github.com/<login>/samsung-baseball.git && git push -u origin main`. 인증이 실패하면 사용자에게 `! git push -u origin main`을 직접 실행해 달라고 요청한다.
- [ ] **Step 3: Pages 켜기** — 사용자에게 안내한다: 저장소 Settings → Pages → Source "Deploy from a branch" → Branch `main` / `/ (root)` → Save.
- [ ] **Step 4: 배포 확인** — 1~2분 뒤 `https://<login>.github.io/samsung-baseball/`에 접속해 메뉴 화면이 뜨는지 확인한다(`curl -sI`로 200 확인). 그다음 사용자에게 폰에서 열어 홈 화면에 추가해 보라고 안내한다.
- [ ] **Step 5: 커밋 & 푸시** — `docs: README with play link`
