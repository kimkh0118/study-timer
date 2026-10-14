"""GPT 그림의 밝은 바닥 그림자(발밑 타원)를 은은한 어두운 그림자로 바꿔요.
밝은 배경에서는 그대로 그림자처럼, 어두운 화면(도감·농장)에서는 흰 얼룩이 안 생기게.
사용: python3 tools/tama_shadow.py   (tama-pack/art/*.png 전부)"""
import os, glob
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "tama-pack", "art")
for p in sorted(glob.glob(os.path.join(ROOT, "*.png"))):
    im = Image.open(p).convert("RGBA")
    a = np.array(im).astype(int)
    rgb, al = a[..., :3], a[..., 3]
    vis = al > 20
    ys = np.where(vis.any(axis=1))[0]
    if not len(ys): continue
    top, bot = ys[0], ys[-1]
    band_from = bot - int((bot - top) * 0.22)
    light = vis & (rgb.min(axis=2) >= 188) & (rgb.max(axis=2) - rgb.min(axis=2) <= 45)
    light[:band_from] = False
    lab, n = ndimage.label(light)
    if n == 0: continue
    # 그림 맨 아래 가장자리에 닿은 밝은 덩어리만 그림자로 봐요(배 · 눈 반짝임은 안 건드려요)
    sl = ndimage.find_objects(lab)
    keep = [i + 1 for i, q in enumerate(sl) if q is not None and q[0].stop - 1 >= bot - 10]
    m = np.isin(lab, keep)
    if not m.any(): continue
    luma = rgb[m].mean(axis=1)
    a[m, 0], a[m, 1], a[m, 2] = 70, 50, 40
    a[m, 3] = np.clip((al[m] * 0.32) * np.clip((262 - luma) / 40, 0.6, 1.2), 0, 255).astype(int)
    Image.fromarray(a.astype("uint8"), "RGBA").save(p, optimize=True)
