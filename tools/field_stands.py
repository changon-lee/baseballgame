"""타구 화면 관중석 그림(assets/raw/field*.jpg, 1728×1152)을 게임 배치(1152×731)에 맞춰 자른다.

사용법: python -I tools/field_stands.py
  - 게임(field3d.js)은 그림의 0~675줄을 관중석 경사면에 입히고(ROW), 510~670줄(아래층 관중)을 가까운 관중석 무늬로 쓴다
  - 원본: 조명탑 꼭대기 320, 지붕 440~530, 위층 560~770, 통로 770~850, 아래층 850~1085, 펜스 1085~
  - 140~1085줄을 0~675줄로(아래층이 507~675줄에 온다), 나머지 펜스를 675~731줄로 옮긴다
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets')
TOP, WALL, W, ROW, H = 140, 1085, 1152, 675, 731
for s in ('', '_dusk', '_night'):
    im = Image.open(os.path.join(ROOT, 'raw', f'field{s}.jpg')).convert('RGB')
    out = Image.new('RGB', (W, H))
    out.paste(im.crop((0, TOP, im.width, WALL)).resize((W, ROW), Image.LANCZOS), (0, 0))
    out.paste(im.crop((0, WALL, im.width, im.height)).resize((W, H - ROW), Image.LANCZOS), (0, ROW))
    out.save(os.path.join(ROOT, 'stadium', f'field{s}.webp'), quality=86, method=6)
    print('field' + s, out.size)
