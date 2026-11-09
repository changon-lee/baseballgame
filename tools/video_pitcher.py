"""투구 영상(mp4)에서 셋 자세 → 릴리스 → 팔로스루 프레임을 뽑아 투수 스프라이트(WebP)로 만든다.

사용법: python -I tools/video_pitcher.py <영상 폴더(assets/raw)> <작업 폴더> [이름...]
필요: pip install imageio-ffmpeg (초록 배경이 아닌 영상은 "rembg[cpu]"도)
결과: assets/sprites/pitcher_back_*.webp, pitcher_front_*.webp, 마지막 줄에 JSON(sprites.js의 SETS에 옮긴다)
  - 영상의 프레임 번호(24fps): 다리를 들기 시작하는 곳(start), 공이 손을 떠나기 직전(release)은 눈으로 보고 정했다
  - 셋~릴리스 사이 WIND장을 고르게, 릴리스 뒤 AFTER 프레임을 더 뽑는다
  - 초록 배경 영상(_g)은 색으로 배경을 빼고, 아니면 rembg로 지운다. 몸에서 떨어진 조각(날아가는 공 등)은 지운다
  - 모든 프레임을 같은 좌표(영상 화면)에 두고, 기준점 = 첫 프레임(셋 자세)의 축발. 그래서 내딛고 몸이 움직이는 것이 영상 그대로 남는다
  - 공이 손을 떠나는 위치(hand) = 릴리스 뒤 처음으로 몸에서 떨어져 보이는 공의 위치
  - 뒷모습은 등 이름·번호를 그릴 자리(num) = 등(흰 유니폼) 가운데
"""
import glob, json, os, subprocess, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
import imageio_ffmpeg

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
WIND = 18
AFTER = [3, 6, 10, 15, 22, 30, 40]
SET_H = 667                                       # 셋 자세 그림 키(픽셀)
# 이름: (영상 파일, start, release) 프레임 번호(1부터)
# pitcher_back34_g2(투수 오른쪽 뒤 3/4 시점): 1~29 제자리 셋, 30부터 다리 들기, 79 릴리스(80부터 공이 손을 떠나 보인다).
#   홈 쪽(화면 오른쪽 안)으로 내딛어서 내딛은 뒤엔 카메라에서 멀어져 작아진다(원근 그대로)
VIDEOS = {'pitcher_back': ('pitcher_back34_g2', 30, 79), 'pitcher_front': ('pitcher_front', 10, 97)}
ONLY = sys.argv[3:] or list(VIDEOS)
# 공이 손을 떠나는 위치를 눈으로 정한 것(릴리스 그림 좌표). pitcher_back34_g2는 다음 프레임에 공이 벌써 멀리 날아가 있어서 손에 쥔 공 자리를 쓴다
HAND = {'pitcher_back': [153, 12]}


