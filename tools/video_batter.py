"""타격 영상(mp4)에서 준비 → 내딛기 → 스윙 → 팔로스루 프레임을 뽑아 타자 스프라이트(WebP)로 만든다. 방망이도 그림에 들어 있다.

사용법: python -I tools/video_batter.py <영상 폴더(assets/raw)> <작업 폴더> [스프라이트 이름 ...(없으면 전부)]
필요: pip install imageio-ffmpeg (초록 배경이 아닌 영상만 "rembg[cpu]")
결과: assets/sprites/batter_*.webp(타자 시점, 옆에서), batter_front_*.webp(투수 시점, 앞에서), 마지막 줄에 JSON(sprites.js의 SETS·IDLE에 옮긴다)
  - 영상은 초록 배경(_g, 크로마키 #00B140)이다. 초록만 빼서 자르므로 밝은 방망이도 지워지지 않는다(예전 회색 배경 영상은 AI 배경 지우기가 방망이를 같이 지웠다)
  - 스윙 두 묶음은 모두 29장, 같은 순서(0 준비, 1~5 다리 들고 내딛기, 6 내딛은 자세, 7~13 스윙, 14 임팩트, 15~24 팔로스루, 25~28 마무리)라 같은 시각표를 쓴다
  - 영상의 프레임 번호(24fps)는 눈으로 보고 정했다
    batter_swing_g: 1 준비, 45~65 다리 들고 내딛기, 72 내딛은 자세, 76~82 스윙, 83 임팩트(방망이가 투수 쪽으로 수평), 84~ 팔로스루
    batter_swing_front_g: 1 준비, 45~70 다리 들고 내딛기, 74 내딛은 자세, 77~85 스윙(몸 뒤 → 카메라 쪽), 86 임팩트(방망이가 홈플레이트를 가로질러 수평), 87~ 팔로스루
  - 기다리는 동작 batter_idle(_front): 이 영상들엔 방망이 흔들기가 없어서, 준비 자세에서 천천히 움직이는 앞부분(1~24)을
    갔다가 되돌아오게(sprites.js의 pingpong) 반복한다. RES배로 줄여 저장하고 sprites.js에서 그만큼 키워 그린다
  - 배경을 지우고, 몸·방망이에서 떨어진 작은 조각은 지운다
  - 모든 프레임을 같은 좌표(영상 화면)에 두고, 기준점 = 첫 프레임(준비 자세)의 두 발 가운데. 그래서 내딛는 발이 영상 그대로 움직인다
  - 배율: 준비 자세의 발 ~ 헬멧 꼭대기(방망이 빼고) = SET_H 픽셀
"""
import glob, json, os, subprocess, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
import imageio_ffmpeg

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
JOBS = [   # (영상, 스프라이트 이름, 프레임 번호, 임팩트 프레임(기다리는 동작은 None), 저장 배율)
    ('batter_swing_g', 'batter', [1, 45, 50, 55, 60, 65, 72] + list(range(76, 94)) + [96, 100, 110, 130], 83, 1),
    ('batter_swing_front_g', 'batter_front', [1, 45, 53, 61, 66, 70, 74, 77, 79, 80, 81, 82, 84, 85] + list(range(86, 97)) + [99, 105, 115, 135], 86, 1),
    ('batter_swing_g', 'batter_idle', list(range(1, 25)), None, 0.7),
    ('batter_swing_front_g', 'batter_idle_front', list(range(1, 25)), None, 0.7),
]
ONLY = sys.argv[3:]
SET_H = 662


def components(a):
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


def chroma(path):
    """초록 배경 빼기: 초록이 빨강·파랑보다 얼마나 센지(d)로 투명도를 정하고, 가장자리에 묻은 초록빛을 걷어 낸다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    edge = np.concatenate([d[:8].ravel(), d[-8:].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    bg = np.median(edge)                                   # 배경의 초록 세기(영상마다 다르다)
    t0, t1 = 18.0, bg * 0.55
    A = np.clip((t1 - d) / (t1 - t0), 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b))            # 초록 번짐 제거(흰 유니폼·나무 방망이·피부는 거의 그대로)
    return Image.fromarray(np.dstack([a, A * 255]).round().astype(np.uint8), 'RGBA')


def rembg_cut(path):
    from rembg import remove, new_session
    global _session
    if '_session' not in globals(): _session = new_session('isnet-general-use')
    return remove(Image.open(path).convert('RGB'), session=_session)


def cutout(path, green):
    """배경을 지우고 몸과 방망이만 남긴다(방망이가 손에서 떨어져 보이는 프레임도 있어서 작은 덩어리까지 남긴다)."""
    im = chroma(path) if green else rembg_cut(path)
    A = np.asarray(im.getchannel('A')).copy()
    small = Image.fromarray(A).resize((A.shape[1] // 4, A.shape[0] // 4))
    comps = components(np.asarray(small) > 100)
    keep = np.zeros(np.asarray(small).shape, bool)
    for c in comps:
        if len(c) >= max(25, len(comps[0]) * 0.01):
            ys, xs = zip(*c); keep[ys, xs] = True
    big = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).resize((A.shape[1], A.shape[0]))) > 0
    big = np.asarray(Image.fromarray(big.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
    A[~big] = 0; A[A < 40] = 0
    im.putalpha(Image.fromarray(A))
    return im


meta = {}
for video, sprite, IDX, contact, RES in JOBS:
    if ONLY and sprite not in ONLY: continue
    assert contact is None or (len(IDX) == 29 and IDX.index(contact) == 14)
    d = os.path.join(WORK, video); os.makedirs(d, exist_ok=True)
    if not glob.glob(os.path.join(d, 'f*.png')):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, video + '.mp4'), '-map', '0:0', os.path.join(d, 'f%03d.png')], check=True)
    cuts = [cutout(os.path.join(d, 'f%03d.png' % i), video.endswith('_g')) for i in IDX]
    # 기준점: 준비 자세의 두 발(아래 6% 줄 가운데). 키: 방망이(나무색)를 빼고 잰 꼭대기(헬멧)까지
    P = np.asarray(cuts[0]).astype(int); r, g, b, a = (P[..., i] for i in range(4))
    ys, xs = np.nonzero(a > 128); y1 = ys.max()
    top = np.nonzero((a > 128) & (b > r + 60) & (b > g + 30))[0].min()   # 헬멧(파란색) 꼭대기 — 방망이는 머리 위로 솟아 있어서 뺀다
    foot = xs[ys > y1 - (y1 - top) * 0.06]
    ox, oy = (foot.min() + foot.max()) / 2, y1 + 1
    k = SET_H / (y1 + 1 - top) * RES
    frames = []
    for j, im in enumerate(cuts):
        x0, y0, x1, y1b = im.getbbox()
        c = im.crop((x0, y0, x1, y1b)); w, h = round(c.width * k), round(c.height * k)
        c = c.resize((w, h), Image.LANCZOS)
        c.save(os.path.join(OUT, f'{sprite}_{j}.webp'), 'WEBP', quality=84 if RES == 1 else 80, method=6)
        frames.append({'w': w, 'h': h, 'ax': round((ox - x0) * k), 'ay': round((oy - y0) * k)})
        print(sprite, j, IDX[j], frames[-1], os.path.getsize(os.path.join(OUT, f'{sprite}_{j}.webp')), flush=True)
    meta[sprite] = frames
print(json.dumps(meta))
