"""그림 조각(분할된 PNG)을 게임용 스프라이트(WebP)로 만든다.

사용법: python -I tools/build_sprites.py <압축 푼 폴더>
  <폴더>/pitcher_back/baseball-pitcher/*.png, pitcher_front/baseball-player/*.png,
  (pitcher_front2 = catcher_front.zip을 푼 것, *_mid = 중간 동작 zip, pitcher_seq_A/B = 뒷모습 투구폼 8동작, pitcher_front_seq_A/B = 정면 8동작) batter_seq_A/B = 타자 스윙 8동작, catcher/baseball-catcher/baseball-catcher-1.png, ump/umpire.png
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
SA, SB = 'pitcher_seq_A/baseball-player/baseball-player-%d.png', 'pitcher_seq_B/baseball-player/baseball-player-%d.png'
FA, FB = 'pitcher_front_seq_A/baseball-player/baseball-player-%d.png', 'pitcher_front_seq_B/baseball-player/baseball-player-%d.png'
BA, BB = 'batter_seq_A/baseball-player/baseball-player-%d.png', 'batter_seq_B/baseball-player/baseball-player-%d.png'
SETS = {
    # 뒷모습(카메라에서 멀어지며 던짐): 셋 → 다리 들기 시작 → 최고점 → 손 빼기 → 착지·팔 젖힘 → 가속 → 릴리스 → 팔로스루
    'pitcher_back': [SA % 2, SA % 3, SA % 1, SA % 4, SB % 1, SB % 3, SB % 4, SB % 2],
    # 정면(카메라 쪽으로 던짐): 셋 → 다리 들기 시작 → 최고점 → 손 빼기 → 착지·팔 젖힘 → 가속 → 릴리스 → 팔로스루
    'pitcher_front': [FA % 2, FA % 3, FA % 1, FA % 4, FB % 2, FB % 4, FB % 1, FB % 3],
    # 준비 → 다리 들기 → 내딛기 → 스윙 시작 → 임팩트 → 임팩트 직후 → 팔로스루 → 마무리 (모두 왼쪽=투수 쪽을 본다, 방망이는 코드로 그림)
    'batter': [BA % 2, BA % 4, BA % 1, BA % 3, BB % 1, BB % 4, BB % 2, BB % 3],
    'catcher': ['catcher/baseball-catcher/baseball-catcher-1.png'],
    'umpire': ['ump/umpire.png'],
}


MAX_HOLE = 2500          # 이보다 작은 구멍만 메운다(분할 도구가 뚫은 구멍)
BIG_FILL = {('pitcher_front', i) for i in (0, 2, 3, 5, 6)}   # 글러브 속이 통째로 뚫린 그림: 큰 구멍도 메운다
FLIP = {('pitcher_back', 4), ('pitcher_front', 2)}   # 반대 방향으로 그려진 그림은 뒤집는다(타자 준비, 투수 착지는 글러브 손이 반대)


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
        P = im.load(); top = im.getchannel('A').getbbox()[1]; cap = []
        for y in range(top, min(h, top + 45)):
            for x in range(w):
                r, g, b, al = P[x, y]
                if al > 128 and b > r + 25 and b > g + 10: cap.append(x)
        hx = sum(cap) / len(cap) if cap else ax
        frames.append({'src': out, 'w': w, 'h': h, 'ax': round(ax, 1), 'head': round(hx, 1), 'ay': h})
        print(name, i, f, (w, h), 'holes filled', n, 'size', os.path.getsize(os.path.join(OUT, out)))
    meta[name] = frames
with open(os.path.join(OUT, 'sprites.auto.json'), 'w', encoding='utf-8') as fp:
    json.dump(meta, fp, ensure_ascii=False, indent=1)


# ── 정면 투구: 분할 도구가 글러브를 떼어 간 그림에 다른 동작의 글러브를 붙인다 ──
GLOVE_FROM = ('pitcher_front', 5, (160, 145, 250, 268))     # 가슴 앞 글러브(잘라낸 그림 좌표)
GLOVE_TO = {3: (250, 190), 4: (305, 192), 6: (266, 218)}     # 붙일 곳(글러브 가운데)


def drop_specks(im, min_px=300):
    """몸에서 떨어진 작은 조각(분할 찌꺼기)을 지운다."""
    w, h = im.size
    A = im.getchannel('A').load()
    px = im.load()
    seen = set()
    for y0 in range(h):
        for x0 in range(w):
            if A[x0, y0] < 128 or (x0, y0) in seen: continue
            comp, q = [(x0, y0)], deque([(x0, y0)]); seen.add((x0, y0))
            while q:
                x, y = q.popleft()
                for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= n[0] < w and 0 <= n[1] < h and n not in seen and A[n] >= 128:
                        seen.add(n); comp.append(n); q.append(n)
            if len(comp) < min_px:
                for p in comp: px[p] = (0, 0, 0, 0)


name, si, (x0, y0, x1, y1) = GLOVE_FROM
src = Image.open(os.path.join(OUT, f'{name}_{si}.webp')).convert('RGBA').crop((x0, y0, x1, y1))
gp = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = gp[x, y]
        if a < 128 or not (r > b + 35 and r >= g): gp[x, y] = (0, 0, 0, 0)   # 갈색(글러브)·살색만 남긴다
for i, (cx, cy) in GLOVE_TO.items():
    path = os.path.join(OUT, f'{name}_{i}.webp')
    im = Image.open(path).convert('RGBA')
    im.alpha_composite(src, (cx - src.width // 2, cy - src.height // 2))
    fill_holes(im, 10**9)
    drop_specks(im)
    im.save(path, 'WEBP', quality=88, method=6)
    print('glove pasted', name, i)
im = Image.open(os.path.join(OUT, 'pitcher_front_7.webp')).convert('RGBA')
drop_specks(im); im.save(os.path.join(OUT, 'pitcher_front_7.webp'), 'WEBP', quality=88, method=6)
