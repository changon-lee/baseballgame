# 육성모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 삼성 실제 선수 한 명을 슬롯에 골라 훈련·휴식·경기(내 장면만 직접)로 끝없이 키우는 세 번째 모드를 만든다.

**Architecture:**
- 순수 로직은 `js/core`에 둔다.
  - `perks.js`: 컨디션·특성의 경기 중 효과
  - `raise.js`: 슬롯 상태, 훈련, 피로, 컨디션, 특성, 시즌
  - `raisematch.js`: 경기 안에서 내 장면까지 넘기기, 교체, 강판, 승·세이브 판정
- 경기 엔진은 match 객체에 `perks` 필드가 있을 때만 이 효과를 본다.
- 화면은 `js/ui/raise.js`다.
- 경기는 기존 `showGame`에 `raise` 옵션을 더해 재사용한다.

**Tech Stack:** 바닐라 ES 모듈, Canvas 2D, `node --test`, localStorage.

**Spec:** `docs/superpowers/specs/2026-11-12-raise-mode-design.md` (계획과 함께 읽는다)

## Global Constraints

- 빌드 단계와 외부 라이브러리가 없다. `import`는 상대 경로 `.js`로 한다.
- 시즌모드와 대결모드의 동작, 저장 데이터, 밸런스를 바꾸지 않는다. `perks`가 없는 경기는 같은 씨앗에서 결과가 한 글자도 달라지면 안 된다.
- 육성모드 저장 키는 `baseball.raise.v1`이다. 다른 키에는 쓰지 않는다(`bb.prefs`를 읽는 것만 기존처럼 한다).
- core는 순수 함수이고 rng를 주입받는다. core 테스트는 구현보다 먼저 쓴다.
- 화면 문구는 한국어 "~해요" 말투다. 폰 세로 화면과 터치가 기준이다. 새 그림·소리 에셋은 없다.
- 모든 밸런스 숫자는 `js/core/raise.js` 맨 위 `RAISE` 상수와 `js/core/perks.js` 맨 위 `PERK` 상수에만 둔다.
- 커밋은 `build` 브랜치에만 한다. main push와 배포는 금지다.
- 커밋 메시지 규칙:
  - "feat: ..." / "test: ..." / "fix: ..." 형식으로, 무엇이 바뀌었는지 풀어서 쓴다.
  - 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙인다.
- 테스트 명령: `export PATH="/c/Program Files/nodejs:$PATH"; node --test "tests/*.test.mjs"`
  - 각 파일은 `node --check`도 통과해야 한다.
- 파일 편집 시 기존 줄바꿈(CRLF/LF)을 그대로 둔다.

## Review Focus

1. **경기 중에 나갔다가 다시 들어왔을 때**
   - 기대: 그 경기는 없던 것이 된다.
   - 오늘 선택(`chosen`)은 남아 있다.
   - 같은 날 경기를 다시 할 수 있다(Task 4 테스트).
2. **피로가 100 근처일 때**
   - 기대: 비용이 넘치는 훈련은 거부된다.
   - 휴식과 "그냥 경기"는 언제나 된다.
   - 피로는 0~100을 벗어나지 않는다(Task 2 테스트).
3. **내 선수가 경기 중 자동 진행에 끼어드는 경우**
   - 마무리가 8회 전에 컴퓨터 불펜 교체로 나오면 안 된다.
   - 강판된 선발이 다시 나오면 안 된다.
   - 대타로 바뀐 타자가 다시 타석에 서면 안 된다(Task 3 테스트).
4. **손상된 저장**
   - JSON 오류, 슬롯 하나만 이상한 값, `v`가 다를 때를 확인한다.
   - 기대: 이상한 슬롯만 비고, 다른 슬롯과 시즌모드 저장은 그대로다(Task 2 테스트).
5. **시즌 경계**
   - 27경기째가 끝나면 시즌 종료다.
   - 다음 시즌으로 넘어가면 시즌 성적과 순위는 0이 되고, 능력치, 특성, 통산은 유지된다.
   - 선발 등판 날 계산(4경기마다)이 새 시즌 1경기째에서 다시 시작한다(Task 4 테스트).

