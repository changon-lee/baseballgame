// 조정용 상수 모음
export const CONFIG = {
  SPEED_SCALE: 1.6,        // 공 속도 배율(클수록 느리게 날아옴). 내가 칠 때: 실제(150km/h ≈ 0.44초)대로면 폰에서 반응하기 어려워 늦춘다
  PITCH_VIEW_SPEED: 1.0,   // 내가 던질 때 보이는 공 속도 배율: 칠 일이 없으니 실제 속도로 미트에 꽂힌다(판정과는 상관없다)
  MOUND_DISTANCE_M: 18.44,
  MAX_DT_MS: 50,           // 프레임 간격 상한
  EXTRA_INNINGS: 2,        // 연장 상한 = 설정 이닝 + 2
  GAUGE_PERIOD_MS: 900,    // 제구 게이지 왕복 시간(지치면 더 빨라짐)
  AIM_LIFT_PX: 60,         // 조준점을 손가락 위로 띄우는 거리
  WIND_CPU_MS: 1050,        // 상대 투수 와인드업 시간
  WIND_USER_MS: 700,       // 내 투수 와인드업 시간
  // 밸런스 (tests/balance.test.mjs가 야구다운 범위인지 확인)
  BALANCE: {
    EDGE_PENALTY: 0.35, BREAK_PENALTY: 0.08, WEAK_CONTACT: 0.25,
    ERROR_RATE: 0.03,              // 아웃이 될 타구 중 실책으로 사는 비율
    AIM_PENALTY: 0.45,             // 배트 가운데에서 벗어난 만큼(0 가운데 ~ 1 끝) 타구질이 떨어진다(제곱)
    HR_Q: 0.78, HR_BASE: 0.10, HR_POWER: 0.55,
    HIT_BASE: 0.05, HIT_Q: 0.40,
    CPU_ZONE: 0.5, SWING_ZONE: 0.74, CHASE: 0.15, SIGMA_BASE: 94,
    CORNER_TAKE: 0.35,             // 존 끝에 걸치는 공은 이만큼(최대) 덜 휘두른다 → 루킹 스트라이크
    CHASE_BREAK: 1.2,              // 존 밖 변화구는 휘는 만큼 더 쫓는다(유인구). 존에 가까울수록 더
    SPEED_MIX: 1.5,                // 바로 전 공과 구속 차이 1km/h마다 타이밍이 이만큼(ms) 더 흔들린다(완급 조절)
    SAME_PITCH: 12,                // 같은 구종·비슷한 구속이 이어지면 눈에 익어 타이밍이 이만큼(ms) 덜 흔들린다
  },
};
