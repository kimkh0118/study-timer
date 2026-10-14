"""tama-pack/pack.json 의 assets 목록을 실제로 있는 그림 파일로 다시 채워요.
앱은 assets 에 있는 파일만 받아서 쓰고, 없으면 임시 그림(SVG)으로 보여 줘요.
사용: python3 tools/pack_sync.py [--optimize]   (--optimize: 그림 용량 줄이기)
"""
import json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "tama-pack")
path = os.path.join(ROOT, "pack.json")
pack = json.load(open(path, encoding="utf-8"))

def shrink(path):
    """투명 배경 그림을 256색 팔레트 PNG로 줄여요(화면에서는 거의 차이가 없고 크기는 1/4)."""
    im = Image.open(path)
    if im.mode == "P": return
    if im.mode != "RGBA": return
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(path, optimize=True)

assets = []
for d in ("art", "ui"):
    for f in sorted(os.listdir(os.path.join(ROOT, d))):
        if f.endswith(".png"):
            assets.append(f"{d}/{f}")
if "--optimize" in sys.argv:
    for a in assets: shrink(os.path.join(ROOT, a))
pack["assets"] = assets
eggs = [a for a in assets if a.startswith("ui/egg_")]
if eggs:
    pack["config"]["eggArts"] = len(eggs)

missing = [sp["img"][st] for sp in pack["species"] for st in ("baby", "teen", "adult") if sp["img"][st] not in assets]
json.dump(pack, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
size = sum(os.path.getsize(os.path.join(ROOT, a)) for a in assets)
print(f"assets {len(assets)}개, {size/1024/1024:.1f}MB, 알 그림 {len(eggs)}개, 빠진 펫 그림 {len(missing)}개")
if missing:
    print("  빠짐:", ", ".join(missing))
