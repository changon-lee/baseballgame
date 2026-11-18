# 관중 함성·웅성거림·포수 미트 소리를 받은 녹음에서 잘라 assets/audio/*.mp3 로 낸다.
# 실행: python tools/make_audio_crowd.py   (imageio-ffmpeg 의 ffmpeg 를 쓴다)
#  - assets/raw/Baseball Sound Effects All Sounds.mp3
#      0:51~1:15  관중 함성 → crowd_yell1~3(짧게 세 가지), crowd_yell_big(길게: 홈런·승리)
#      6:47~10:35 관중 웅성거림 → crowd_loop(60초 반복). 중간에 함성이 튀는 곳(8:07~8:17, 9:03~9:23)은 피해서 9:27~부터 쓴다
#  - assets/raw/Short Shots Glove Pop.mp3 → mitt_1~11 (포수 미트 '퍽' 11가지. 앞 1.6초의 잡음은 뺀다)
# tools/make_audio.py 도 crowd_loop 를 만들지만, 지금 쓰는 건 이 스크립트가 만든 것이다
import subprocess, os
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
RAW, OUT = 'assets/raw', 'assets/audio'
ALL = f'{RAW}/Baseball Sound Effects All Sounds.mp3'
POP = f'{RAW}/Short Shots Glove Pop.mp3'


def load(path, ch=1, ss=None, t=None):
    cmd = [FF, '-v', 'error'] + (['-ss', str(ss)] if ss is not None else []) + (['-t', str(t)] if t is not None else [])
    out = subprocess.run(cmd + ['-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(out, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, ch) if ch > 1 else x


def save(name, x, kbps=96, peak=0.89, rms=None):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1: x = x[:, None]
    if rms: x = x / (np.sqrt((x ** 2).mean()) + 1e-9) * rms
    else: x = x / (np.abs(x).max() + 1e-9) * peak
    x = np.clip(x, -0.98, 0.98)
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ac', str(x.shape[1]), '-ar', str(SR), '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', f'{OUT}/{name}.mp3'], input=x.astype(np.float32).tobytes(), check=True)
    print(f'{name}.mp3  {len(x) / SR:.2f}s  {os.path.getsize(f"{OUT}/{name}.mp3") // 1024}KB')


def fade(x, a=0.01, b=0.5):
    x = x.copy(); n = len(x); ia, ib = int(a * SR), int(b * SR)
    sh = (lambda v: v[:, None]) if x.ndim > 1 else (lambda v: v)
    if ia: x[:ia] *= sh(np.linspace(0, 1, ia))
    if ib: x[n - ib:] *= sh(np.linspace(1, 0, ib) ** 1.5)
    return x


# ── 관중 함성 ── (녹음 51초부터. 61~64초, 69~70초에 크게 부푼다)
yell = load(ALL, 2, 51.0, 24.5)
cut = lambda a, b: yell[int((a - 51.0) * SR):int((b - 51.0) * SR)]
save('crowd_yell1', fade(cut(59.6, 65.2), 0.25, 1.8))   # 부풀어 오르는 함성
save('crowd_yell2', fade(cut(68.2, 72.6), 0.2, 1.6))    # 두 번째 물결
save('crowd_yell3', fade(cut(51.0, 55.6), 0.03, 1.6))   # 갑자기 터지는 시작
save('crowd_yell_big', fade(cut(51.0, 66.0), 0.03, 3.0), kbps=96)   # 터지는 시작 + 부푸는 함성(홈런·승리)

# ── 관중 웅성거림(반복) ──
L, X = 60.0, 3.0                                        # 60초 반복, 끝 3초를 처음과 섞어 이음매를 없앤다
amb = load(ALL, 2, 567.0, L + X)
n, nx = int(L * SR), int(X * SR)
loop = amb[:n].copy()
w = np.linspace(0, 1, nx)[:, None]
loop[:nx] = loop[:nx] * w + amb[n:n + nx] * (1 - w)
old = load(f'{OUT}/crowd_loop.mp3', 2) if os.path.exists(f'{OUT}/crowd_loop.mp3') else None
target = float(np.sqrt((old ** 2).mean())) if old is not None else 0.12   # 예전 반복 소리와 같은 크기로
save('crowd_loop', loop, kbps=64, rms=target)

# ── 포수 미트 '퍽' 11가지 ──
pop = load(POP, 1)
for i, t in enumerate([2.08, 2.9, 3.96, 5.0, 6.16, 7.32, 8.02, 9.36, 10.26, 11.08, 12.46], 1):
    s = pop[int((t - 0.06) * SR):int((t + 0.62) * SR)]
    a = np.abs(s); p = a.max(); i0 = int(np.argmax(a > p * 0.2))
    s = s[max(0, i0 - int(0.003 * SR)):]
    tail = np.where(np.abs(s) > p * 0.03)[0]
    s = s[:min(len(s), tail[-1] + int(0.04 * SR))]
    save(f'mitt_{i}', fade(s, 0.001, 0.06), kbps=96)
