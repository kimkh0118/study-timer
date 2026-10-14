"""GPT가 그린 그림을 앱용으로 다듬어요.
- 펫 시트(가로 3칸: 아기/아성체/성체): 흰 배경 지우기 → 3칸 나누기 → 칸마다 꼭 맞게 잘라 정사각형(아래 정렬) → 384px PNG
- ui 그림(초원 배경, 둥지 등): 크기만 맞추기 / 배경 지우기 옵션
사용: python3 tools/tama_art.py sheet raw/rex.png rex   →  tama-pack/art/rex_baby.png …
      python3 tools/tama_art.py ui raw/meadow.png ui/meadow.png --size 768 [--cut]
"""
import sys, os
from collections import deque
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "tama-pack")

def cut_white(im, tol_min=214, tol_spread=22):
    """테두리에서 이어진 흰(밝은 무채색) 배경만 투명하게. 그림 안쪽의 흰색(눈 반짝임, 배)은 남겨요."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    def bgish(p):
        r, g, b, a = p
        return min(r, g, b) >= tol_min and max(r, g, b) - min(r, g, b) <= tol_spread
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bgish(px[x, y]): q.append((x, y)); seen[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and bgish(px[x, y]): q.append((x, y)); seen[y * w + x] = 1
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and bgish(px[nx, ny]):
                seen[ny * w + nx] = 1; q.append((nx, ny))
    # 배경은 투명, 배경에 닿은 가장자리는 밝기에 따라 반투명(부드러운 외곽)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i]:
                px[x, y] = (255, 255, 255, 0)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            i = y * w + x
            if seen[i]: continue
            if seen[i - 1] or seen[i + 1] or seen[i - w] or seen[i + w]:
                r, g, b, a = px[x, y]
                light = min(r, g, b)
                if light > 170:
                    px[x, y] = (r, g, b, int(255 * max(0.25, (255 - light) / 85)))
    return im

def tight(im, pad_ratio=0.06):
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bb: return im
    c = im.crop(bb)
    w, h = c.size
    s = int(max(w, h) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.paste(c, ((s - w) // 2, s - h - int(s * pad_ratio * 0.6)), c)   # 아래 정렬
    return canvas

def split3(im):
    """연결된 덩어리들을 왼쪽/가운데/오른쪽 세 마리로 나눠요(꼬리가 옆 칸으로 넘어가도 안 잘려요)."""
    import numpy as np
    from scipy import ndimage
    a = np.array(im.getchannel("A")) > 24
    lab, n = ndimage.label(a)
    if n == 0: return [im] * 3
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    cents = ndimage.center_of_mass(a, lab, range(1, n + 1))
    w = im.size[0]
    # 큰 덩어리 3개를 몸통으로, 나머지는 가장 가까운 몸통에 붙여요
    order = sorted(range(n), key=lambda i: -sizes[i])
    bodies = sorted(order[:3], key=lambda i: cents[i][1]) if n >= 3 else None
    centers = [cents[i][1] for i in bodies] if bodies else [w / 6, w / 2, 5 * w / 6]
    groups = [[], [], []]
    for i in range(n):
        if sizes[i] < 30: continue
        k = min(range(3), key=lambda j: abs(cents[i][1] - centers[j]))
        groups[k].append(i + 1)
    arr = np.array(im)
    outs = []
    for g in groups:
        m = np.isin(lab, g)
        part = arr.copy(); part[~m] = 0
        outs.append(Image.fromarray(part, "RGBA"))
    return outs

def _labels(im, expected):
    """덩어리 라벨. 두 마리가 그림자·외곽선으로 살짝 붙어 덩어리 수가 모자라면,
    조금씩 깎아(erosion) 떨어뜨린 뒤 원래 픽셀을 가장 가까운 덩어리에 다시 돌려줘요."""
    import numpy as np
    from scipy import ndimage
    a = np.array(im.getchannel("A")) > 24
    lab, n = ndimage.label(a)
    def enough(lab, n):
        if n == 0: return True
        sizes = ndimage.sum(lab > 0, lab, range(1, n + 1))
        top = sorted(sizes, reverse=True)[:expected]
        floor = 0.12 * float(np.median(top))
        return sum(1 for x in sizes if x >= floor) >= expected
    if enough(lab, n): return lab, n
    for it in range(2, 30, 2):
        e = ndimage.binary_erosion(a, iterations=it)
        el, en = ndimage.label(e)
        if en and enough(el, en):
            _, (iy, ix) = ndimage.distance_transform_edt(el == 0, return_indices=True)
            full = el[iy, ix] * a
            return full, en
    return lab, n

def grid(src, ids, size=384):
    """3열 × N행 격자(행마다 한 종): 큰 덩어리 9개를 위→아래 3줄, 줄마다 왼→오 3칸으로 놓고
    작은 조각(떨어진 깃털·그림자)은 가장 가까운 몸통에 붙여요."""
    import numpy as np
    from scipy import ndimage
    rows = len(ids)
    im = cut_white(Image.open(src))
    lab, n = _labels(im, rows * 3)
    a = lab > 0
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    cents = ndimage.center_of_mass(a, lab, range(1, n + 1))
    big = sorted(range(n), key=lambda i: -sizes[i])[: rows * 3]
    by_y = sorted(big, key=lambda i: cents[i][0])
    cells = []
    for r in range(rows):
        cells += sorted(by_y[r * 3:(r + 1) * 3], key=lambda i: cents[i][1])
    groups = {b: [b + 1] for b in cells}
    for i in range(n):
        if i in groups or sizes[i] < 30: continue
        b = min(cells, key=lambda j: (cents[i][0] - cents[j][0]) ** 2 + (cents[i][1] - cents[j][1]) ** 2)
        groups[b].append(i + 1)
    arr = np.array(im)
    out = []
    for r, sid in enumerate(ids):
        for c, st in enumerate(("baby", "teen", "adult")):
            m = np.isin(lab, groups[cells[r * 3 + c]])
            part = arr.copy(); part[~m] = 0
            t = tight(Image.fromarray(part, "RGBA")).resize((size, size), Image.LANCZOS)
            p = os.path.join(ROOT, "art", f"{sid}_{st}.png")
            t.save(p, optimize=True); out.append(p)
    return out

def items(src, rels, cols, size=256):
    """여러 소품(알·먹이 아이콘 등)이 격자로 그려진 그림을 하나씩 잘라 저장해요(왼→오, 위→아래 순서)."""
    import numpy as np
    from scipy import ndimage
    im = cut_white(Image.open(src))
    k = len(rels)
    lab, n = _labels(im, k)
    a = lab > 0
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    cents = ndimage.center_of_mass(a, lab, range(1, n + 1))
    big = sorted(range(n), key=lambda i: -sizes[i])[:k]
    by_y = sorted(big, key=lambda i: cents[i][0])
    cells = []
    for r in range(0, k, cols):
        cells += sorted(by_y[r:r + cols], key=lambda i: cents[i][1])
    groups = {b: [b + 1] for b in cells}
    for i in range(n):
        if i in groups or sizes[i] < 30: continue
        b = min(cells, key=lambda j: (cents[i][0] - cents[j][0]) ** 2 + (cents[i][1] - cents[j][1]) ** 2)
        groups[b].append(i + 1)
    arr = np.array(im)
    out = []
    for rel, b in zip(rels, cells):
        m = np.isin(lab, groups[b])
        part = arr.copy(); part[~m] = 0
        t = tight(Image.fromarray(part, "RGBA")).resize((size, size), Image.LANCZOS)
        p = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        t.save(p, optimize=True); out.append(p)
    return out

def sheet(src, sid, size=384):
    im = cut_white(Image.open(src))
    out = []
    for st, col in zip(("baby", "teen", "adult"), split3(im)):
        t = tight(col).resize((size, size), Image.LANCZOS)
        p = os.path.join(ROOT, "art", f"{sid}_{st}.png")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        t.save(p, optimize=True)
        out.append(p)
    return out

def ui(src, rel, size=768, cut=False):
    im = Image.open(src)
    im = cut_white(im) if cut else im.convert("RGB")
    if cut:   # 배경만 지우고 그림에 딱 맞게(정사각형으로 늘리지 않아요)
        bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
        if bb: im = im.crop(bb)
    r = size / max(im.size)
    im = im.resize((round(im.size[0] * r), round(im.size[1] * r)), Image.LANCZOS)
    p = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if p.endswith(".jpg"): im.convert("RGB").save(p, quality=86, optimize=True)
    else: im.save(p, optimize=True)
    return [p]

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "sheet": print(sheet(a[1], a[2]))
    elif a[0] == "grid": print(grid(a[1], a[2].split(",")))
    elif a[0] == "items": print(items(a[1], a[2].split(","), int(a[3]), int(a[4]) if len(a) > 4 else 256))
    elif a[0] == "ui":
        size = int(a[a.index("--size") + 1]) if "--size" in a else 768
        print(ui(a[1], a[2], size, "--cut" in a))
