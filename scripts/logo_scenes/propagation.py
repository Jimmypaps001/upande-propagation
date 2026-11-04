"""Propagation: a cutting becomes a seedling.

A rose cutting is lowered into a cell of a rooting tray. Roots grow down through the medium, the cutting's
leaves unfold, then a new pair of leaves and a shoot tip open at the top: a rooted seedling. Everything
fades and the round starts again. Flat solid shapes, no outlines; ink tones plus the accent for life.
"""

from .common import ACCENT, INK, MID, PALE

LABEL = "Propagation"
SCENE_TRANSFORM = "translate(0 0)"
LOOP_MS = 4400

PANEL = "#e6e2da"
ROOT = "#625d59"
YOUNG = "#86aa78"

CX = 344                      # the cutting's column
SURFACE = 486                 # top of the medium
STEM_TOP, STEM_BOT = 262, 536
NODE_A, NODE_B = 340, 292     # cutting leaves, new leaves

LEAF = "M0 0 C16 -26 70 -34 112 0 C70 34 16 26 0 0 Z"


def leaf_pair(cls, y, s, fill):
    """Two leaves leaving the stem at (CX, y); the animated group scales about the node."""
    return (f'<g transform="translate({CX} {y})">'
            f'<g class="{cls}r"><path transform="rotate(-32) scale({s})" d="{LEAF}" fill="{fill}"/></g>'
            f'<g class="{cls}l"><path transform="rotate(-148) scale({s})" d="{LEAF}" fill="{fill}"/></g>'
            f'</g>')


def cell(x0, x1):
    return f'<path d="M{x0} {SURFACE} H{x1} L{x1 - 8} 596 H{x0 + 8} Z" fill="{PALE}"/>'


TRAY = f"""<g class="tray">
    <path d="M168 {SURFACE - 12} H520 L498 604 H190 Z" fill="{PANEL}"/>
    {cell(180, 276)}
    {cell(292, 396)}
    {cell(412, 508)}
  </g>"""

CUTTING = f"""<g class="cut">
    <rect x="{CX - 5}" y="{STEM_TOP}" width="10" height="{STEM_BOT - STEM_TOP}" fill="{ACCENT}"/>
    {leaf_pair("la", NODE_A, .72, ACCENT)}
    {leaf_pair("lb", NODE_B, .6, YOUNG)}
    <g transform="translate({CX} {STEM_TOP})">
      <g class="shoot">
        <rect x="-4" y="-46" width="8" height="48" fill="{ACCENT}"/>
        <path d="M0 -40 C-16 -52 -16 -72 0 -92 C16 -72 16 -52 0 -40 Z" fill="{YOUNG}"/>
      </g>
    </g>
  </g>"""

ROOTS = f"""<g class="roots">
    <path class="r0" pathLength="1" d="M{CX} {STEM_BOT - 6} C{CX - 2} 556 {CX + 4} 572 {CX} 590" fill="none" stroke="{ROOT}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1"/>
    <path class="r1" pathLength="1" d="M{CX} {STEM_BOT - 2} C{CX - 14} 546 {CX - 34} 556 {CX - 44} 574" fill="none" stroke="{ROOT}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1"/>
    <path class="r2" pathLength="1" d="M{CX} {STEM_BOT - 2} C{CX + 14} 548 {CX + 34} 558 {CX + 42} 578" fill="none" stroke="{ROOT}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1"/>
    <path class="r3" pathLength="1" d="M{CX} 560 C{CX - 10} 564 {CX - 22} 566 {CX - 30} 586" fill="none" stroke="{ROOT}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1"/>
    <path class="r4" pathLength="1" d="M{CX} 566 C{CX + 10} 570 {CX + 20} 572 {CX + 26} 592" fill="none" stroke="{ROOT}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1" stroke-dashoffset="1"/>
  </g>"""

FRONT = f'<rect x="156" y="{SURFACE - 28}" width="376" height="28" rx="5" fill="{INK}"/>'

SCENE = f"""{TRAY}
  {CUTTING}
  {ROOTS}
  {FRONT}"""


def _t(**p):
    return p


UP = "translate(0px, -120px)"
HOME = "translate(0px, 0px)"
OPEN = "rotate(0deg) scale(1)"
RIGHT_FOLD = "rotate(52deg) scale(.45)"
LEFT_FOLD = "rotate(-52deg) scale(.45)"
SHUT = "scale(0)"
FULL = "scale(1)"


def _hold(a, b, lo, hi, end=0.9):
    """a until lo, b from hi to the end of the show, then back to a once hidden."""
    return [(0, a), (lo, a), (hi, b), (end, b), (0.961, a), (1, a)]


def _root(lo, hi):
    return [(0, {"strokeDashoffset": 1}), (lo, {"strokeDashoffset": 1}), (hi, {"strokeDashoffset": 0}),
            (0.95, {"strokeDashoffset": 0}), (0.951, {"strokeDashoffset": 1}), (1, {"strokeDashoffset": 1})]


LOOP = [
    (".cut", None, [
        (0, {"transform": UP, "opacity": 0}), (0.05, {"transform": UP, "opacity": 1}),
        (0.26, {"transform": HOME, "opacity": 1}), (0.9, {"transform": HOME, "opacity": 1}),
        (0.96, {"transform": HOME, "opacity": 0}), (0.961, {"transform": UP, "opacity": 0}), (1, {"transform": UP, "opacity": 0}),
    ]),
    (".roots", None, [
        (0, {"opacity": 1}), (0.9, {"opacity": 1}), (0.96, {"opacity": 0}), (1, {"opacity": 1}),
    ]),
    (".r0", None, _root(0.28, 0.46)),
    (".r1", None, _root(0.32, 0.50)),
    (".r2", None, _root(0.34, 0.52)),
    (".r3", None, _root(0.42, 0.56)),
    (".r4", None, _root(0.44, 0.58)),
    (".lar", "view-box|0px 0px", _hold({"transform": RIGHT_FOLD}, {"transform": OPEN}, 0.44, 0.62)),
    (".lal", "view-box|0px 0px", _hold({"transform": LEFT_FOLD}, {"transform": OPEN}, 0.44, 0.62)),
    (".lbr", "view-box|0px 0px", _hold({"transform": SHUT}, {"transform": FULL}, 0.56, 0.74)),
    (".lbl", "view-box|0px 0px", _hold({"transform": SHUT}, {"transform": FULL}, 0.56, 0.74)),
    (".shoot", "view-box|0px 0px", _hold({"transform": SHUT}, {"transform": FULL}, 0.62, 0.80)),
]
