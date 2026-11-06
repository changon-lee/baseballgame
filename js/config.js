// 조정용 상수 모음
export const CONFIG = {
  SPEED_SCALE: 1.6,        // 공 속도 배율(클수록 느리게 날아옴)
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
    AIM_PENALTY: 0.45,             // 배트 가운데에서 벗어난 만큼(0 가운데 ~ 1 끝) 타구질이 떨어진다(제곱)
    HR_Q: 0.78, HR_BASE: 0.10, HR_POWER: 0.55,
    HIT_BASE: 0.05, HIT_Q: 0.40,
    CPU_ZONE: 0.5, SWING_ZONE: 0.68, CHASE: 0.15, SIGMA_BASE: 100,
  },
};