---

### Task 1: 경기 엔진에 perks 연결 (기존 결과 불변)

**Files:**
- Create: `js/core/perks.js`
- Modify: `js/core/match.js`
  - `createMatch`(18행)
  - `matchup`(35행)
  - `decide`의 `heatBoost` 호출(82행)
- Modify: `js/ui/game.js` 329행·1189행. `heatBoost(...)`를 `boostFor(...)`로 바꾼다.
- Test: `tests/perks.test.mjs`

**Interfaces:**
- Produces (`js/core/perks.js`):
  - `PERK`: 숫자 상수 객체
    - `cond: { reach: 0.04, quality: 0.015, control: 2, velo: 1 }`
    - `trait: { reach: 1.08, quality: 0.03, control: 6 }`
    - `finisher: { control: 4, velo: 2 }`
    - `ironArm: 0.85`
  - `TRAITS`: 특성 10개
    - 형식: `{ id, kind: 'bat'|'pitch', name, desc }`
    - 타자: `clutch` 찬스에 강함 · `lhpKiller` 좌투수 킬러 · `firstPitch` 초구 공략 · `slugger` 거포 본능 · `grind` 끈질김
    - 투수: `escape` 위기관리 · `lhbKiller` 좌타자 킬러 · `finisher` 결정구 · `ironArm` 강철 어깨 · `closer` 뒷문 지킴이
  - `perkBoost(m, batterId) → { reach, quality } | null`
    - `m.perks`가 없거나 `batterId !== m.perks.id`이면 null이다.
  - `perkPitcher(m, pitcher) → pitcher`
    - 내 선수가 아니면 같은 객체를 그대로 돌려준다.
    - 내 선수면 제구·구속·체력이 조정된 새 객체를 돌려준다.
    - 체력: `ironArm`이면 `stamina / PERK.ironArm`, 상한 120이다.
  - `boostFor(m, batterId, battingSide, userSide = 'home') → { reach, quality, hot, rally, perk } | null`
    - heat와 perk를 합친다. reach는 곱하고 상한 1.25, quality는 더한다.
- Produces (`match.js`):
  - `createMatch({..., perks = null})`. `perks: { id, cond: -2..2, traits: [id] }`이다.
  - null이면 객체에 `perks` 키 자체가 없어야 한다.
  - `matchup(m).pitcher`는 `perkPitcher`를 거친 값이다. `fatigue`도 그 값의 stamina로 계산한다.
- 상황 판정은 `m.game`과 `m.log`로 한다.

| 특성 | 판정 |
|---|---|
| `clutch`, `escape` | `bases[1] \|\| bases[2]` |
| `lhpKiller` | 상대 투수 `throws === 'L'` |
| `lhbKiller` | 타자 `bats === 'L'` |
| `firstPitch` | `balls === 0 && strikes === 0` |
| `grind` | `strikes === 2`. reach만 준다 |
| `finisher` | `strikes === 2` |
| `slugger` | 그 경기 log에 내 HR이 있다. quality만 준다 |
| `closer` | `inning >= 9` |

- [ ] **Step 1: 회귀 기준값을 박는 테스트를 먼저 쓴다**

`tests/perks.test.mjs` 첫 테스트 `perks-free matches are byte-identical to before`:
- 씨앗 `[11, 222, 3333]`마다 `simulateGame({ home: getTeam('samsung'), away: getTeam('lg'), innings: 9, rng: createRng(seed) })`를 돌린다.
- `JSON.stringify({score, n: log.length, last: log.at(-1)})`를 지금 코드로 미리 돌려 얻은 문자열과 `assert.equal`로 비교한다.
- 기대 문자열은 이 단계에서 현재 코드로 출력해 붙여 넣는다.
- 같은 방식으로 `createMatch(...)`(perks 없음)에 `'perks' in m === false`를 확인한다.

- [ ] **Step 2: 효과 테스트를 쓴다**

