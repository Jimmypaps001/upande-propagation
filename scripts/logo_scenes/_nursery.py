"""The propagation scene with a crop's own material.

Every crop scene is the generic one (propagation.py): a cutting is lowered into a rooting tray, roots grow
down through the medium, its leaves unfold and a new shoot opens. Only the plant differs, so the motion
(LOOP) is shared and a crop module supplies the drawing: the leaf pair on the cutting, the pair that unfolds
at the next node, and the shoot with its bud or head. Not a scene itself (the build skips `_` modules).
"""

from .common import ACCENT
from .propagation import (CX, FRONT, LOOP, LOOP_MS, NODE_A, NODE_B, ROOTS, STEM_BOT, STEM_TOP, TRAY)

__all__ = ["LOOP", "LOOP_MS", "SCENE_TRANSFORM", "build"]

from .propagation import SCENE_TRANSFORM  # noqa: E402


def build(stem, leaf_a, leaf_b, shoot, stem_w=10):
    """leaf_a / leaf_b: callables side -> markup (+1 right, -1 left), drawn from the node at 0,0."""
    def pair(cls, y, draw):
        return (f'<g transform="translate({CX} {y})"><g class="{cls}r">{draw(1)}</g>'
                f'<g class="{cls}l">{draw(-1)}</g></g>')

    return f"""{TRAY}
  <g class="cut">
    <rect x="{CX - stem_w / 2}" y="{STEM_TOP}" width="{stem_w}" height="{STEM_BOT - STEM_TOP}" fill="{stem}"/>
    {pair("la", NODE_A, leaf_a)}
    {pair("lb", NODE_B, leaf_b)}
    <g transform="translate({CX} {STEM_TOP})"><g class="shoot">{shoot}</g></g>
  </g>
  {ROOTS}
  {FRONT}"""


_ = ACCENT
