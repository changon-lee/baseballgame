"""정지 자세 그림(수비수·주자)의 파란 소매·양말·벨트를 흰색으로 바꾼다(신발도 흰색). 모자·헬멧(파랑)은 그대로.
새 달리기 영상(흰 유니폼 + 파란 모자·헬멧 + 검은 신발)과 옷을 맞추려는 것.

사용법: python -I tools/whiten_stills.py <원본 폴더(assets/sprites를 복사해 둔 곳)> [결과 폴더(기본 assets/sprites)]
  원본은 늘 처음 그림에서: 이미 바꾼 그림을 다시 넣으면 안 된다(git에서 꺼내 쓴다)
모자·헬멧 찾기: 파란 덩어리 가운데 머리 위치(HX: sprites.js FIELD의 hx)에 가깝고 둥글게 꽉 찬 것
"""
import os, sys, colorsys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
CAP_AT = {'fielder_2': (56, 62), 'fthrow_2': (128, 18), 'rbase_2': (22, 22)}   # 자동으로 못 찾는 그림: 모자·헬멧 대략 위치(x, y)
# None = 머리 위치를 그림 맨 윗부분에서 찾는다(서서 달리는 그림). runner_diagb: 새 영상이 뒷모습이 아니라서 예전 그림을 흰 옷으로 바꿔 쓴다
HX = {'runner_diagb': [None] * 8, 'fielder': [95, 88, 64, 52], 'fthrow': [153, 133, 165, 238], 'rbase': [44, 158, 73, 239], 'fstretch': [146], 'fback': [58, 43, 69]}

for name, hxs in HX.items():
    for i, hx in enumerate(hxs):
        if not os.path.exists(os.path.join(SRC, f'{name}_{i}.webp')): continue
        im = Image.open(os.path.join(SRC, f'{name}_{i}.webp')).convert('RGBA')
        a = np.asarray(im).astype(np.float32); r, g, b, al = a[..., 0] / 255, a[..., 1] / 255, a[..., 2] / 255, a[..., 3]
        mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
        if hx is None: ys0, xs0 = np.nonzero(al > 128); hx = xs0[ys0 < ys0.min() + (ys0.max() - ys0.min()) * 0.1].mean()
        blue = (b >= mx - 1e-6) & (b > r * 1.25) & (sat > 0.28) & (al > 8)      # 파랑 계열(남색 신발 포함)
        lab, n = ndimage.label(ndimage.binary_closing(blue, iterations=2))
        h, w = blue.shape
        best, cap = -1, None
        for k in range(1, n + 1):
            m = lab == k; area = m.sum()
            if area < h * w * 0.004: continue
            ys, xs = np.nonzero(m); bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
            fill = area / (bw * bh); near = abs(xs.mean() - hx) / max(w, h)
            bright = mx[m].mean()
            score = fill * (1 - min(1, near * 4)) * (1 if 0.5 < bw / bh < 2.4 else 0.3) * (0.4 + bright)
            at = CAP_AT.get(f'{name}_{i}')
            if at: score = -np.hypot(xs.mean() - at[0], ys.mean() - at[1])
            if cap is None or score > best: best, cap = score, m
        keep = ndimage.binary_dilation(cap, iterations=3) if cap is not None else np.zeros_like(blue)
        ch = blue & ~keep
        ch = ndimage.binary_dilation(ch, iterations=1) & (al > 8) & ~keep & (sat > 0.12) & (b >= r)   # 가장자리의 옅은 파랑까지
        out = a.copy()
        v = mx
        shoe = np.zeros_like(ch)                                           # 신발도 흰색으로(어두운 남색만 골라내면 소매·양말의 그늘까지 검게 얼룩진다)
        cloth = ch & ~shoe
        # 옷: 파랑의 밝기 변화를 살려 흰 천으로(가장 밝은 파랑 = 흰색)
        if cloth.any():
            top = np.percentile(v[cloth], 92)
            sh = np.clip(v / max(top, 1e-3), 0, 1) ** 0.55
            for c, base in enumerate((244, 245, 248)): out[..., c] = np.where(cloth, base * (0.62 + 0.38 * sh), out[..., c])
        for c in range(3): out[..., c] = np.where(shoe, 38 + v * 60, out[..., c])
        Image.fromarray(out.astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{name}_{i}.webp'), 'WEBP', quality=90, method=6)
        print(name, i, 'cap' if cap is not None else 'NO CAP', int(cloth.sum()), int(shoe.sum()))
