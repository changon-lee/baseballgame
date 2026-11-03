// 조정용 상수 모음
export const CONFIG = {
  SPEED_SCALE: 1.6,        // 공 속도 배율(클수록 느리게 날아옴)
  MOUND_DISTANCE_M: 18.44,
  MAX_DT_MS: 50,           // 프레임 간격 상한
  EXTRA_INNINGS: 2,        // 연장 상한 = 설정 이닝 + 2
  GAUGE_PERIOD_MS: 900,    // 제구 게이지 왕복 시간(지치면 더 빨라짐)
  AIM_LIFT_PX: 60,         // 조준점을 손가락 위로 띄우는 거리
  WIND_CPU_MS: 800,        // 상대 투수 와인드업 시간
  WIND_USER_MS: 550,       // 내 투수 와인드업 시간
};
