"""타구 장면 수비수 그림 추가분(초록 배경 이미지 한 장씩)을 게임용 스프라이트(WebP)로 만든다.

사용법: python -I tools/field_extra.py <이미지 폴더(assets/raw)>
결과: assets/sprites/fstretch_0.webp, fback_0~2.webp, cback_0.webp, 마지막 줄에 JSON(sprites.js의 FIELD에 옮긴다)
  - 1_first_baseman: 1루수가 다리를 쭉 뻗어 송구를 받는 옆모습(오른쪽을 본다). 발밑의 흰 베이스는 지운다
  - 3-1, 3-2, 3-3: 수비수 뒷모습(서서 보기, 뜬공 잡기, 준비 자세) — field3d.js가 'fback' 0·1·2로 쓴다
  - 4_catcher: 포수가 쪼그려 앉은 뒷모습(타구 장면 카메라는 홈 뒤에 있다)
  - 이미지마다 선수 크기가 달라서, 그림 키를 자세별로 정한 값(1피트 = 50픽셀, 기존 수비수 그림과 같은 비율)에 맞춘다
"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
# 이름: [(파일, 그림 키(픽셀))]. 기존 그림: 서서 보기 303, 뜬공(팔 위로) 330, 준비 자세 250, 송구 내딛기 256
JOBS = {
    'fstretch': [('1_first_baseman.jpg', 245)],
    'fback': [('3-1_standing_and_watching.jpg', 303), ('3-2_catching_a_fly_ball.jpg', 330), ('3-3_ready_position.jpg', 250)],
    'cback': [('4_catcher.jpg', 190)],
}


def chroma(path):
    """초록 배경 빼기(video_pitcher.py와 같다): 초록이 빨강·파랑보다 얼마나 센지로 투명도를 정하고 초록 번짐을 걷어 낸다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    edge = np.concatenate([d[:8].ravel(), d[-8:].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    t0, t1 = 18.0, np.median(edge) * 0.55
    A = np.clip((t1 - d) / (t1 - t0), 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b))
    return a, A


def biggest(mask):
    """가장 큰 덩어리만(4분의 1로 줄여서 찾는다)"""
    small = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((mask.shape[1] // 4, mask.shape[0] // 4))) > 128
    h, w = small.shape; seen = np.zeros_like(small); best = []
    for y0, x0 in zip(*np.nonzero(small)):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) > len(best): best = pts
    keep = np.zeros_like(small); ys, xs = zip(*best); keep[ys, xs] = True
    big = np.asarray(Image.fromarray(keep.astype(np.uint8) * 255).resize((mask.shape[1], mask.shape[0]))) > 0
    from PIL import ImageFilter
    return np.asarray(Image.fromarray(big.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))) > 0


meta = {}
for name, files in JOBS.items():
    frames = []
    for i, (f, target) in enumerate(files):
        a, A = chroma(os.path.join(SRC, f))
        if name == 'fstretch':                     # 흰 베이스: 그림 아래쪽 6%의 흰·회색(신발은 남색, 양말은 파랑)
            ys = np.nonzero((A > 0.5).any(axis=1))[0]; y0, y1 = ys.min(), ys.max()
            lo = a.min(axis=2); sat = a.max(axis=2) - lo
            base = (lo > 150) & (sat < 40); base[: int(y1 - (y1 - y0) * 0.06)] = False
            A[base] = 0
        A[~biggest(A > 0.5)] = 0
        A[A < 0.16] = 0
        im = Image.fromarray(np.dstack([a, A * 255]).round().astype(np.uint8), 'RGBA')
        im = im.crop(im.getchannel('A').getbbox())
        k = target / im.height
        im = im.resize((max(1, round(im.width * k)), target), Image.LANCZOS)
        out = f'{name}_{i}.webp'
        im.save(os.path.join(OUT, out), 'WEBP', quality=86, method=6)
        w, h = im.size
        P = np.asarray(im.getchannel('A')) > 128
        xs = np.nonzero(P[int(h * 0.92):].any(axis=0))[0]
        top = np.nonzero(P[: int(h * 0.12)].any(axis=0))[0]
        frames.append({'w': w, 'h': h, 'ax': round((xs.min() + xs.max()) / 2) if len(xs) else w // 2,
                       'hx': round(float(top.mean())) if len(top) else w // 2})
        print(name, i, f, (w, h), 'size', os.path.getsize(os.path.join(OUT, out)), flush=True)
    meta[name] = frames
print(json.dumps(meta))
