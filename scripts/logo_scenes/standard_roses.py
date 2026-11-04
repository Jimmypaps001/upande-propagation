"""Standard roses: a rose cutting struck in the tray, roots, compound leaves, a bud forming at the tip.

The cutting carries real compound rose leaves (five leaflets, pale midrib) and a thorn or two on the cane.
Once rooted it unfolds a new pair of leaves and a hybrid-tea bud in the crop's deep rose accent.
"""

from ._cut_flowers import LEAF, bud, rose_leaf, thorn
from ._nursery import LOOP, LOOP_MS, SCENE_TRANSFORM, build

LABEL = "Propagation: standard roses"
TONES = ("#7d1f3d", "#a82a52", "#c94468", "#dd6a88")


def leaf_a(side):
    return rose_leaf(0, 0, -30 if side > 0 else -150, .7)


def leaf_b(side):
    return rose_leaf(0, 0, -36 if side > 0 else -144, .5)


SHOOT = (f'<rect x="-4.5" y="-46" width="9" height="48" fill="{LEAF}"/>'
         + thorn(4, -26, 1, .7)
         + f'<g transform="translate(0 -44)">{bud(TONES, .8)}</g>')

SCENE = build(LEAF, leaf_a, leaf_b, SHOOT)
