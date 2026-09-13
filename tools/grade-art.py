#!/usr/bin/env python3
"""Regenerate rail-art.jpg: resize a source image and grade it to Catppuccin
Mocha.

    python3 tools/grade-art.py path/to/source.jpg

The grade is baked into the file rather than applied in CSS. A CSS `filter`
on .bbm-rail-art would also filter its own ::after and dim the top fade along
with the picture, and a mix-blend-mode tint would need an extra isolated
layer to blend against. Doing it once here is both more controllable and free
at runtime.
"""
import sys
from PIL import Image, ImageOps

RAIL_W = 232          # .bbm-rail width in courselist.css
OUT = 'rail-art.jpg'

# Luminance 0 -> 1 mapped across the palette. Shadows start at base, not
# crust: the rail sits on --ctp-base, so anything darker reads as a hole in
# the page rather than as artwork.
STOPS = [
    (0.00, '#1e1e2e'),  # base
    (0.30, '#45475a'),  # surface1
    (0.55, '#7d6fa8'),  # mauve mid
    (0.78, '#b4befe'),  # lavender
    (1.00, '#f5e0dc'),  # rosewater highlight
]
KEEP_ORIGINAL = 0.18  # enough of the source to keep warm accents from flattening


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def ramp(channel):
    """256-entry lookup table, linearly interpolated between the stops."""
    pos = [p for p, _ in STOPS]
    cols = [hex_rgb(c) for _, c in STOPS]
    out = []
    for i in range(256):
        x = i / 255
        for k in range(len(pos) - 1):
            if pos[k] <= x <= pos[k + 1]:
                span = pos[k + 1] - pos[k]
                t = 0 if span == 0 else (x - pos[k]) / span
                out.append(round(cols[k][channel] + t * (cols[k + 1][channel] - cols[k][channel])))
                break
        else:
            out.append(cols[-1][channel])
    return out


def main(src):
    im = Image.open(src).convert('RGB')
    width = RAIL_W * 2                      # 2x for HiDPI
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)

    # A night scene sits almost entirely in the bottom third of the range, so
    # mapping it straight onto the ramp only ever reaches the dark end.
    # Stretch the source's own range across the full ramp first.
    gray = ImageOps.autocontrast(im.convert('L'), cutoff=1)
    duo = Image.merge('RGB', tuple(gray.point(ramp(c)) for c in range(3)))

    Image.blend(duo, im, KEEP_ORIGINAL).save(
        OUT, 'JPEG', quality=84, optimize=True, progressive=True
    )
    print(f'{OUT} <- {src}  ({Image.open(OUT).size[0]}x{Image.open(OUT).size[1]})')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