```js
// 내 선수가 아니면 효과 없음, 컨디션 +2면 reach 1.08·quality 0.03, 상황 밖 특성은 0
test('perkBoost only for my batter, condition scales, traits only in their situation', ...)
//   m = createMatch({... perks: { id: B, cond: 2, traits: ['clutch'] } })
//   perkBoost(m, OTHER) === null
//   bases 비었을 때 perkBoost(m, B) ≈ { reach: 1.08, quality: 0.03 }
//   bases [false,true,false]이면 reach ≈ 1.08*1.08, quality ≈ 0.06
test('perkPitcher adjusts only my pitcher; matchup sees it', ...)
//   cond -2 → control -4, velo -2; escape+주자 2루 → control +6 추가
//   finisher + 2스트라이크 → control +4, velo +2 추가
//   matchup(m).pitcher.control이 같은 값
test('boostFor caps reach at 1.25 and equals heatBoost when perks absent', ...)
```

- [ ] **Step 3: 실패를 확인한다**

`node --test tests/perks.test.mjs`. 2단계 테스트가 "perks.js를 찾을 수 없음"으로 FAIL해야 한다. 1단계는 PASS다.

- [ ] **Step 4: `perks.js`를 구현하고 `match.js`·`game.js`에 연결한다**

- `decide`에서는 `boostFor(m, batter.id, battingSide(m.game))`를 쓴다.
- `game.js` 두 곳은 `heatOn && ... ? boostFor(match, id, mySide, mySide) : null`로 바꾼다.
  - 표시 문구: `bo.perk`만 있으면(heat 없음) 주황 배트 글자를 띄우지 않는다.
- `boostFor`는 heat와 perk가 둘 다 null이면 반드시 null을 돌려준다. 기존 결과가 바뀌지 않게 하기 위해서다.

- [ ] **Step 5: 테스트를 통과시킨다**

`node --test "tests/*.test.mjs"`. 전체가 PASS해야 한다. 특히 balance, heat, match, versus를 본다.

- [ ] **Step 6: Commit**

`feat: condition and trait effects hook (perks) - matches carry an optional perks field...`

---

### Task 2: 육성 슬롯 상태 · 훈련 · 휴식 · 저장

**Files:**
- Create: `js/core/raise.js`
- Test: `tests/raise.test.mjs`

**Interfaces:**
- Consumes:
  - `getTeam`, `USER_TEAM_ID` (`rosters.js`)
  - `createGrowth`, `gainXp`, `applyGrowth` (`growth.js`)
  - `defaultLineup` (`team.js`)
  - `createSeason` (`season.js`)
  - `TRAITS` (Task 1)
