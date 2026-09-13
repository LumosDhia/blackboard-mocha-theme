#!/usr/bin/env python3
"""Regenerate fonts/JetBrainsMonoNLNerdFontMono-Regular.subset.woff2.

    python3 tools/subset-font.py [path/to/JetBrainsMonoNLNerdFontMono-Regular.ttf]

Why this exists rather than reusing rose-startpage's subset: that file covers
70 codepoints and does NOT include U+0020. Every space therefore fell back to
a different font at a different advance width, which is what made word gaps
in the course list look wrong. Including the space gives it the same 600-unit
monospace advance as every other glyph.
"""
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

DEFAULT_SRC = ('/home/aram/.local/share/fonts/JetBrainsMonoNerdFont/'
               'JetBrainsMonoNLNerdFontMono-Regular.ttf')
OUT = 'fonts/JetBrainsMonoNLNerdFontMono-Regular.subset.woff2'

# ASCII (with the space), Latin-1 for French accents, curly quotes and
# dashes, the bullet used as the entry marker, and the ellipsis the two-line
# clamp renders. No CJK: JetBrains Mono has none, so おかえり and 『』 fall
# back to a system font by design.
UNICODES = (
    list(range(0x20, 0x7F))
    + list(range(0xA0, 0x100))
    + [0x2018, 0x2019, 0x201C, 0x201D, 0x2013, 0x2014, 0x2022, 0x2026]
)


def main(src):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.notdef_outline = True

    font = subset.load_font(src, opts)
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    subset.save_font(font, OUT, opts)

    check = TTFont(OUT)
    cmap = check.getBestCmap()
    assert 0x20 in cmap, 'subset is missing U+0020 — the bug this script exists to avoid'
    advance = check['hmtx'][cmap[0x20]][0]
    print(f'{OUT}: {len(cmap)} codepoints, space advance {advance}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC)
