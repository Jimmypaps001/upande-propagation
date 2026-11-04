"""Summer flowers (eryngium): a plug rooting in the tray, spiny three-lobed leaves, a young head at the tip.

Eryngium is raised from plugs, so the cutting here is a plug seedling: low spiny leaves open as it roots,
and the stem tops out in a small steel-blue head in a ruff of narrow, spiny bracts (the crop's accent).
The drawing helpers are the Summer flowers scene's own, copied so this repo does not import across apps.
"""

import math

from ._nursery import LOOP, LOOP_MS, SCENE_TRANSFORM, build

LABEL = "Propagation: summer flowers"

STEM = "#4f7c93"
BLUE = {"dome": "#2f568f", "a": "#3b6fb6", "b": "#6b97d1"}
FLORET = "#a9c4e6"


def bract(length, fill, rot=0):
    """A narrow spiny bract standing on 0,0 and pointing up, turned by `rot` degrees."""
    L = length
    pts = [(-5.5, 0), (-3.4, -.3 * L), (-8.5, -.36 * L), (-3, -.56 * L), (-7, -.64 * L), (-1.8, -.84 * L), (0, -L),
           (1.8, -.84 * L), (7, -.64 * L), (3, -.56 * L), (8.5, -.36 * L), (3.4, -.3 * L), (5.5, 0)]
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"
    return f'<path transform="rotate({rot})" d="{d}" fill="{fill}"/>'


def spiny_leaf(deg, s):
    lobes = "".join(bract(L, STEM if i == 1 else "#5f8fa6", a) for i, (L, a) in enumerate(((58, -56), (80, 0), (58, 56))))
    return (f'<g transform="rotate({deg}) scale({s})"><path d="M0 0 V16" stroke="{STEM}" stroke-width="6"/>'
            f'<g transform="translate(0 14)">{lobes}</g></g>')


def head(s):
    angles = [-168, -148, -128, -108, -88, -68, -48, -28, -8, 12, 172]
    ruff = "".join(bract(66 - 5 * (i % 3), BLUE["a"] if i % 2 else BLUE["b"], a + 90) for i, a in enumerate(angles))
    dots = ""
    for row, y in enumerate((-10, -22, -34, -46, -57)):
        half = 20 * math.sqrt(max(0.0, 1 - ((y + 33) / 36) ** 2))
        n = max(1, int(half * 2 // 9))
        for k in range(n + 1):
            x = -half + (k + (row % 2) * .5) * (2 * half / max(n, 1))
            if abs(x) <= half:
                dots += f'<circle cx="{x:.1f}" cy="{y}" r="2.5" fill="{FLORET}" fill-opacity=".75"/>'
    dome = (f'<path d="M-24 -2 C-28 -34 -12 -62 0 -69 C12 -62 28 -34 24 -2 C12 6 -12 6 -24 -2 Z" fill="{BLUE["dome"]}"/>{dots}')
    collar = "".join(bract(36, BLUE["a"] if i % 2 else BLUE["b"], a) for i, a in enumerate((-62, -34, -10, 14, 38, 62)))
    return f'<g transform="scale({s})">{ruff}{dome}{collar}</g>'


def leaf_a(side):
    return spiny_leaf(58 * side, .62)


def leaf_b(side):
    return spiny_leaf(40 * side, .46)


SHOOT = (f'<rect x="-4.5" y="-46" width="9" height="48" fill="{STEM}"/>'
         f'<g transform="translate(0 -44)">{head(.56)}</g>')

SCENE = build(STEM, leaf_a, leaf_b, SHOOT, stem_w=9)