- Produces:
  - `RAISE` 상수 (스펙 5.3~5.5 출발값)
    - 피로 관련: `{ trainCost: 20, drillCost: 30, rest: -45, idle: -10, batGame: 5, perPitch: 0.4, tiredAt: 70, drillNeed: 4, seasonCycles: 3, startEvery: 4, slots: 3 }`
    - 경험치 관련: `xpBase: 6`, `xpMin: 1.8`
  - `DRILLS`: 일반 훈련과 특훈 목록
    - 형식: `{ id, kind: 'bat'|'pitch', name, stat, drill: bool, trait?: traitId, cost }`
    - 타자: `power`·`contact`·`eye` + 특훈 `drillRisp→clutch`(stat contact) · `drillLhp→lhpKiller`(contact) · `drillFirst→firstPitch`(power)
    - 투수: `velo`·`control`·`stamina` + 특훈 `drillEscape→escape`(control) · `drillLhb→lhbKiller`(control) · `drillFinish→finisher`(velo)
  - `newSlot(playerId, year = 2027) → slot`
    - kind와 role을 로스터에서 정한다. role은 타자면 null, SP면 'SP', RP면 'CL'이다.
    - `condition: 0, fatigue: 0, traits: [], progress: { train: {}, feat: {} }, chosen: false`
    - `season: createSeason({cycles: 3, innings: 9, year})`
    - `stats: {}, total: {}, history: [], growth: createGrowth()`
  - `loadRaise(storage) → { v: 1, slots: [slot|null ×3], broken: [slotIndex] }`
  - `saveRaise(storage, r) → bool`
  - `slotPlayer(slot) → player` (육성 능력치가 반영된 내 선수)
  - `raiseTeam(slot, { benchMe = false } = {}) → team`
    - `applyGrowth(getTeam('samsung'), slot.growth)`
    - `benchMe`면 내 투수를 pitchers에서 뺀다(선발 없는 날용).
  - `raiseLineup(slot, team) → { order, starterId }`
    - 타자: 기본 9명 안에 있으면 그 자리, 아니면 `pos === 'DH'`인 자리를 대신한다.
    - starterId는 Task 4의 `starterFor`가 정하므로 여기선 기본값을 둔다.
  - `xpPerTraining(statName, value) → number`
    - 구속은 `50 + (velo - 145) * 3`으로 바꿔서 계산한다.
    - `max(xpMin, xpBase - (v - 60) * 0.12)`
  - `canChoose(slot, choiceId) → { ok, reason? }`
    - choiceId는 DRILLS id 또는 `'rest'`다.
    - reason: `'tired'`(피로 + 비용 > 100), `'done'`(오늘 이미 선택함), `'kind'`(타자/투수 불일치)
  - `choose(slot, choiceId) → { slot, ups: [{stat, n}], trait: traitId|null }`
    - 특훈: stat에 `xpPerTraining * 0.4`, progress.train[id]++, 4회째에 특성을 붙인다.
    - rest: 피로 −45, 컨디션을 0 쪽으로 한 칸 옮긴다.
    - 둘 다 `chosen = true`로 만든다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** (`tests/raise.test.mjs`)

```js
test('newSlot: real Samsung player, role from roster', ...)
//   newSlot('samsung-b03').kind==='bat' && role===null
//   newSlot('samsung-p01').role==='SP'; newSlot('samsung-p05').role==='CL'
test('training raises the stat with diminishing returns and caps', ...)
//   파워 72 타자: 3번 훈련하면 delta.power >= 1
//   xpPerTraining('power', 92) < xpPerTraining('power', 72)
//   99는 99를 넘지 않는다
test('fatigue blocks training but never rest; stays within 0..100', ...)
//   fatigue 85 → canChoose(s,'power').reason==='tired', canChoose(s,'rest').ok
//   fatigue 10 + rest → 0
test('one choice per day', ...)        // choose 후 canChoose(...).reason==='done'
test('drill 4 times grants its trait once', ...)
//   chosen을 매번 false로 돌려가며 drillRisp 4번 → traits에 'clutch' 1개, 5번째 해도 1개
test('save/load round trip; a broken slot does not spoil others or the career key', ...)
//   가짜 storage(Map). slots[1]을 '{"playerId":1}'처럼 깨뜨린 JSON으로 넣는다
//   → loadRaise: slots[1]===null, broken=[1], slots[0] 그대로
//   'baseball.career.v1' 값은 바뀌지 않는다. 전체 JSON 오류면 slots 3칸 모두 null
test('raiseLineup puts bench batter in the DH spot', ...)   // 이성규(samsung-b10)가 최형우 자리에
```

- [ ] **Step 2: FAIL을 확인한다** (`node --test tests/raise.test.mjs` → 모듈 없음)
- [ ] **Step 3: 위 Interfaces대로 `raise.js`를 구현한다**

`loadRaise`는 슬롯마다 다음을 검사하고, 실패하면 그 칸을 null로 하고 broken에 넣는다.
- `typeof playerId === 'string'`
- 로스터에 있는 선수다.
- `season.schedule`이 배열이다.

- [ ] **Step 4: PASS를 확인한다** (`node --test "tests/*.test.mjs"`)
- [ ] **Step 5: Commit** (`feat: raise mode state - slots, training, drills, rest, fatigue, save key baseball.raise.v1 ...`)

---

### Task 3: 경기 안의 육성 진행 (내 장면까지 넘기기 · 교체 · 강판 · 승/세이브)

**Files:**
- Create: `js/core/raisematch.js`
- Test: `tests/raisematch.test.mjs`

