# 효과음·관중·응원 소리 만들기: assets/raw 의 녹음을 다듬고, 없는 소리는 녹음을 변형하거나 합성해서 assets/audio/*.mp3 로 낸다.
# 실행: python tools/make_audio.py   (imageio-ffmpeg 의 ffmpeg 를 쓴다)
import subprocess, os
import numpy as np
import imageio_ffmpeg
from scipy.signal import butter, sosfilt, fftconvolve

FF = imageio_ffmpeg.get_ffmpeg_exe()
SR = 44100
RAW, OUT = 'assets/raw', 'assets/audio'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def load(name, ch=1):
    out = subprocess.run([FF, '-v', 'error', '-i', f'{RAW}/{name}', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(out, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, ch) if ch > 1 else x


def save(name, x, kbps=96, peak=0.89):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1: x = x[:, None]
    x = x / (np.abs(x).max() + 1e-9) * peak
    ch = x.shape[1]
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', f'{OUT}/{name}.mp3'], input=x.astype(np.float32).tobytes(), check=True)
    print(f'{name}.mp3  {len(x) / SR:.2f}s  {os.path.getsize(f"{OUT}/{name}.mp3") // 1024}KB')


def filt(x, kind, f, order=4):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=0)


def fade(x, a=0.003, b=0.05):
    x = x.copy(); n = len(x)
    ia, ib = int(a * SR), int(b * SR)
    if ia: x[:ia] *= np.linspace(0, 1, ia)[:, None] if x.ndim > 1 else np.linspace(0, 1, ia)
    if ib: x[n - ib:] *= np.linspace(1, 0, ib)[:, None] if x.ndim > 1 else np.linspace(1, 0, ib)
    return x


def seg(x, t0, t1): return x[int(t0 * SR):int(t1 * SR)]


def resample(x, rate):            # rate > 1 = 빠르게(높게), < 1 = 느리게(낮게)
    n = int(len(x) / rate)
    return np.interp(np.arange(n) * rate, np.arange(len(x)), x)


def varispeed(x, r0, r1):          # 재생 속도를 r0 → r1 로 서서히(음높이가 미끄러진다)
    pos, p, out = 0.0, [], []
    n = len(x)
    while pos < n - 1:
        p.append(pos); k = pos / n; pos += r0 + (r1 - r0) * k
    return np.interp(np.array(p), np.arange(n), x)


def room(x, dur=0.25, mix=0.18, lp=3500):   # 작은 방 울림(짧은 잔향)
    n = int(dur * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n)); ir = filt(ir, 'low', lp)
    wet = fftconvolve(x, ir) if x.ndim == 1 else np.stack([fftconvolve(x[:, c], ir) for c in range(x.shape[1])], axis=1)
    wet = wet[:len(x) + n]
    dry = np.concatenate([x, np.zeros((n,) + x.shape[1:])])
    wet = np.concatenate([wet, np.zeros((len(dry) - len(wet),) + x.shape[1:])])
    return dry + wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max() * mix


def env(n, a, d, shape=2.0):        # 붙는 시간 a, 사라지는 시간 d(초)
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d * shape)


def noise(n): return rng.standard_normal(n)


# ── 받은 녹음 다듬기 ──
bat = load('bat_crack.mp3')
crack = seg(bat, 0.08, 0.47)                                # 뒤에 섞인 함성은 버리고 '딱'만
c0 = int(np.argmax(np.abs(crack) > np.abs(crack).max() * 0.2))   # 맞는 순간이 파일 맨 앞에 오게
crack = fade(crack[max(0, c0 - int(0.002 * SR)):], 0.001, 0.12)
save('bat_crack', crack)
# 홈런: 받은 녹음 전체('딱' + 뒤따르는 함성)를 그대로, 맞는 순간부터
full = bat[int(0.08 * SR):]
f0 = int(np.argmax(np.abs(full) > np.abs(full).max() * 0.2))
save('bat_hr', fade(full[max(0, f0 - int(0.002 * SR)):], 0.001, 0.6))

glove = load('glove_catch.wav')
g0 = int(np.argmax(np.abs(glove) > np.abs(glove).max() * 0.05))
glove = fade(glove[max(0, g0 - int(0.004 * SR)):g0 + int(0.25 * SR)], 0.001, 0.08)
save('glove_catch', glove)
# 포수 미트 '퍽': 글러브 소리 + 한 옥타브쯤 낮춘 소리(가죽 울림) + 낮은 쿵 + 짧은 울림
low = filt(resample(glove, 0.62), 'low', 900)
n = max(len(glove), len(low)); mitt = np.zeros(n)
mitt[:len(glove)] += glove; mitt[:len(low)] += low * 1.1
m = int(0.1 * SR); thump = np.sin(2 * np.pi * 95 * np.arange(m) / SR) * env(m, 0.0015, 0.035)
mitt[:m] += thump * np.abs(glove).max() * 0.9
mitt = fade(room(mitt, 0.18, 0.12), 0.001, 0.06)
save('mitt_pop', mitt)

