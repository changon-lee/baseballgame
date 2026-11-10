"""뒷모습 타자 헬멧·투수 모자 자리(팀 색 칠할 곳)를 프레임마다 찾아 JSON으로 낸다(sprites.js의 frame.cap에 옮긴다).

사용법: python -I tools/cap_boxes.py [미리보기 png]
  - 타자(batter_back, batter_back_idle): 흰 헬멧 = 가장 위쪽의 밝고 색 없는 덩어리(검은 방망이는 빠진다)
  - 투수(pitcher_back): 회색 모자 = 맨 위쪽의 회색(밝기 중간, 색 없음) 덩어리. 손에 든 흰 공·살색 손은 빠진다
  - 상자는 덩어리를 감싸는 사각형(조금 넓힘). 칠하는 건 실행 중에 상자 안의 같은 색 픽셀만
"""
import json, os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageDraw

D = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')


def hsv(a):
    mx = a[..., :3].max(axis=2); mn = a[..., :3].min(axis=2)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0), mx / 255


def blob(mask, seed_rows):
    """seed_rows(위쪽 몇 줄) 안에서 시작하는 가장 큰 연결 덩어리"""
    h, w = mask.shape; seen = np.zeros_like(mask); best = []
    for y0, x0 in zip(*np.nonzero(mask[:seed_rows])):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) > len(best): best = pts
    return best


def box(name, i, kind):
    im = Image.open(os.path.join(D, f'{name}_{i}.webp')).convert('RGBA'); a = np.asarray(im).astype(np.float32)
    s, v = hsv(a); op = a[..., 3] > 128
    k = im.height / 663                                     # 대기 동작 그림은 0.7배로 저장돼 있다
    if kind == 'cap':
        m = op & (s < 0.14) & (v > 0.3) & (v < 0.78)
        ys = np.nonzero(op.any(axis=1))[0]; H = ys[-1] - ys[0]
        pts = blob(m, int(ys[0] + H * 0.3))
        if len(pts) < 60: return None
        yy, xx = zip(*pts); y0, y1, x0, x1 = min(yy), max(yy), min(xx), max(xx)
        if y1 - y0 > H * 0.16 or x1 - x0 > H * 0.2: return None
    else:
        # 흰 헬멧은 흰 셔츠와 붙어 있어서 덩어리로 못 가른다: 맨 위 흰 부분(헬멧 꼭대기)에서 아래로 내려가며
        # 헬멧 아래 머리카락·목(흰색이 갑자기 줄어드는 줄)에서 끊는다. 헬멧 지름은 약 80픽셀(대기 그림은 0.7배)
        m = op & (s < 0.16) & (v > 0.55)
        # 방망이의 밝은 반사는 가늘다: 흰 부분이 가로로 길게(헬멧 폭의 1/3 이상) 이어진 줄부터 헬멧으로 본다
        def runs(row):
            xs = np.nonzero(row)[0]
            if not len(xs): return []
            cut = np.nonzero(np.diff(xs) > 2)[0]
            return [(xs[a], xs[b]) for a, b in zip(np.r_[0, cut + 1], np.r_[cut, len(xs) - 1])]
        top = None
        for r in range(m.shape[0]):
            rs = [q for q in runs(m[r]) if q[1] - q[0] >= 24 * k]
            if rs: top = r; break
        if top is None: return None
        # 헬멧(둥근 지붕)을 줄마다 따라 내려간다: 앞 줄 구간과 겹치는 흰 구간(방망이가 가로질러 끊긴 틈은 이어 붙인다).
        # 가장 넓은 줄의 폭 = 헬멧 지름, 높이는 지름의 0.86배(아래 목·깃은 빼고)
        def merged(row):
            out = []
            for q in runs(row):
                if out and q[0] - out[-1][1] <= 20 * k: out[-1] = (out[-1][0], q[1])
                else: out.append(q)
            return out
        cur = max(merged(m[top]), key=lambda q: q[1] - q[0]); best = cur
        for r in range(top + 1, min(m.shape[0], top + int(48 * k))):
            cand = [q for q in merged(m[r]) if q[0] <= cur[1] + 4 and q[1] >= cur[0] - 4]
            if not cand: break
            cur = max(cand, key=lambda q: q[1] - q[0])
            if cur[1] - cur[0] > 115 * k: break                    # 셔츠(어깨)까지 넓어지면 멈춘다
            if cur[1] - cur[0] > best[1] - best[0]: best = cur
        W = best[1] - best[0]; cx = (best[0] + best[1]) / 2
        x0, x1 = int(cx - W / 2), int(cx + W / 2); y0 = top; y1 = int(top + W * 0.86)
    p = 3
    return [int(max(0, x0 - p)), int(max(0, y0 - p)), int(min(im.width, x1 + p + 1)), int(min(im.height, y1 + p))]


out = {}; prev = []
for name, n, kind in [('batter_back', 29, 'helmet'), ('batter_back_idle', 24, 'helmet'), ('pitcher_back', 25, 'cap')]:
    out[name] = [box(name, i, kind) for i in range(n)]
    for i, b in enumerate(out[name]):
        im = Image.open(os.path.join(D, f'{name}_{i}.webp')).convert('RGBA')
        bg = Image.new('RGBA', im.size, (60, 140, 70, 255)); bg.alpha_composite(im)
        if b: ImageDraw.Draw(bg).rectangle(b, outline=(255, 0, 0, 255), width=3)
        else: ImageDraw.Draw(bg).rectangle((0, 0, im.width - 1, im.height - 1), outline=(255, 255, 0, 255), width=6)
        prev.append(bg.resize((round(bg.width * 160 / bg.height), 160)))
print(json.dumps(out))
if len(sys.argv) > 1:
    cols = 13; rows = (len(prev) + cols - 1) // cols; cw = max(p.width for p in prev)
    sheet = Image.new('RGBA', (cols * cw, rows * 160), (20, 20, 20, 255))
    for k, p in enumerate(prev): sheet.alpha_composite(p, ((k % cols) * cw, (k // cols) * 160))
    sheet.save(sys.argv[1])