**Interfaces:**
- Consumes:
  - `simulateUntil`, `matchup`, `createMatch` (`match.js`)
  - `fatigue` (`pitch.js`)
  - `battingSide` (`rules.js`)
- Produces:
  - `raiseStep(m, raise, rng) → { match, phase: 'me'|'done', note: string|null, skipped: bool }`
    - `raise = { kind, role, playerId, cond }`이다.
    - 내 장면이 될 때까지 시뮬레이션한다.
    - 내 장면이면 그대로 `'me'`를 돌려준다.
    - 더 이상 내 장면이 없으면 남은 경기를 끝까지 돌리고 `'done'`과 note를 돌려준다.
    - note: `'pinch'`(대타 교체), `'pulled'`(강판), `'noshow'`(등판 없음), `'end'`
  - 타자 규칙
    - 내 장면 = 말 공격이고 지금 타자가 `playerId`다.
    - 대타 판정은 내 타석 차례가 왔을 때만 한다. 조건: `inning >= 7`, `cond <= -1`, 그 경기 내 무안타, 삼진 2개 이상.
    - 대타면 lineups.home.order에서 내 id를 아직 타순에 없는 벤치 타자로 바꾼다.
  - 선발 규칙
    - 내 장면 = 초 공격이고 home 투수가 나다.
    - 강판 조건(초 공격의 타석 사이마다 확인):
      - `fatigue(pitchCount.home, matchup(m).pitcher.stamina) >= 0.6`
      - 또는 이번 이닝 초에 내가 준 점수 ≥ 5이고 그 반 이닝이 끝났을 때
    - 강판 처리: home 투수를 RP 중 하나로 바꾸고 `used`에 나를 넣는다. 사용자가 불펜 메뉴로 스스로 바꾼 경우도 같은 '강판'으로 친다.
  - 마무리 규칙
    - 경기 시작 때 `used.home`에 내 id를 넣어 컴퓨터 교체에서 빠지게 한다.
    - 9회초 첫 타석 전 `|score.home - score.away| <= 3`이면 나를 등판시킨다. 직접 대입하고, pitchCount.home은 0으로 둔다.
    - 아니면 `'noshow'`다.
    - 9회초와 (연장이면) 10회초까지가 내 장면이다. 그 뒤는 `'done'`이다.
  - `decisions(log, playerId, role, result) → { w, l, sv }`
    - 선발 승: 내 아웃 ≥ 15, 팀 승리, 내 마지막 타석 뒤 리드였고 이후 동점·역전이 없다.
    - 선발 패: 내 마지막 타석 뒤 뒤졌고 이후 동점·역전 없이 졌다.
    - 세이브: 등판할 때 리드 1~3점이고, 경기 끝까지 리드를 지켜 이겼다.
  - `gameLine(log, playerId) → { bat: {...}|null, pit: {...}|null }`
    - `growth.js`의 `playerLine({}, log.filter(내 것))`에서 내 줄만 꺼낸다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('batter: raiseStep stops only at my at-bats and never at the top half', ...)
