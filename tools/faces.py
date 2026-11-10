"""메인 화면 동그란 얼굴: 3x3 격자 사진(초록 배경)을 9칸으로 잘라 배경을 빼고 정사각형 WebP로 저장한다.

사용법: python -I tools/faces.py <투수 격자 그림> <타자 격자 그림>
결과: assets/faces/p_0~8.webp, b_0~8.webp (192x192, 배경 투명. 동그라미 색은 CSS가 깐다)
  - 칸 경계는 흰 줄(거의 흰색인 행·열)로 찾는다. 줄이 안 보이면 3등분
  - 얼굴 위치: 칸마다 사람(초록이 아닌 부분)의 위쪽 끝(모자·헬멧 꼭대기)과 위쪽 60%의 가로 가운데
"""
import os, sys
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'faces')
SIZE = 192


def cuts(white, n):
    """흰 줄 위치로 n칸 경계를 찾는다(못 찾으면 등분)"""
    L = len(white); bounds = [0]
    for k in range(1, n):
        c = L * k // n; lo, hi = c - L // 12, c + L // 12
        idx = [i for i in range(lo, hi) if white[i]]
        bounds.append((idx[0] + idx[-1]) // 2 if idx else c)
    return bounds + [L]


def alpha(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    A = np.clip((70 - d) / (70 - 25), 0, 1)
    a = a.copy(); a[..., 1] = np.minimum(g, np.maximum(r, b))   # 초록 번짐 걷기
    return a, A


def run(path, kind):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    wh = a.min(axis=2) > 225
    xs = cuts(wh.mean(axis=0) > 0.6, 3); ys = cuts(wh.mean(axis=1) > 0.6, 3)
    i = 0
    for r in range(3):
        for c in range(3):
            cell = a[ys[r] + 4: ys[r + 1] - 4, xs[c] + 4: xs[c + 1] - 4]
            rgb, A = alpha(cell)
            A[cell.min(axis=2) > 225] = 0                    # 남은 흰 줄
            H, W = A.shape
            rows = np.nonzero((A > 0.5).sum(axis=1) > W * 0.02)[0]
            top = rows[0] if len(rows) else 0
            up = A[: int(H * 0.6)] > 0.5
            cx = int(np.nonzero(up.any(axis=0))[0].mean()) if up.any() else W // 2
            s = int(H * 0.9); y0 = max(0, top - int(H * 0.08)); x0 = min(max(0, cx - s // 2), W - s)
            im = Image.fromarray(np.dstack([rgb, A * 255]).round().astype(np.uint8), 'RGBA').crop((x0, y0, x0 + s, y0 + s))
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
            im.save(os.path.join(OUT, f'{kind}_{i}.webp'), 'WEBP', quality=85, method=6)
            i += 1
    print(kind, 'cells', xs, ys)


os.makedirs(OUT, exist_ok=True)
run(sys.argv[1], 'p'); run(sys.argv[2], 'b')