cheerR = load('crowd_cheer.wav')
loopR = load('crowd_loop.wav')
# 함성: 시작이 살아 있는 6초, 끝은 천천히
c = seg(cheerR, 0.95, 7.5); c = fade(c, 0.05, 2.2); save('crowd_cheer', c)
big = seg(cheerR, 0.95, 12.0); big = fade(big, 0.05, 4.0); save('crowd_cheer_big', big)


def grains(src, dur, glen=2.4, density=3.0, minrms=0.25):
    # 녹음 여기저기서 조금씩 잘라 겹쳐 쌓는다(끊김 없는 관중 소리). 조용한 구간은 뺀다
    w = int(glen * SR); N = int(dur * SR)
    win = np.hanning(w)
    rms = np.array([np.sqrt((src[i:i + w] ** 2).mean()) for i in range(0, len(src) - w, SR // 4)])
    ok = np.where(rms > rms.max() * minrms)[0] * (SR // 4)
    out = np.zeros(N + w)
    step = int(w / density)
    for s in range(-w, N, step):
        s += int(rng.integers(-step // 3, step // 3 + 1))
        o = int(rng.choice(ok)); g = src[o:o + w] * win
        g = g / (np.sqrt((g ** 2).mean()) + 1e-9)
        idx = (np.arange(w) + s) % N                       # 끝이 처음과 이어지게(반복 재생)
        np.add.at(out, idx, g)
    return out[:N]


# 경기 내내 깔리는 관중 웅성거림(30초 반복, 좌우 따로 쌓아 넓게)
src = np.concatenate([cheerR, loopR])
amb = np.stack([grains(src, 30.0, 2.6, 4.0), grains(src, 30.0, 2.6, 4.0)], axis=1)
amb = filt(amb, 'low', 5000, 2)
amb = filt(amb, 'high', 120, 2)
save('crowd_loop', amb, kbps=80)


def swell(src, dur, a, hold, d, lo, hi):
    g = grains(src, dur + 1.0, 1.4, 5.0)[:int(dur * SR)]
    g = filt(g, 'band', [lo, hi], 3)
    t = np.arange(len(g)) / SR
    e = np.clip(t / a, 0, 1) * np.where(t < a + hold, 1, np.exp(-(t - a - hold) / d))
    return g * e


# '오~': 짧게 부풀었다가 가라앉는 함성(가운데 음역만)
ooh = swell(cheerR, 2.0, 0.28, 0.45, 0.45, 280, 1500)
save('crowd_ooh', fade(ooh, 0.01, 0.4))
# '아~'(아쉬움): 음이 내려가며 사라진다
aw = swell(cheerR, 2.6, 0.12, 0.5, 0.55, 250, 1300)
aw = varispeed(aw, 1.05, 0.72)
save('crowd_aww', fade(aw, 0.01, 0.5))

# ── 합성 ──
# 헛스윙 '휙': 소리 높이가 올라갔다 내려가는 바람 소리
n = int(0.3 * SR); t = np.arange(n) / SR
x = noise(n); out = np.zeros(n); blk = 256
for i in range(0, n, blk):
    k = i / n; fc = 350 + 1500 * np.sin(np.pi * min(1, k * 1.15)) ** 1.5
    sos = butter(2, [fc * 0.7, fc * 1.4], btype='band', fs=SR, output='sos')
    out[i:i + blk] = sosfilt(sos, x[max(0, i - 2048):i + blk])[-len(x[i:i + blk]):]
out *= np.sin(np.pi * np.clip(t / 0.3, 0, 1)) ** 1.6
save('swing_whoosh', fade(out, 0.005, 0.05))

# 공이 땅에 튀는 소리(흙): 낮은 '툭' + 흙 부스러기
n = int(0.16 * SR); t = np.arange(n) / SR
b = np.sin(2 * np.pi * (170 - 60 * t / 0.16) * t) * env(n, 0.001, 0.03) + filt(noise(n), 'band', [400, 2500], 2) * env(n, 0.001, 0.02) * 0.4
save('ball_bounce', fade(b, 0.001, 0.03))

# 펜스 맞는 소리: 쿵 + 패드가 떨리는 울림
n = int(0.45 * SR); t = np.arange(n) / SR
f = np.sin(2 * np.pi * 78 * t) * env(n, 0.002, 0.09) + 0.5 * np.sin(2 * np.pi * 190 * t) * env(n, 0.002, 0.05)
f += filt(noise(n), 'band', [150, 900], 2) * env(n, 0.001, 0.06) * 0.6
save('fence_hit', fade(room(f, 0.3, 0.2, 2000), 0.001, 0.08))




# 홈런·연습 끝 팡파레: 금관 합주(세 명이 함께 부는 부드러운 금관 + 처음에만 밝게 열리는 소리) 화음,
# 팀파니, 위에서 반짝이는 종소리, 넓은 홀 울림(좌우가 다른 잔향). 가락은 솔·도·미 꾸밈음 → IV(파 화음) → I(도 화음)로 끝나는 진행
def brass(freq, dur, vel=1.0):
    n = int((dur + 0.3) * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for k, cents in enumerate((-6, 0, 5)):           # 살짝씩 다른 음높이 세 개 → 합주처럼 두꺼워진다
        f = freq * 2 ** (cents / 1200)
        vib = 1 + 0.003 * np.sin(2 * np.pi * (5.0 + 0.4 * k) * t + k) * np.clip((t - 0.3) / 0.4, 0, 1)
        ph = 2 * np.pi * np.cumsum(f * vib) / SR
        y += sum(np.sin(h * ph) / h for h in range(1, int(min(28, 6000 / f)) + 1))
    mellow, bright = filt(y, 'low', 1100), filt(y, 'low', 3600)
    k = 0.9 * np.minimum(1, t / 0.03) * np.exp(-t / 0.28)   # 불기 시작할 때만 '빠앙' 밝게
    amp = np.minimum(1, t / 0.04) * np.where(t < dur, 1 - 0.12 * t / max(dur, 1e-3), np.clip(1 - (t - dur) / 0.28, 0, 1))
    return (mellow + bright * k) * amp * vel


def bell(freq, vel=1.0, dur=2.2):
    n = int(dur * SR); t = np.arange(n) / SR
    return vel * sum(a * np.sin(2 * np.pi * freq * r * t) * np.exp(-t * 2.2 * r ** 0.6) for r, a in [(1, 1), (2.76, 0.4), (5.4, 0.18), (8.93, 0.08)]) * np.minimum(1, t / 0.002)


def timpani(freq, vel=1.0, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR
    f = freq * (1 + 0.06 * np.exp(-t / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * np.exp(-t / 0.25)
    hit = filt(noise(n), 'band', [80, 900]) * np.exp(-t / 0.03) * 0.6
    return vel * (body * np.exp(-t / 0.55) + hit) * np.minimum(1, t / 0.003)


def hall(x, dur=2.6, mix=0.32):                       # 넓은 홀 울림: 왼쪽·오른쪽 잔향을 따로 만들어 퍼지게
    n = int(dur * SR); out = []
    pre = int(0.018 * SR)
    for c in range(2):
        ir = noise(n) * np.exp(-np.linspace(0, 6.5, n)); ir = filt(ir, 'low', 4200)
        ir = np.concatenate([np.zeros(pre), ir])
        w = fftconvolve(x[:, c], ir)[:len(x) + n + pre]
        out.append(np.pad(w, (0, len(x) + n + pre - len(w))))
    wet = np.stack(out, axis=1)
    dry = np.concatenate([x, np.zeros((n + pre, 2))])
    return dry + wet / (np.abs(wet).max() + 1e-9) * np.abs(x).max() * mix


def place(buf, y, t0, pan=0.0):                       # pan: -1 왼쪽 … 1 오른쪽
    i = int(t0 * SR); y = y[:len(buf) - i]
    buf[i:i + len(y), 0] += y * np.sqrt((1 - pan) / 2) * 1.414
    buf[i:i + len(y), 1] += y * np.sqrt((1 + pan) / 2) * 1.414


N = lambda m: 440 * 2 ** ((m - 69) / 12)            # MIDI 음 번호 → 주파수
fan = np.zeros((int(3.0 * SR), 2))
# 꾸밈음 셋: 솔 · 도 · 미 (옥타브 아래를 겹쳐 두껍게)
for i, m in enumerate((67, 72, 76)):
    place(fan, brass(N(m), 0.1, 0.8), 0.13 * i, 0.15)
    place(fan, brass(N(m - 12), 0.1, 0.45), 0.13 * i, -0.15)
# IV 화음(파·라·도) — 맨 위 가락 파
t4, d4 = 0.4, 0.4
for m, v, p in ((41, 0.55, 0), (53, 0.5, -0.35), (57, 0.45, 0.35), (60, 0.45, -0.2), (65, 0.5, 0.2), (69, 0.45, -0.4), (77, 0.8, 0.1)):
    place(fan, brass(N(m), d4, v), t4, p)
place(fan, timpani(N(29), 0.5), t4)
# I 화음(도·미·솔) — 맨 위 가락 솔로 한 계단 올라가 길게
t1, d1 = 0.82, 1.35
for m, v, p in ((36, 0.6, 0), (48, 0.5, -0.3), (55, 0.45, 0.3), (60, 0.45, -0.25), (64, 0.45, 0.25), (67, 0.5, -0.4), (72, 0.5, 0.4), (79, 0.85, 0.1)):
    place(fan, brass(N(m), d1, v), t1, p)
place(fan, timpani(N(24), 0.9), t1)
# 종소리: 도 화음을 위로 흩뿌린다
for i, m in enumerate((84, 88, 91, 96)):
    place(fan, bell(N(m), 0.22 - 0.03 * i), t1 + 0.06 + 0.07 * i, (-0.5, 0.5, -0.3, 0.3)[i])
fan = filt(fan, 'high', 45, 2)                       # 귀에 안 들리는 아주 낮은 울림은 덜어 낸다
fan = hall(fan)
fan = fan[:int(4.2 * SR)]
save('jingle_hr', fade(fan, 0.002, 1.4), kbps=112)
