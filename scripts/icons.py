"""Generate the extension icons: a dark rounded square with three scan lines,
the middle one lit. Run: python3 scripts/icons.py"""
from PIL import Image, ImageDraw

def icon(size: int) -> Image.Image:
    s = size * 8  # draw large, downsample for antialiasing
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = s * 0.22
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=(15, 15, 15, 255))
    pad = s * 0.22
    h = s * 0.075
    gap = (s - 2 * pad - 3 * h) / 2
    y = pad
    for i in range(3):
        w = s - 2 * pad if i != 2 else (s - 2 * pad) * 0.62
        col = (255, 255, 255, 255) if i == 1 else (110, 110, 110, 255)
        d.rounded_rectangle([pad, y, pad + w, y + h], radius=h / 2, fill=col)
        y += h + gap
    return im.resize((size, size), Image.LANCZOS)

for n in (16, 32, 48, 128):
    icon(n).save(f"icons/{n}.png")
print("icons written")
