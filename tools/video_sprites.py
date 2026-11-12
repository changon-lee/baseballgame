"""달리기 영상(mp4)에서 한 주기를 찾아 8장을 뽑고, 배경을 지워 게임용 스프라이트(WebP)로 만든다.

사용법: python -I tools/video_sprites.py <영상 폴더(assets/raw)> <작업 폴더> [영상 이름,...(이것만 다시 만든다)]
필요: pip install imageio-ffmpeg "rembg[cpu]"  (rembg는 처음 쓸 때 모델을 내려받는다)
결과: assets/sprites/<이름>_0..7.webp, 마지막 줄에 크기·기준점 JSON(sprites.js의 FIELD에 옮긴다)
  1) 모든 프레임을 작은 모델(u2netp)로 실루엣만 만들어, 모양이 다시 같아지는 간격(주기)을 찾는다
  2) 주기가 가장 잘 이어지는 구간에서 8장을 고르고, 큰 모델(isnet)로 배경을 지운다
  3) 머리 가로 위치를 맞춰(제자리 달리기라도 영상 속 선수가 조금씩 움직이므로) 같은 크기 그림에 놓는다.
     세로는 그대로 둬서 뛰어오를 때 몸이 뜨는 느낌을 살린다. 1피트 = PX_FT 픽셀로 줄인다
"""
import glob, json, os, subprocess, sys
import numpy as np
from PIL import Image
import imageio_ffmpeg
from rembg import remove, new_session

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
PX_FT = 50
N = 8
# 영상: (스프라이트 이름, 키 기준 — side는 달리는 키 5.6피트(중간값), front/back은 가장 클 때 6피트)
VIDEOS = {
    'side_running': ('frun', 'side'),
    'front_running': ('frun_front', 'front'),
    'back_running': ('frun_back', 'back'),
    'baserunner_side_running': ('runner', 'side'),
    'baserunner_front_running': ('runner_front', 'front'),
    'baserunner_back_running': ('runner_back', 'back'),
    # 대각선(오른쪽으로 비스듬히): 멀어지는 쪽 3/4 뒷모습, 다가오는 쪽 3/4 앞모습. 왼쪽은 게임에서 뒤집어 쓴다
    'baserunner_diag_back_running': ('runner_diagb', 'back'),
    'baserunner_diag_front_running': ('runner_diagf', 'front'),
}
ONLY = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
small = new_session('u2netp')
big = new_session('isnet-general-use')
meta = {}
for video, (name, view) in VIDEOS.items():
    if ONLY and video not in ONLY: continue
    d = os.path.join(WORK, video); os.makedirs(d, exist_ok=True)
    if not glob.glob(os.path.join(d, 'f*.png')):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, video + '.mp4'), os.path.join(d, 'f%03d.png')], check=True)
    fs = sorted(glob.glob(os.path.join(d, 'f*.png')))
    # 1) 실루엣 → 주기
    sil = os.path.join(d, 'sil.npy')
    if os.path.exists(sil): S = np.load(sil)
    else:
        S = []
        for f in fs:
            im = Image.open(f).convert('RGB'); im = im.resize((im.width // 2, im.height // 2))
            a = np.asarray(remove(im, session=small, only_mask=True)) > 128; ys, xs = np.nonzero(a)
            c = Image.fromarray((a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype(np.uint8)).resize((48, 96), Image.BILINEAR) if len(xs) else Image.new('L', (48, 96))
            S.append(np.asarray(c, np.float32) / 255)
        S = np.stack(S); np.save(sil, S)
    n = len(S)
    D = lambda i, j: float(np.abs(S[i] - S[j]).mean())
    score = {P: np.mean([D(i, i + P) for i in range(n - P)]) for P in range(20, min(64, n // 2))}
    best = min(score.values())
    # 가장 짧은 '거의 최소' 간격(반 주기는 좌우 다리가 바뀐 모양이라 덜 비슷해서 걸러진다)
    P = next(p for p in sorted(score) if score[p] <= best * 1.04 and score[p] <= score.get(p - 1, 9) and score[p] <= score.get(p + 1, 9))
    s0 = min(range(n - P), key=lambda s: D(s, s + P))
    idx = [s0 + round(k * P / N) for k in range(N)]
    print(video, 'period', P, 'start', s0, 'frames', idx, flush=True)
    # 2) 배경 지우기
    cut = []
    for i in idx:
        im = remove(Image.open(fs[i]).convert('RGB'), session=big)
        a = np.asarray(im.getchannel('A')); a = np.where(a < 40, 0, a).astype(np.uint8)
        im.putalpha(Image.fromarray(a))
        x0, y0, x1, y1 = im.getbbox()
        top = np.nonzero(a[y0:y0 + max(4, (y1 - y0) // 10)] > 128)[1]
        cut.append((im, (x0, y0, x1, y1), float(top.mean()) if len(top) else (x0 + x1) / 2))
    # 3) 머리 x를 맞춰 같은 크기 그림에
    H = np.mean([c[2] for c in cut])
    shifts = [round(H - c[2]) for c in cut]
    L = min(c[1][0] + s for c, s in zip(cut, shifts)); R = max(c[1][2] + s for c, s in zip(cut, shifts))
    T = min(c[1][1] for c in cut); B = max(c[1][3] for c in cut)
    hs = [c[1][3] - c[1][1] for c in cut]
    pxft = float(np.median(hs)) / 5.6 if view == 'side' else max(hs) / 6.0
    k = PX_FT / pxft
    W, Hh = round((R - L) * k), round((B - T) * k)
    frames = []
    for j, ((im, bb, hx), s) in enumerate(zip(cut, shifts)):
        c = Image.new('RGBA', (R - L, B - T)); c.alpha_composite(im.crop(bb), (bb[0] + s - L, bb[1] - T))
        c = c.resize((W, Hh), Image.LANCZOS)
        c.save(os.path.join(OUT, f'{name}_{j}.webp'), 'WEBP', quality=86, method=6)
    A = [np.asarray(Image.open(os.path.join(OUT, f'{name}_{j}.webp')).getchannel('A')) for j in range(N)]
    feet = [np.nonzero(a[int(Hh * 0.9):] > 128)[1] for a in A]
    ax = round(float(np.mean([(f.min() + f.max()) / 2 for f in feet if len(f)])))
    meta[name] = [{'w': W, 'h': Hh, 'ax': ax, 'hx': round((H - L) * k)} for _ in range(N)]
    print(name, (W, Hh), 'px/ft', round(pxft, 1), flush=True)
print(json.dumps(meta))
