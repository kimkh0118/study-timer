"""앱 아이콘(AppIcon.icns) 만들기.

사용법:
    pip install pillow
    python3 tools/make_icon.py 원본사진.png --crop 95,250,695,850

--crop 은 원본에서 얼굴이 들어갈 정사각형 영역(왼쪽,위,오른쪽,아래)입니다.
결과물: app/Resources/AppIcon.icns, docs/icon.png
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 4          # 매끈한 가장자리를 위해 4배로 그린 뒤 줄임
N = 1024       # macOS 아이콘 캔버스
TILE = 824     # 아이콘 본체(macOS 아이콘 격자 기준)
RADIUS = 186   # 모서리 둥글기
PIN_RED = (224, 38, 44, 255)


def c(v):
    return v * S


def rounded_mask(size, r):
    m = Image.new("L", (size * S, size * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size * S - 1, size * S - 1), radius=r * S, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make(src, crop, out_icns, out_png):
    face = Image.open(src).convert("RGB").crop(crop).resize((TILE, TILE), Image.LANCZOS)
    tile = face.convert("RGBA")

    # 위쪽 반사광
    gloss = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    for i in range(260):
        gd.line([(0, i), (TILE, i)], fill=(255, 255, 255, int(46 * (1 - i / 260) ** 2)))
    tile = Image.alpha_composite(tile, gloss)

    # 오른쪽 아래 유리 원판 + 빨간 타이머 링
    bx, by, br = 604, 604, 150
    disc = tile.crop((bx - br, by - br, bx + br, by + br)).filter(ImageFilter.GaussianBlur(22))
    disc = Image.alpha_composite(disc, Image.new("RGBA", disc.size, (18, 18, 22, 150)))
    dm = Image.new("L", (2 * br * S, 2 * br * S), 0)
    ImageDraw.Draw(dm).ellipse((0, 0, 2 * br * S - 1, 2 * br * S - 1), fill=255)
    tile.paste(disc, (bx - br, by - br), dm.resize((2 * br, 2 * br), Image.LANCZOS))

    ov = Image.new("RGBA", (TILE * S, TILE * S), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    od.ellipse((c(bx - br), c(by - br), c(bx + br), c(by + br)), outline=(255, 255, 255, 110), width=c(3))
    rr = 96
    box = (c(bx - rr), c(by - rr), c(bx + rr), c(by + rr))
    od.arc(box, 0, 360, fill=(255, 255, 255, 45), width=c(22))
    od.arc(box, -90, 180, fill=PIN_RED, width=c(22))
    tile = Image.alpha_composite(tile, ov.resize((TILE, TILE), Image.LANCZOS))

    tile.putalpha(rounded_mask(TILE, RADIUS))

    # 그림자 깔고 캔버스 가운데에
    mask = rounded_mask(TILE, RADIUS)
    sm = Image.new("L", (N, N), 0)
    sm.paste(mask, (100, 112))
    shadow = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    shadow.putalpha(sm.point(lambda v: int(v * 0.45)))
    canvas = Image.alpha_composite(Image.new("RGBA", (N, N), (0, 0, 0, 0)), shadow.filter(ImageFilter.GaussianBlur(16)))
    canvas.alpha_composite(tile, (100, 100))

    canvas.save(out_icns, sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
    canvas.resize((256, 256), Image.LANCZOS).save(out_png)
    print(f"아이콘 저장: {out_icns}")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description="앱 아이콘 만들기")
    p.add_argument("source", help="원본 사진")
    p.add_argument("--crop", default="95,250,695,850", help="얼굴 영역: 왼쪽,위,오른쪽,아래")
    a = p.parse_args()
    make(a.source, tuple(int(v) for v in a.crop.split(",")),
         root / "app/Resources/AppIcon.icns", root / "docs/icon.png")