//   씨앗 20개: phase==='me'면 battingSide==='home' && matchup.batter.id===B
//   경기가 끝나면 'done'
test('pinch hitter after 7th when cold and hitless with 2 K; I never bat again', ...)
//   log에 내 삼진 2개를 가짜로 넣은 m, inning 7 → note 'pinch'
//   남은 log에 내 batterId가 없다
test('starter is pulled at fatigue 0.6 and never returns', ...)
test('closer is not used before the 9th and enters only within 3 runs', ...)
//   씨앗 20개: 8회까지 log에 내 pitcherId 없음
//   9회초 점수 차 4 이상이면 'noshow'
test('decisions: win, loss, save', ...)   // 손으로 만든 log 3개
```

- [ ] **Step 2: FAIL을 확인한다**
- [ ] **Step 3: 구현한다** (`simulateUntil`의 until 조건으로 내 장면을 판정한다. rng는 받은 것만 쓴다)
- [ ] **Step 4: PASS를 확인한다** (전체 테스트)
- [ ] **Step 5: Commit** (`feat: raise mode match flow - auto-advance to my at-bats/innings, pinch hitter, pulled starter, closer entry, W/L/SV`)

---

### Task 4: 하루 · 경기 반영 · 컨디션 · 경기 특성 · 시즌

**Files:**
- Modify: `js/core/raise.js`
- Test: `tests/raise.test.mjs` (추가)

**Interfaces:**
- Consumes:
  - `recordRound`, `standings`, `nextStarter`, `createSeason` (`season.js`)
  - `gainFromLog`, `playerLine` (`growth.js`)
  - `decisions`, `gameLine` (Task 3)
- Produces:
  - `dayInfo(slot) → { round, total: 27, opponentId, label, myStart: bool, needsScreen: bool }`
    - 선발: `myStart = round % 4 === 0`
    - `needsScreen`: 타자·마무리는 항상 true, 선발은 myStart일 때만 true
  - `starterFor(slot) → pitcherId`
    - myStart면 내 id다.
    - 아니면 `nextStarter`(benchMe 팀 기준)다.
  - `matchSetup(slot) → { userTeam, cpuTeam, lineup, cpuStarterId, perks, raise }`
    - UI가 `showGame`에 바로 넘긴다.
    - `perks = { id, cond, traits }`, `raise = { kind, role, playerId, cond }`
  - `applyDay(slot, result|null, rng) → { slot, report }`
    - result는 `showGame`의 `{home, away, log, starterId}` 또는 null(선발 쉬는 날 자동 경기)이다.
    - 처리 순서:
      1. `recordRound`
      2. 내 log만 골라 `gainFromLog`
      3. stats와 total 누적, decisions(w/l/sv)를 stats에 더한다.
      4. 경기 특성 카운터 `progress.feat`
         - 타자: `rispHits`, `lhpHits`, `hr`, `bb`
         - 투수: `rispEscapes`, `lhbSo`, `so`, `longStarts`(stamina ≥ 90이고 아웃 18개 이상인 선발), `saves`
         - 기준: 8 / 10 / 10 / 12, 10 / 15 / 30 / 5 / 8 (스펙 5.6 표)
      5. 컨디션 변화
         - 타자 점수 ≥ 2이면 ↑, ≤ −1이면 ↓
         - 선발 점수 ≥ 4이면 ↑, ≤ 0이면 ↓
         - 마무리: 아웃 3개 이상이고 실점 0이면 ↑, 실점 2 이상이면 ↓
         - 등판이 없으면 변화 없음
         - 출전 시작 때 피로 ≥ 70이었으면 한 칸 더 ↓
      6. 피로 변화
         - chosen이 아니었으면 −10
         - 타자 출전 +5, 투수는 던진 공 수 × 0.4
      7. `chosen = false`로 되돌린다.
    - `report = { line, ups, condFrom, condTo, traitsNew, team: {w,l,d,rank}, seasonOver }`
  - `seasonOver(slot) → bool`: `season.phase !== 'regular'`
  - `nextSeason(slot) → slot`
    - `history`에 `{ year, line: stats, rank, w, l, d, traitsNew }`를 넣는다.
    - `season = createSeason(year + 1)`
    - `stats = {}`, `fatigue = 0`, `condition = 0`, `chosen = false`
    - growth, traits, total, progress는 유지한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('starter pitches every 4th game; dayInfo restarts each season', ...)
//   SP 슬롯: round 0,4,8,...만 myStart
//   nextSeason 뒤 round 0이 myStart
test('applyDay records the game, my line, standings; null result simulates', ...)
//   타자 슬롯에서 applyDay(slot, null, rng) 27번 → seasonOver
//   standings 합계 27경기, stats.bat[id].pa > 0
test('condition moves with performance and fatigue, clamped -2..2', ...)
//   손으로 만든 log: 홈런 1 + 안타 1 → ↑
//   삼진 3 → ↓
//   피로 75로 시작 + 평범 → ↓
test('game feats grant traits once (10 HR → slugger)', ...)
test('leaving mid-game keeps the choice and the day', ...)
//   choose 후 applyDay를 부르지 않으면 chosen===true, season.round 그대로
test('nextSeason keeps growth/traits/total and resets the rest', ...)
test('balance: power training for 3 seasons hits clearly more HR than no training, and no stat rises more than 15 in one season', ...)
//   두 슬롯을 같은 씨앗으로 돌린다
//   훈련 슬롯: 피로가 허락하면 power, 아니면 rest. 다른 슬롯: 아무것도 고르지 않는다
//   applyDay(null)로 3시즌을 돌리고 3시즌째 HR을 비교한다(훈련 > 무훈련 × 1.3)
//   매 시즌 delta 증가 ≤ 15
```

