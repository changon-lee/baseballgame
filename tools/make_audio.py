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


# 응원 북·박수 반복(한국 야구장 느낌의 '쿵 쿵 짝짝짝'), 128bpm 4마디
def kick(n):
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(55 + 90 * np.exp(-t / 0.03)) / SR
    return np.sin(ph) * env(n, 0.001, 0.16) + filt(noise(n), 'band', [1200, 4000], 2) * env(n, 0.0005, 0.006) * 0.25


def clap(n):
    out = np.zeros(n)
    for d in (0.0, 0.009, 0.018):                         # 여러 사람이 살짝 어긋나게 친다
        s = int(d * SR); m = n - s
        out[s:] += filt(noise(m), 'band', [900, 3200], 2) * env(m, 0.0008, 0.035)
    return out


bpm = 128; beat = 60 / bpm; bar = 4 * beat; bars = 4
L = int(bars * bar * SR); drum = np.zeros(L + SR)
pat = [(0, 'k'), (1, 'k'), (2, 'c'), (2.5, 'c'), (3, 'c')]   # 한 마디: 쿵 쿵 짝짝 짝
for b_ in range(bars):
    for pos, kind in pat:
        s = int((b_ * bar + pos * beat) * SR) + int(rng.integers(0, int(0.004 * SR)))
        hit = kick(int(0.5 * SR)) * 1.0 if kind == 'k' else clap(int(0.2 * SR)) * 0.55
        drum[s:s + len(hit)] += hit
tail = drum[L:]; drum = drum[:L]; drum[:len(tail)] += tail     # 끝 잔향을 처음에 더해 반복이 매끄럽게
drum = room(drum, 0.6, 0.25, 2500)[:L]
drum[:int(0.6 * SR)] += 0                                     # (room 꼬리는 버린다)
save('cheer_drum_loop', drum, kbps=80)


# 홈런 팡파레: 야구장 오르간 느낌(배음을 더한 음), 위로 올라가는 짧은 가락
def organ(freq, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t)
    y = sum(a * np.sin(2 * np.pi * freq * h * vib * t) for h, a in [(1, 1), (2, 0.6), (3, 0.35), (4, 0.25), (6, 0.12), (8, 0.08)])
    e = np.minimum(1, t / 0.012) * np.where(t < dur - 0.06, 1, np.clip((dur - t) / 0.06, 0, 1))
    return y * e * vel


notes = [(392, 0.16), (523, 0.16), (659, 0.16), (784, 0.3), (659, 0.14), (784, 0.7)]    # 솔 도 미 솔 - 미 솔
jl = np.zeros(int(sum(d for _, d in notes) * SR) + SR); p = 0
for fq, d in notes:
    y = organ(fq, d + 0.02) + 0.5 * organ(fq / 2, d + 0.02)
    jl[p:p + len(y)] += y; p += int(d * SR)
save('jingle_hr', fade(room(jl, 0.8, 0.3, 4000), 0.002, 0.5))
