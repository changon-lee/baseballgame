"""육성 메인 화면에 세우는 선수 그림: 초록 배경 사진(assets/raw)에서 선수만 오려 assets/ui 에 넣는다.

사용법: python -I tools/title_player.py
  - wtitle_man.jpg → ui/title_woman.webp(여성 타자), wtitle_pitcher.jpg → ui/title_wpitcher.webp(여성 투수)
  - 초록이 빨강·파랑보다 얼마나 센지로 투명도를 정하고(video_batter.py 의 chroma 와 같은 방식), 몸에서 떨어진 작은 조각은 지운다
  - 선수만 남게 자르고 키를 H 픽셀로 맞춘다(남자 그림 title_man.webp 와 같은 높이)
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
JOBS = [('wtitle_man.jpg', 'title_woman.webp'), ('wtitle_pitcher.jpg', 'title_wpitcher.webp')]
H = 736

for src, dst in JOBS:
    a = np.asarray(Image.open(os.path.join(ROOT, 'raw', src)).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    edge = np.concatenate([d[:8].ravel(), d[-8:].ravel(), d[:, :8].ravel(), d[:, -8:].ravel()])
    t0, t1 = 18.0, float(np.median(edge)) * 0.55
    A = np.clip((t1 - d) / (t1 - t0), 0, 1)
    a[..., 1] = np.minimum(g, np.maximum(r, b))            # 가장자리에 묻은 초록빛 걷어 내기
    # 가장 큰 덩어리(선수) 둘레만 남긴다: 흐리게 한 뒤 선수와 이어진 곳만
    solid = Image.fromarray(((A > 0.5) * 255).astype(np.uint8))
    near = np.asarray(solid.filter(ImageFilter.MaxFilter(15))) > 0
    A = np.where(near, A, 0)
    A = np.where(A < 0.16, 0, A)
    im = Image.fromarray(np.dstack([a, A * 255]).round().astype(np.uint8), 'RGBA')
    im = im.crop(im.getbbox())
    im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'ui', dst), quality=92, method=6)
    print(dst, im.size)
