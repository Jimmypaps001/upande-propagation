"""Spray roses: a finer cutting that roots and throws a branched shoot, two small buds on peduncles.

Smaller compound leaves than the standard rose, and at the tip a short spray: a main bud with two side
buds on their own stalks, in the crop's lighter pink accent.
"""

from ._cut_flowers import LEAF, bud, rose_leaf
from ._nursery import LOOP, LOOP_MS, SCENE_TRANSFORM, build

LABEL = "Propagation: spray roses"
TONES = ("#a8456b", "#c9577e", "#df7d9b", "#ee9fb6")


def leaf_a(side):
    return rose_leaf(0, 0, -30 if side > 0 else -150, .58)


def leaf_b(side):
    return rose_leaf(0, 0, -38 if side > 0 else -142, .44)


def _ped(x, y):
    return (f'<path d="M0 -20 Q{x * .3:.0f} {y + 22} {x} {y}" fill="none" stroke="{LEAF}" stroke-width="4" '
            f'stroke-linecap="round"/>')


SHOOT = (f'<rect x="-4" y="-44" width="8" height="46" fill="{LEAF}"/>'
         + _ped(-34, -64) + _ped(34, -58)
         + f'<g transform="translate(0 -42)">{bud(TONES, .66)}</g>'
         + f'<g transform="translate(-34 -62)">{bud(TONES, .52)}</g>'
         + f'<g transform="translate(34 -56)">{bud(TONES, .48)}</g>')

SCENE = build(LEAF, leaf_a, leaf_b, SHOOT, stem_w=9)