- [ ] **Step 2: FAIL을 확인한다**
- [ ] **Step 3: 구현한다**
  - null 결과일 때도 내 타자 경기(자동)가 log를 남기도록 `recordRound`의 games에서 삼성 경기 log를 꺼내 쓴다.
  - `recordRound`의 opts 형식: `{ getT: id => id === 'samsung' ? raiseTeam(slot, …) : getTeam(id), userLineup, userStarterId }`
- [ ] **Step 4: PASS를 확인한다** (전체)
  - balance 테스트가 목표에 안 맞으면 `RAISE`의 xp 숫자만 조정한다. 최종 값은 커밋 메시지에 적는다.
- [ ] **Step 5: Commit** (`feat: raise mode days and seasons - ...`)

---

### Task 5: 경기 화면 `raise` 옵션

**Files:**
- Modify: `js/ui/game.js`
  - `showGame` 시그니처(76행)
  - `createMatch` 호출(96행)
  - `nextPlay`(178행~)
  - 메뉴(767행 근처)
  - `showEnd`(720행)
  - 스코어보드 `.mu`(162행)

**Interfaces:**
- Consumes: `raiseStep` (Task 3), `matchSetup` 결과 (Task 4)
- Produces: `showGame(root, {..., perks = null, raise = null}, onExit)`
  - `raise`가 없으면 지금과 같다.
  - 끝까지 하면 `onExit({home, away, log, starterId, raise: {note}})`
  - 중간에 나가면 `onExit(null)`

- [ ] **Step 1: 연결한다**
  - `createMatch({..., perks})`로 넘긴다.
  - 마무리면 첫 `raiseStep` 전에 `used.home`에 내 id를 넣는다. 이건 raiseStep이 처리한다.
  - `nextPlay` 맨 앞에서 `raise && !match.game.over`이면 `raiseStep`을 부른다.
    - `skipped`이면 진행된 상황을 기존 메시지 띠로 1.2초 보여 준다.
      - 예: `showMsg('4회말까지 진행', '#9fb3cc', 1200, '2-1 · 1사 1루', ...)`
      - 그다음 `nextPlay`를 이어 간다.
    - `'done'`이면 note별 문구를 1.5초 띄운 뒤 `showEnd`로 간다.
      - `pinch`: "대타로 교체됐어요"
      - `pulled`: "강판됐어요"
      - `noshow`: "오늘은 등판이 없었어요"
  - raise일 때 메뉴에서 '자동 진행 켜기'와 '이번 공격/이닝 넘기기'를 숨기고 '남은 경기 자동'만 남긴다.
  - 불펜 칩은 그대로 둔다. 불펜에서 다른 투수를 고르면 다음 `raiseStep`이 '강판'으로 처리한다.
  - 스코어보드 내 선수 이름 옆에 컨디션 아이콘을 표시한다: `['⬇⬇','⬇','➖','⬆','⬆⬆'][cond+2]`
- [ ] **Step 2: 검사한다**
  - `node --check js/ui/game.js`
  - 전체 테스트를 PASS시킨다.
- [ ] **Step 3: Commit** (`feat: game screen raise option - ...`)

---

### Task 6: 육성 화면과 진입

**Files:**
- Create: `js/ui/raise.js`
- Modify:
  - `js/ui/hub.js` 134행: 버튼 `<button class="ghost" data-act="raise">🌱 육성모드</button>`, 297행 근처에 `act('raise', ...)`
  - `js/main.js`: `raise` 콜백, `#raise` 해시
  - `css/*.css`(기존 허브 클래스 재사용, 필요한 것만 추가)

