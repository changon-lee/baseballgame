"""타자 뒷모습(타격 시점, 타자 등 뒤 카메라) 영상에서 스프라이트를 뽑는다. video_batter.py와 같은 방식에 바닥 지우기를 더했다.

사용법: python -I tools/video_back.py <영상 폴더(assets/raw)> <작업 폴더>
결과: assets/sprites/batter_back_*.webp, batter_back_idle_*.webp, 마지막 줄에 JSON(sprites.js의 SETS·IDLE에 옮긴다)
  - 영상은 초록 벽 앞이지만 바닥(잔디 띠·흙·타석 선·홈플레이트)이 같이 찍혀 있다.
    바닥 줄(초록 벽이 끝나는 높이) 아래에서는 흰색(바지·신발)만 남기고, 세로로 얇은 흰 것(분필 선·홈플레이트)은 지운다
  - 영상 속 타자는 오른손 타자이고, 투수는 화면 왼쪽 앞에 있다(공이 왼쪽에서 날아온다). 그래서 그림은 왼쪽(투수 쪽)을 본다
  - 프레임 번호(24fps): 1 준비, 17~49 다리 들고 내딛기, 57 내딛은 자세, 61~67 스윙, 68 임팩트(방망이가 몸 왼쪽 앞으로 나온 순간), 69~ 팔로스루
  - 기다리는 동작: batter_back_idle_g의 앞부분(1~47, 두 장마다)을 갔다가 되돌아오게 반복한다
"""
import glob, json, os, subprocess, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
import imageio_ffmpeg

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
SET_H = 662
JOBS = [   # (영상, 스프라이트 이름, 프레임 번호, 임팩트 프레임, 저장 배율)
    ('batter_back_g', 'batter_back', [1, 17, 25, 33, 41, 49, 57, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 79, 81, 85, 93, 105, 125], 68, 1),
    ('batter_back_idle_g', 'batter_back_idle', list(range(1, 48, 2)), None, 0.7),
]


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


def ground_line(a):
    """초록 벽이 끝나는 높이: 양쪽 가장자리 열에서 초록 세기가 벽의 절반 아래로 떨어지는 첫 줄"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = (g - np.maximum(r, b))[:, list(range(0, 60)) + list(range(a.shape[1] - 60, a.shape[1]))]
    row = np.median(d, axis=1); wall = np.median(row[: len(row) // 2])
    return int(np.nonzero(row < wall * 0.5)[0][0])


def cutout(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    edge = np.concatenate([d[:8].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    t0, t1 = 18.0, np.median(edge) * 0.55
    A = np.clip((t1 - d) / (t1 - t0), 0, 1)
    gy = ground_line(a) - 6
    # 바닥(잔디 띠·흙): 카메라가 서 있어서 바닥은 줄마다 색이 거의 같다. 다리 바깥에서 그 줄의 바닥색(중앙값)을 재고,
    # 그 색과 확실히 다른 것(흰 바지·신발, 회색 그림자, 금색·검은 밑창)만 남긴다.
    # 흰 것 중 세로로 얇은 것(분필 선·홈플레이트)은 지우고, 다리가 있는 가로 범위 밖은 다 지운다
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    G = slice(gy - 40, None)
    legs = np.nonzero((A[gy - 90:gy - 45] > 0.5).any(axis=0))[0]
    x0, x1 = (legs.min(), legs.max()) if len(legs) else (0, a.shape[1])
    cols = np.zeros(a.shape[1], bool); cols[max(0, x0 - 220):x1 + 220] = True
    outside = np.ones(a.shape[1], bool); outside[max(0, x0 - 260):x1 + 260] = False
    bg = np.median(a[G][:, outside], axis=1)                        # 줄마다 바닥색
    dist = np.sqrt(((a[G] - bg[:, None, :]) ** 2).sum(axis=2))
    R, Gr, B = r[G], g[G], b[G]
    green = (Gr > R + 12) & (Gr > B + 12)                            # 잔디(다리 사이 그늘진 잔디도)
    brown = (R > B + 30) & (R >= Gr) & (60 * (Gr - B) / np.maximum(R - B, 1) < 33) & ((R - B) / np.maximum(R, 1) > 0.25)   # 흙·흙 그림자(색상 26° 근처, 진하다). 금색 밑창은 40° 넘게 노랗고, 흰 신발은 연하다
    keep = (dist > 62) & ~green & ~brown & cols[None, :]
    W = keep                                                          # 세로로 얇은 것(선·홈플레이트·흙 자국)은 지운다
    run = np.zeros_like(W, np.int32)
    for y in range(W.shape[0]): run[y] = (run[y - 1] + 1) * W[y] if y else W[y]
    tall = np.zeros_like(W)
    for y in range(W.shape[0] - 1, -1, -1):          # 아래에서 위로: 이어진 길이를 위쪽 픽셀에도 나눠 준다
        tall[y] = W[y] & ((run[y] >= 14) | (tall[y + 1] if y + 1 < W.shape[0] else False))
    keep &= tall
    A[G] = np.where(keep, np.maximum(A[G], (np.arange(A.shape[0])[G] >= gy)[:, None] * 1.0), 0)
    a[..., 1] = np.minimum(g, np.maximum(r, b))
    im = Image.fromarray(np.dstack([a, A * 255]).round().astype(np.uint8), 'RGBA')
    # 몸·방망이 덩어리만(날아오는 공·떨어진 조각은 지운다)
    AA = np.asarray(im.getchannel('A')).copy()
    small = Image.fromarray(AA).resize((AA.shape[1] // 4, AA.shape[0] // 4))
    comps = components(np.asarray(small) > 100)
    keep = np.zeros(np.asarray(small).shape, bool)
    for c in comps:
        ys, xs = zip(*c)
        # 큰 덩어리(몸·방망이)는 남기고, 작은 덩어리는 바닥 근처(몸에서 살짝 떨어져 보이는 신발)만 남긴다. 날아오는 공은 공중이라 지워진다
        if len(c) >= len(comps[0]) * 0.02 or (len(c) >= 45 and np.mean(ys) * 4 > gy - 150):
            keep[ys, xs] = True
    big = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).resize((AA.shape[1], AA.shape[0]))) > 0
    big = np.asarray(Image.fromarray(big.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0
    AA[~big] = 0; AA[AA < 40] = 0
    im.putalpha(Image.fromarray(AA))
    return im


meta = {}
for video, sprite, IDX, contact, RES in JOBS:
    assert contact is None or (len(IDX) == 29 and IDX.index(contact) == 14)
    d = os.path.join(WORK, video); os.makedirs(d, exist_ok=True)
    if not glob.glob(os.path.join(d, 'f*.png')):
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, video + '.mp4'), '-map', '0:0', os.path.join(d, 'f%03d.png')], check=True)
    cuts = [cutout(os.path.join(d, 'f%03d.png' % i)) for i in IDX]
    # 기준점: 준비 자세의 두 발 가운데. 키: 방망이(검은색)를 빼고 잰 꼭대기(헬멧)까지
    P = np.asarray(cuts[0]).astype(int); r, g, b, a = (P[..., i] for i in range(4))
    ys, xs = np.nonzero(a > 128); y1 = ys.max()
    top = np.nonzero((a > 128) & (np.maximum(np.maximum(r, g), b) > 120))[0].min()
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