def chroma(path):
    """초록 배경 빼기(video_batter.py와 같다): 초록이 빨강·파랑보다 얼마나 센지로 투명도를 정하고 초록 번짐을 걷어 낸다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    edge = np.concatenate([d[:8].ravel(), d[-8:].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    t0, t1 = 18.0, np.median(edge) * 0.55
    A = np.clip((t1 - d) / (t1 - t0), 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b))
    return Image.fromarray(np.dstack([a, A * 255]).round().astype(np.uint8), 'RGBA')


def rembg_cut(path):
    from rembg import remove, new_session
    global _session
    if '_session' not in globals(): _session = new_session('isnet-general-use')
    return remove(Image.open(path).convert('RGB'), session=_session)


def components(a):
    """불투명 덩어리들: [(픽셀 수, 마스크)]"""
    h, w = a.shape
    seen = np.zeros_like(a, bool); out = []
    for y0, x0 in zip(*np.nonzero(a)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        out.append(pts)
    return sorted(out, key=len, reverse=True)


def cutout(path, green):
    """배경을 지우고 몸통(가장 큰 덩어리와 그만한 덩어리)만 남긴다. 떨어져 나간 작은 덩어리(공)의 가운데도 돌려준다."""
    im = chroma(path) if green else rembg_cut(path)
    A = np.asarray(im.getchannel('A')).copy()
    small = Image.fromarray(A).resize((A.shape[1] // 4, A.shape[0] // 4))
    comps = components(np.asarray(small) > 128)
    keep = np.zeros(np.asarray(small).shape, bool); balls = []
    for c in comps:
        ys, xs = zip(*c)
        if len(c) >= len(comps[0]) * 0.15: keep[ys, xs] = True
        elif len(c) >= 2: balls.append((np.mean(xs) * 4 + 2, np.mean(ys) * 4 + 2))
    big = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).resize((A.shape[1], A.shape[0]))) > 0
    big = np.asarray(Image.fromarray(big.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
    A[~big] = 0; A[A < 40] = 0
    im.putalpha(Image.fromarray(A))
    return im, balls


meta = {}
for name in ONLY:
    src, start, rel = VIDEOS[name]; green = src.endswith('_g')
    d = os.path.join(WORK, src); os.makedirs(d, exist_ok=True)
    if not glob.glob(os.path.join(d, 'f*.png')):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, src + '.mp4'), '-map', '0:0', os.path.join(d, 'f%03d.png')], check=True)
    n = len(glob.glob(os.path.join(d, 'f*.png')))
    idx = [start + round(k * (rel - start) / (WIND - 1)) for k in range(WIND)] + [min(n, rel + a) for a in AFTER]
    print(name, 'frames', idx, flush=True)
    cuts = [cutout(os.path.join(d, 'f%03d.png' % i), green) for i in idx]
    for r in (1, 2, 3):                         # 공이 손에서 떨어져 보이는 첫 프레임
        _, balls = cutout(os.path.join(d, 'f%03d.png' % (rel + r)), green)
        if balls: break
    # 기준점: 셋 자세의 발(아래 6% 줄 가운데), 배율: 셋 자세 키 = SET_H
    A0 = np.asarray(cuts[0][0].getchannel('A')) > 128
    ys, xs = np.nonzero(A0); y1 = ys.max(); top = ys.min()
    foot = xs[ys > y1 - (y1 - top) * 0.06]
    ox, oy = (foot.min() + foot.max()) / 2, y1 + 1
    k = SET_H / (y1 + 1 - top)
    frames = []
    for j, (im, _) in enumerate(cuts):
        x0, y0, x1, y1b = im.getbbox()
        c = im.crop((x0, y0, x1, y1b)); w, h = round(c.width * k), round(c.height * k)
        c = c.resize((w, h), Image.LANCZOS)
        c.save(os.path.join(OUT, f'{name}_{j}.webp'), 'WEBP', quality=84, method=6)
        f = {'w': w, 'h': h, 'ax': round((ox - x0) * k), 'ay': round((oy - y0) * k)}
        if name == 'pitcher_back' and j < WIND:   # 등 가운데(흰 유니폼만) — 이름·번호 자리
            P = np.asarray(c).astype(int); r, g, b, a = (P[..., i] for i in range(4))
            white = (a > 128) & (np.minimum(np.minimum(r, g), b) > 170) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 30)
            band = white[int(h * 0.15):int(h * 0.36)]
            yy, xx = np.nonzero(band)
            if len(xx): f['num'] = [round(float(np.median(xx))), round(float(np.median(yy)) + h * 0.15)]
        if j == WIND - 1:                         # 릴리스 프레임: 떨어져 나간 공 자리, 못 찾으면 맨 위 끝(머리 위로 올린 손)
            if name in HAND:
                f['hand'] = HAND[name]
            elif balls:
                bx, by = min(balls, key=lambda p: p[1])
                f['hand'] = [round((bx - x0) * k), round((by - y0) * k)]
            else:
                a = np.asarray(c.getchannel('A')) > 128; yy, xx = np.nonzero(a[:12])
                f['hand'] = [round(float(xx.mean())), 6]
        frames.append(f)
        print(name, j, idx[j], (w, h), f, os.path.getsize(os.path.join(OUT, f'{name}_{j}.webp')), flush=True)
    meta[name] = frames
print(json.dumps(meta))
