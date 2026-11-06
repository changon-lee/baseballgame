"""포수 영상(mp4): 쪼그려 앉아 미트를 스트라이크존 여기저기로 옮기는 영상에서, 미트 위치가 고르게 퍼지도록 프레임을 골라 포수 스프라이트(WebP)로 만든다.

사용법: python -I tools/video_catcher.py <영상 폴더(assets/raw)> <작업 폴더>
필요: pip install imageio-ffmpeg "rembg[cpu]" scipy
결과: assets/sprites/catcher_*.webp, 마지막 줄에 JSON(sprites.js의 SETS.catcher에 옮긴다)
  1) 모든 프레임에서 미트(갈색 가죽 중 가장 큰 덩어리)의 가운데를 찾는다(배경이 회색 한 가지라 원본 그대로 색으로 찾는다)
  2) 첫 프레임(가운데 자세)부터, 이미 고른 프레임들과 미트가 가장 멀리 떨어진 프레임을 하나씩 더한다(MIN_GAP 픽셀보다 가까워지면 그만)
  3) 배경을 지우고 RES배로 줄여 저장. 기준점 = 첫 프레임의 두 발 가운데, mitt = 미트 가운데(그림 좌표)
"""
import glob, json, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage
import imageio_ffmpeg
from rembg import remove, new_session

SRC, WORK = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites')
NAME = 'catcher_mitt'
RES = 0.5
MIN_GAP, MAX_N = 34, 44


def mitt_at(path):
    P = np.asarray(Image.open(path).convert('RGB')).astype(int); r, g, b = P[..., 0], P[..., 1], P[..., 2]
    m = (r - b > 45) & (r > g + 12) & (r < 200) & (g < 150)          # 갈색 가죽(살색보다 어둡고 진하다)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1)); k = int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(lab == k)
    return float(xs.mean()), float(ys.mean())


d = os.path.join(WORK, NAME); os.makedirs(d, exist_ok=True)
if not glob.glob(os.path.join(d, 'f*.png')):
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-loglevel', 'error', '-i', os.path.join(SRC, NAME + '.mp4'), os.path.join(d, 'f%03d.png')], check=True)
fs = sorted(glob.glob(os.path.join(d, 'f*.png')))
M = np.array([mitt_at(f) for f in fs])
pick = [0]
while len(pick) < MAX_N:
    dist = np.min(np.linalg.norm(M[:, None, :] - M[pick][None, :, :], axis=2), axis=1)
    j = int(np.argmax(dist))
    if dist[j] < MIN_GAP: break
    pick.append(j)
print('picked', len(pick), [i + 1 for i in pick], flush=True)
session = new_session('isnet-general-use')
cuts = []
for i in pick:
    im = remove(Image.open(fs[i]).convert('RGB'), session=session)
    a = np.asarray(im.getchannel('A')).copy(); a[a < 40] = 0
    lab, n = ndimage.label(a > 128)                                # 몸에서 떨어진 작은 조각(그림자 등)은 지운다
    if n > 1:
        sizes = ndimage.sum(a > 128, lab, range(1, n + 1))
        keep = np.isin(lab, [k + 1 for k, s in enumerate(sizes) if s >= sizes.max() * 0.02])
        a[~ndimage.binary_dilation(keep, iterations=4)] = 0
    im.putalpha(Image.fromarray(a))
    cuts.append(im)
# 기준점: 첫 프레임의 두 발(아래 5% 줄 가운데), 키(h0) = 첫 프레임 헬멧 꼭대기 ~ 발
A0 = np.asarray(cuts[0].getchannel('A')) > 128
ys, xs = np.nonzero(A0); y1, top = ys.max(), ys.min()
foot = xs[ys > y1 - (y1 - top) * 0.05]
ox, oy = (foot.min() + foot.max()) / 2, y1 + 1
frames = []
for j, (i, im) in enumerate(zip(pick, cuts)):
    x0, y0, x1, y1b = im.getbbox()
    c = im.crop((x0, y0, x1, y1b)); w, h = round(c.width * RES), round(c.height * RES)
    c = c.resize((w, h), Image.LANCZOS)
    c.save(os.path.join(OUT, f'catcher_{j}.webp'), 'WEBP', quality=72, method=6)
    frames.append({'w': w, 'h': h, 'ax': round((ox - x0) * RES), 'ay': round((oy - y0) * RES),
                   'mitt': [round((M[i][0] - x0) * RES), round((M[i][1] - y0) * RES)]})
    print(j, i + 1, frames[-1], os.path.getsize(os.path.join(OUT, f'catcher_{j}.webp')), flush=True)
print(json.dumps({'h0': round((oy - top) * RES), 'frames': frames}))
