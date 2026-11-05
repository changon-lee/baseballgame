"""수비수 그림 조각에서 떨어져 나간 장갑을 다시 붙인다. build_sprites.py 전에 돌린다.

사용법: python -I tools/fix_fielders.py <압축 푼 폴더>
  <폴더>/fielder_A, fielder_run, fielder_throw (zip을 각각 같은 이름 폴더에 푼 것)
결과: <폴더>/fixed/fielderA-1..4.png, throw-1..4.png
  - fielder_A: 분할 도구가 남긴 배경(gray-background.png)의 구멍 모양으로 선수·장갑 조각의 원래 자리를 찾아 합친다
  - fielder_throw: 3(던질 준비)·4(다이빙)는 장갑이 없어서 다른 그림의 장갑을 손에 붙인다
"""
import glob, os, shutil, sys
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(SRC, 'fixed')
os.makedirs(OUT, exist_ok=True)


def place(alpha, target_fft, shape):
    """alpha 모양이 구멍(target)에 가장 잘 맞는 왼쪽 위 좌표와 맞은 비율."""
    P = (alpha >= 128).astype(np.float32)
    k = np.zeros(shape, np.float32); k[:P.shape[0], :P.shape[1]] = P
    c = np.fft.irfft2(target_fft * np.conj(np.fft.rfft2(k)), s=shape)
    c[shape[0] - P.shape[0] + 1:, :] = -1e9; c[:, shape[1] - P.shape[1] + 1:] = -1e9
    y, x = np.unravel_index(np.argmax(c), c.shape)
    return int(x), int(y), float(c[y, x]) / P.sum()


# ── fielder_A: 정면 4동작 ──
D = os.path.join(SRC, 'fielder_A')
hole = (np.array(Image.open(os.path.join(D, 'gray-background.png')).getchannel('A')) < 128).astype(np.float32)
F = np.fft.rfft2(2 * hole - 1)
covered = np.zeros_like(hole); players = []
for f in sorted(glob.glob(os.path.join(D, 'baseball-player', '*.png'))):
    im = Image.open(f).convert('RGBA'); x, y, s = place(np.array(im.getchannel('A')), F, hole.shape)
    print('player', os.path.basename(f), x, y, round(s, 3)); players.append((x, y, im))
    a = np.array(im.getchannel('A')) >= 64
    covered[y:y + a.shape[0], x:x + a.shape[1]] = np.maximum(covered[y:y + a.shape[0], x:x + a.shape[1]], a)
rest = hole * (1 - covered)                      # 선수 조각으로 안 메워진 구멍 = 장갑 자리
gloves, left = [], [Image.open(f).convert('RGBA') for f in sorted(glob.glob(os.path.join(D, 'brown-baseball-glove', '*.png')))]
while left:                                      # 가장 잘 맞는(큰) 장갑부터 하나씩 자리를 차지한다
    FR = np.fft.rfft2(2 * rest - 1)
    (x, y, s), im = max(((place(np.array(g.getchannel('A')), FR, hole.shape), g) for g in left), key=lambda r: r[0][2] * np.sqrt(r[1].width * r[1].height))
    left.remove(im); gloves.append((x, y, im)); print('glove', x, y, round(s, 3))
    a = np.array(im.getchannel('A')) >= 64; rest[y:y + a.shape[0], x:x + a.shape[1]] *= ~a
for i, (x, y, im) in enumerate(players):
    mine = [g for g in gloves if x - 60 < g[0] + g[2].width / 2 < x + im.width + 60 and y - 120 < g[1] + g[2].height / 2 < y + im.height + 60]
    x0 = min([x] + [g[0] for g in mine]); y0 = min([y] + [g[1] for g in mine])
    x1 = max([x + im.width] + [g[0] + g[2].width for g in mine]); y1 = max([y + im.height] + [g[1] + g[2].height for g in mine])
    c = Image.new('RGBA', (x1 - x0, y1 - y0)); c.alpha_composite(im, (x - x0, y - y0))
    for g in mine: c.alpha_composite(g[2], (g[0] - x0, g[1] - y0))
    c.save(os.path.join(OUT, 'fielderA-%d.png' % (i + 1)))


# ── fielder_throw ──
def glove(path, rot, h):
    g = Image.open(path).convert('RGBA'); g = g.crop(g.getchannel('A').getbbox())
    g = g.rotate(rot, expand=True, resample=Image.BICUBIC); g = g.crop(g.getchannel('A').getbbox())
    return g.resize((round(g.width * h / g.height), h), Image.LANCZOS)


def paste(im, g, cx, cy):
    x, y = round(cx - g.width / 2), round(cy - g.height / 2)
    pl, pt = max(0, -x), max(0, -y)
    c = Image.new('RGBA', (im.width + pl, im.height + pt)); c.alpha_composite(im, (pl, pt))
    c.alpha_composite(g, (x + pl, y + pt)); return c


T = os.path.join(SRC, 'fielder_throw', 'baseball-player', 'baseball-player-%d.png')
for i in (1, 2): shutil.copy(T % i, os.path.join(OUT, 'throw-%d.png' % i))
im = Image.open(T % 3).convert('RGBA'); px = im.load()
for y in range(im.height):
    for x in range(78):
        r, g, b, a = px[x, y]
        if a and r > b + 20 and max(r, g, b) < 185: px[x, y] = (0, 0, 0, 0)   # 떨어져 나간 장갑 부스러기(살색은 남긴다)
paste(im, glove(os.path.join(SRC, 'fielder_run', 'baseball-glove', 'baseball-glove-1.png'), -20, 86), 40, 100).save(os.path.join(OUT, 'throw-3.png'))
im = Image.open(T % 4).convert('RGBA')
paste(im, glove(os.path.join(D, 'brown-baseball-glove', 'brown-baseball-glove-2.png'), 75, 78), 32, 64).save(os.path.join(OUT, 'throw-4.png'))
print('fixed ->', OUT)