**Interfaces:**
- Consumes:
  - Task 2: `loadRaise`/`saveRaise`/`newSlot`/`DRILLS`/`canChoose`/`choose`
  - Task 4: `dayInfo`/`matchSetup`/`applyDay`/`seasonOver`/`nextSeason`
  - Task 1: `TRAITS`
  - `standings`
  - `growth.js`의 `avg`/`era`/`ip`
- Produces: `showRaise(root, { storage, loadGame, onBack })`

- [ ] **Step 1: 화면을 만든다** (기존 `hub.js` 마크업과 클래스를 따른다)
  - **슬롯 목록:** 3칸. 각 칸에 이름, 포지션 또는 보직, "2027 · 5/27경기", 시즌 한 줄 기록이 있다. 빈 칸은 "새로 키우기"이고, 지우기는 `confirm`을 한 번 거친다.
  - **선수 고르기:** 타자 탭과 투수 탭이 있다. 원래 능력치를 보여 준다.
  - **육성 허브:**
    - 선수 카드: 능력치, 컨디션 아이콘과 글자, 피로 막대 0~100, 특성 배지
    - 다음 경기: 상대, 회차, 선발 날 여부
    - 오늘의 선택: DRILLS와 휴식 버튼. 비용을 표시하고, 막힌 것은 흐리게 하며 "너무 지쳤어요"로 알린다.
    - 선택 결과 한 줄
    - "경기 시작" 버튼. `needsScreen`이 false면 "경기 진행(등판 없음)"으로 바로 `applyDay(null)`를 한다.
    - "기록" 버튼
  - **경기 결과:** 내 기록 한 줄, 팀 승패, 컨디션 변화, 오른 능력치, 새 특성(크게 표시)
  - **시즌 종료:** 시즌 성적, 순위표(`standings`), 다음 시즌 버튼
  - **기록:** 시즌별 한 줄, 통산, 특성 목록과 설명
  - 저장에 실패하면 "저장 안 됨"을 표시한다. broken 슬롯이 있으면 한 번 알린다.
- [ ] **Step 2: 검사한다** (`node --check`, 전체 테스트 PASS)
- [ ] **Step 3: Commit** (`feat: raise mode screens and entry - ...`)

---

### Task 7: 브라우저로 확인하고 보고하기

- [ ] **Step 1: 서버를 켠다** (`python serve.py 8000`이 이미 떠 있으면 그대로 쓴다)
- [ ] **Step 2: headless Chrome으로 확인한다** (스크래치패드의 `fc_e2e.mjs` 방식, 포트 9340)
  - `#raise`에서 슬롯 3개를 만든다: 구자욱(타자), 원태인(선발), 김재윤(마무리).
  - 각 슬롯에서 확인할 것:
    - 훈련 1번 → 경기
    - 경기 중 조작 화면(aim/bwait)이 내 장면에서만 나오는지. `window.__game().mode`와 matchup으로 확인한다.
    - `__ui`의 넘기기로 경기를 끝까지 진행한다.
    - 결과 화면이 나오는지
    - 새로고침 뒤 저장이 남아 있는지
  - 원태인 슬롯은 다음 3일이 "등판 없음" 진행으로 넘어가는지 본다.
  - 스크린샷: 허브, 내 타석, 결과, 시즌모드 홈, 대결 진입 화면
  - 콘솔 예외가 0개인지 본다.
- [ ] **Step 3: 시즌모드가 그대로인지 확인한다**
  - 홈 화면을 확인한다.
  - `baseball.career.v1`이 육성모드를 쓰기 전후로 같은지 확인한다.
- [ ] **Step 4: 전체 테스트를 한 번 더 PASS시키고, `build`에 push한다** (main 금지)
- [ ] **Step 5: 사용자에게 보고한다**
  - 직접 확인한 것과 확인하지 못한 것(실제 폰 터치감, 장시간 밸런스 등)을 나눠서 적는다.
  - 조정한 숫자를 적는다.
  - "배포"를 기다린다.
