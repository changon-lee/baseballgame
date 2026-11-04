"""그림 조각(분할된 PNG)을 게임용 스프라이트(WebP)로 만든다.

사용법: python -I tools/build_sprites.py <압축 푼 폴더>
  <폴더>/pitcher_back/baseball-pitcher/*.png, pitcher_front/baseball-player/*.png,
  batter_side/baseball-player/*.png, catcher/baseball-catcher/baseball-catcher-1.png, ump/umpire.png
결과: assets/sprites/<이름>.webp + assets/sprites/sprites.json (크기, 발 기준점)
  - 투명 구멍(분할 도구가 뚫은 구멍)은 주변 색으로 메운다
  - 반투명 가장자리는 정리한다
"""
import json, os, sys
from collections import deque
from PIL import Image, ImageFilter

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
os.makedirs(OUT, exist_ok=True)

# 이름: (파일, 동작) — 조각 번호는 분할 도구가 매긴 순서라 동작 순서와 다르다
SETS = {
    'pitcher_back': ['pitcher_back/baseball-pitcher/baseball-pitcher-%d.png' % i for i in (2, 3, 1, 5, 4)],   # SET LIFT COCK RELEASE FOLLOW
    'pitcher_front': ['pitcher_front/baseball-player/baseball-player-%d.png' % i for i in (1, 4, 5)],         # SET LIFT RELEASE
    'batter': ['batter_side/baseball-player/baseball-player-%d.png' % i for i in (1, 3, 4)],                  # STANCE SWING CONTACT (모두 왼쪽=투수 쪽을 보게)
    'catcher': ['catcher/baseball-catcher/baseball-catcher-1.png'],
    'umpire': ['ump/umpire.png'],
}


MAX_HOLE = 2500          # 이보다 작은 구멍만 메운다(분할 도구가 뚫은 구멍)
BIG_FILL = {('pitcher_front', 0)}   # 글러브 속이 통째로 뚫린 그림: 큰 구멍도 메운다
FLIP = {('batter', 0)}   # 첫 타격 동작만 오른쪽을 보고 있어서 뒤집는다


def fill_holes(im, max_hole):
    """테두리와 이어지지 않은 투명 픽셀(=몸 안의 구멍)을 이웃 색으로 메운다."""
    w, h = im.size
    px = im.load()
    a = [[px[x, y][3] for x in range(w)] for y in range(h)]
    outside = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if a[y][x] < 128 and not outside[y][x]: outside[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if a[y][x] < 128 and not outside[y][x]: outside[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and a[ny][nx] < 128:
                outside[ny][nx] = True; q.append((nx, ny))
    holes = {(x, y) for y in range(h) for x in range(w) if a[y][x] < 128 and not outside[y][x]}
    # 큰 구멍(팔과 몸 사이 같은 진짜 빈 공간)은 그대로 둔다: 덩어리별로 크기를 잰다
    seen, small = set(), set()
    for p0 in holes:
        if p0 in seen: continue
        comp, q = [p0], deque([p0]); seen.add(p0)
        while q:
            x, y = q.popleft()
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in holes and n not in seen: seen.add(n); comp.append(n); q.append(n)
        if len(comp) <= max_hole: small.update(comp)
    holes = small
    filled = 0
    while holes:
        done = []
        for (x, y) in holes:
            cs = [px[nx, ny] for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
                  if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in holes and px[nx, ny][3] >= 128]
            if cs:
                done.append(((x, y), tuple(sum(c[i] for c in cs) // len(cs) for i in range(3)) + (255,)))
        if not done: break
        for (p, c) in done:
            px[p] = c; holes.discard(p); filled += 1
    return filled


def clean_edges(im):
    """반투명 가장자리의 배경 번짐을 줄인다: 알파를 살짝 깎고 부드럽게."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 40 else v)
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    return Image.merge('RGBA', (r, g, b, a))


meta = {}
for name, files in SETS.items():
    frames = []
    for i, f in enumerate(files):
        im = Image.open(os.path.join(SRC, f)).convert('RGBA')
        if (name, i) in FLIP: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        n = fill_holes(im, 10**9 if (name, i) in BIG_FILL else MAX_HOLE)
        im = clean_edges(im)
        im = im.crop(im.getchannel('A').getbbox())
        out = f'{name}_{i}.webp'
        im.save(os.path.join(OUT, out), 'WEBP', quality=88, method=6)
        # 발 기준점: 맨 아래 8% 줄에 있는 불투명 픽셀의 가로 중심
        w, h = im.size
        A = im.getchannel('A').load()
        xs = [x for y in range(int(h * 0.92), h) for x in range(w) if A[x, y] > 128]
        ax = (min(xs) + max(xs)) / 2 if xs else w / 2
        frames.append({'src': out, 'w': w, 'h': h, 'ax': round(ax, 1), 'ay': h})
        print(name, i, f, (w, h), 'holes filled', n, 'size', os.path.getsize(os.path.join(OUT, out)))
    meta[name] = frames
with open(os.path.join(OUT, 'sprites.auto.json'), 'w', encoding='utf-8') as fp:
    json.dump(meta, fp, ensure_ascii=False, indent=1)
