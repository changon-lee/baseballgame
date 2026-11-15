"""메인 화면 동그란 얼굴: 3x3 격자 사진(초록 배경)을 9칸으로 잘라 배경을 빼고 정사각형 WebP로 저장한다.

사용법: python -I tools/faces.py <투수 격자 그림> <타자 격자 그림> [앞글자]
결과: assets/faces/p_0~8.webp, b_0~8.webp (192x192, 배경 투명. 동그라미 색은 CSS가 깐다)
  앞글자를 주면 그걸 붙여서 저장(예: w → wp_0~8, wb_0~8 = 육성모드 커스텀 선수용 여성 얼굴)
  - 칸 경계는 흰 줄(거의 흰색인 행·열)로 찾는다. 줄이 안 보이면 3등분
  - 얼굴 위치: 칸마다 사람(초록이 아닌 부분)의 위쪽 끝(모자·헬멧 꼭대기)과 위쪽 60%의 가로 가운데
"""
import os, sys
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'faces')
SIZE = 192
# 앞글자를 줘서 만드는 얼굴(여성 등)은 기존 얼굴과 머리 크기를 맞춘다: 192px 안에서 헬멧·모자 폭(기존 b_·p_ 평균)
HEAD = {'b': 110, 'p': 94}      # (자르는 곳에서 재는 폭은 귀 덮개까지 들어가 조금 넓게 나와서, 결과가 b 116 · p 101 이 되게 맞춘 값)


def cuts(white, n):
    """흰 줄 위치로 n칸 경계를 찾는다(못 찾으면 등분)"""
    L = len(white); bounds = [0]
    for k in range(1, n):
        c = L * k // n; lo, hi = c - L // 12, c + L // 12
        idx = [i for i in range(lo, hi) if white[i]]
        bounds.append((idx[0] + idx[-1]) // 2 if idx else c)
    return bounds + [L]


def row_cuts(white, green, n):
    """가로 줄: 흰 줄 바로 아래가 초록 배경(다음 칸 위쪽)인 곳. 유니폼이 칸 끝까지 닿아 흰 줄과 붙어 있어도 찾는다"""
    L = len(white); bounds = [0]
    for k in range(1, n):
        c = L * k // n; lo, hi = c - L // 12, c + L // 12
        idx = [i for i in range(lo, hi) if white[i] and i + 4 < L and green[i + 4] > 0.4]
        bounds.append(idx[-1] - 2 if idx else c)
    return bounds + [L]


def alpha(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    A = np.clip((70 - d) / (70 - 25), 0, 1)
    a = a.copy(); a[..., 1] = np.minimum(g, np.maximum(r, b))   # 초록 번짐 걷기
    return a, A


def run(path, kind, prefix=''):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    wh = a.min(axis=2) > 225
    gr = (a[..., 1] - np.maximum(a[..., 0], a[..., 2])) > 40
    xs = cuts(wh.mean(axis=0) > 0.6, 3); ys = row_cuts(wh.mean(axis=1) > 0.6, gr.mean(axis=1), 3)
    i = 0
    for r in range(3):
        for c in range(3):
            cell = a[ys[r] + 4: ys[r + 1] - 4, xs[c] + 4: xs[c + 1] - 4]
            rgb, A = alpha(cell)
            edge = np.zeros(A.shape, bool); edge[:10] = edge[-10:] = True; edge[:, :10] = edge[:, -10:] = True
            A[edge & (cell.min(axis=2) > 225)] = 0           # 가장자리에 남은 흰 줄만(흰 유니폼은 그대로)
            H, W = A.shape
            rows = np.nonzero((A > 0.5).sum(axis=1) > W * 0.02)[0]
            top = rows[0] if len(rows) else 0
            up = A[: int(H * 0.6)] > 0.5
            cx = int(np.nonzero(up.any(axis=0))[0].mean()) if up.any() else W // 2
            s = int(H * 0.9); y0 = max(0, top - int(H * 0.08))
            if prefix:                                       # 머리 폭이 HEAD[kind]가 되게 자르는 크기를 정한다
                band = A[top: top + int(H * 0.15)] > 0.5
                hw = max((np.nonzero(r)[0].ptp() if r.any() else 0) for r in band)
                s = min(H, W, int(hw * SIZE / HEAD[kind])); y0 = max(0, top - int(s * 0.015))
            x0 = min(max(0, cx - s // 2), W - s)
            im = Image.fromarray(np.dstack([rgb, A * 255]).round().astype(np.uint8), 'RGBA').crop((x0, y0, x0 + s, y0 + s))
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
            im.save(os.path.join(OUT, f'{prefix}{kind}_{i}.webp'), 'WEBP', quality=85, method=6)
            i += 1
    print(kind, 'cells', xs, ys)


os.makedirs(OUT, exist_ok=True)
pre = sys.argv[3] if len(sys.argv) > 3 else ''
run(sys.argv[1], 'p', pre); run(sys.argv[2], 'b', pre)
