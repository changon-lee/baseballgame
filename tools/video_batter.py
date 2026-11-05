"""타격 영상(mp4)에서 준비 → 내딛기 → 스윙 → 팔로스루 프레임을 뽑아 타자 스프라이트(WebP)로 만든다. 방망이도 그림에 들어 있다.

사용법: python -I tools/video_batter.py <영상 폴더(assets/raw)> <작업 폴더>
필요: pip install imageio-ffmpeg "rembg[cpu]"
결과: assets/sprites/batter_*.webp, 마지막 줄에 JSON(sprites.js의 SETS.batter에 옮긴다)
  - 영상의 프레임 번호(24fps)는 눈으로 보고 정했다: 1 준비, 43~67 다리 들고 내딛기, 72 내딛은 자세, 74~80 스윙, 81 임팩트(방망이가 투수 쪽을 향함), 82~ 팔로스루
  - 배경을 지우고, 몸·방망이에서 떨어진 작은 조각은 지운다
  - 모든 프레임을 같은 좌표(영상 화면)에 두고, 기준점 = 첫 프레임(준비 자세)의 두 발 가운데. 그래서 내딛는 발이 영상 그대로 움직인다
  - 배율: 준비 자세의 발 ~ 헬멧 꼭대기(방망이 빼고) = SET_H 픽셀
"""
import glob, json, os, subprocess, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
import imageio_ffmpeg
from rembg import remove, new_session

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
NAME = 'batter_swing'
IDX = [1, 43, 49, 55, 61, 67, 72] + list(range(74, 92)) + [93, 96, 100, 110]   # 29장: 0 준비, 1~5 다리 들고 내딛기, 6 내딛은 자세, 7~13 스윙, 14 임팩트, 15~ 팔로스루
CONTACT = IDX.index(81)
SET_H = 662
session = new_session('isnet-general-use')


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


def cutout(path):
    """배경을 지우고 몸과 방망이만 남긴다(방망이가 손에서 떨어져 보이는 프레임도 있어서 작은 덩어리까지 남긴다)."""
    im = remove(Image.open(path).convert('RGB'), session=session)
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


d = os.path.join(WORK, NAME); os.makedirs(d, exist_ok=True)
if not glob.glob(os.path.join(d, 'f*.png')):
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, NAME + '.mp4'), os.path.join(d, 'f%03d.png')], check=True)
cuts = [cutout(os.path.join(d, 'f%03d.png' % i)) for i in IDX]
# 기준점: 준비 자세의 두 발(아래 6% 줄 가운데). 키: 방망이(나무색)를 빼고 잰 꼭대기(헬멧)까지
P = np.asarray(cuts[0]).astype(int); r, g, b, a = (P[..., i] for i in range(4))
ys, xs = np.nonzero(a > 128); y1 = ys.max()
top = np.nonzero((a > 128) & (b > r + 60) & (b > g + 30))[0].min()   # 헬멧(파란색) 꼭대기 — 방망이는 머리 위로 솟아 있어서 뺀다
foot = xs[ys > y1 - (y1 - top) * 0.06]
ox, oy = (foot.min() + foot.max()) / 2, y1 + 1
k = SET_H / (y1 + 1 - top)
frames = []
for j, im in enumerate(cuts):
    x0, y0, x1, y1b = im.getbbox()
    c = im.crop((x0, y0, x1, y1b)); w, h = round(c.width * k), round(c.height * k)
    c = c.resize((w, h), Image.LANCZOS)
    c.save(os.path.join(OUT, f'batter_{j}.webp'), 'WEBP', quality=84, method=6)
    frames.append({'w': w, 'h': h, 'ax': round((ox - x0) * k), 'ay': round((oy - y0) * k)})
    print(j, IDX[j], frames[-1], os.path.getsize(os.path.join(OUT, f'batter_{j}.webp')), flush=True)
print(json.dumps({'contact': CONTACT, 'frames': frames}))
