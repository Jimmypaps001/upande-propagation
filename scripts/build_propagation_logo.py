"""Generate the Propagation mark's SVGs.

    python3 scripts/build_propagation_logo.py

Same system as Production (upande_production/scripts/build_production_logo.py). At rest the mark IS
the Upande mark (white disc, the arrow). On hover the arrow shrinks into the centre and the propagation
scene plays (a rose cutting struck into a rooting tray, roots, leaves, a new shoot); it loops while the
pointer stays and eases back out on leave. Keyframes are written once and emitted as CSS (the splash
loader, shown through <img>) and as JSON in <metadata> (propagation_logo_motion.js on the desk).

Output: public/images/propagation_logo.svg and propagation_logo_loader.svg.
"""

from __future__ import annotations

import importlib
import json
import pkgutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import logo_scenes  # noqa: E402

APP = Path(__file__).resolve().parents[1]
ROOT = APP / "upande_propagation" / "public" / "images"

# -- artwork (689 x 689, the PNG's own canvas) --------------------------------

ARROW = """<g class="arrow">
    <g transform="translate(169 165)">
      <path fill="#625d59" d="M0 0 H272 V85 H0 Z"/>
      <path fill="#45433f" d="M272 0 H359 V364 H272 Z"/>
      <path fill="#1a1917" d="M246 85 H272 V161 L246 187 Z"/>
      <path fill="#45433f" d="M198 85 H246 V187 L69 364 H0 V283 Z"/>
    </g>
  </g>"""


def body(scene, rest_hidden: bool) -> str:
    hide = ' opacity="0"' if rest_hidden else ""
    return f"""  <clipPath id="propagation-disc"><circle cx="344.5" cy="344.5" r="336"/></clipPath>
  <!-- the white disc of upande_logo.png, with its thin dark rim -->
  <circle cx="344.5" cy="344.5" r="340" fill="#ffffff" stroke="#1c1b19" stroke-opacity=".3" stroke-width="7"/>
  <g clip-path="url(#propagation-disc)">
  <g class="scene"{hide}>
  <g transform="{scene.SCENE_TRANSFORM}">
  {scene.SCENE}
  </g>
  </g>
  </g>
  {ARROW}
"""


# -- motion (shared by every scene) -------------------------------------------
# Each entry: selector, transform-origin (view-box px), keyframes [offset, props].
# ENTER runs 0 -> 1 on hover (and back on leave); a scene's LOOP is its story.

ARROW_HOME = "translate(0px, 0px) scale(1)"
ARROW_GONE = "translate(0px, 0px) scale(0)"

ENTER = [
    # The arrow shrinks into the centre of the disc and fades, so the scene has the whole
    # disc; on leave it grows back out of the centre.
    (".arrow", "348.5px 347px", [
        (0, {"transform": ARROW_HOME, "opacity": 1}),
        (0.45, {"transform": ARROW_GONE, "opacity": 0}),
        (1, {"transform": ARROW_GONE, "opacity": 0}),
    ]),
    (".scene", None, [
        (0, {"opacity": 0}),
        (0.2, {"opacity": 1}),
        (1, {"opacity": 1}),
    ]),
]

# One splash pass: enter 0-18 %, the scene round 18-82 %, back out 82-100 %. The splash
# loader and the hover motion both derive their timing from this single cycle.
CYCLE_MS = 4000
ENTER_PCT, EXIT_PCT = 18.0, 82.0
ENTER_MS = round(CYCLE_MS * ENTER_PCT / 100)                    # 720; leave reverses in the same time
LOOP_MS = round(CYCLE_MS * (EXIT_PCT - ENTER_PCT) / 100)        # 2560
EASE = "cubic-bezier(.3,.7,.2,1)"


# -- emit ---------------------------------------------------------------------

def _css_props(props: dict) -> str:
    out = []
    for k, v in props.items():
        name = {"strokeDashoffset": "stroke-dashoffset", "strokeWidth": "stroke-width"}.get(k, k)
        out.append(f"{name}: {v}")
    return "; ".join(out)


def _origin(origin: str) -> tuple[str, str]:
    """"fill-box|50% 100%" → (box, origin); a bare origin is in view-box px."""
    box, _, at = origin.rpartition("|")
    return (box or "view-box", at)


def _origin_rules(tracks) -> list[str]:
    rules = []
    for sel, origin, _ in tracks:
        if origin:
            box, at = _origin(origin)
            rules.append(f"    {sel} {{ transform-box: {box}; transform-origin: {at}; }}")
    return rules


def loader_css(loop, loop_ms=LOOP_MS, iterations="infinite") -> str:
    """One cycle: enter (0–18%), the round (18–82%), back out (82–100%)."""
    # One full pass (arrow in, the scene, arrow back out) in the 4 s the splash is held for.
    cycle_ms = round(loop_ms * 100 / (EXIT_PCT - ENTER_PCT))
    a, b = ENTER_PCT, EXIT_PCT
    lines = ["  <style>"]
    lines += _origin_rules(ENTER + loop)
    keyframes = []
    for i, (sel, _o, frames) in enumerate(ENTER):
        name = f"propagation-in-{i}"
        steps = {}
        for off, props in frames:
            steps[round(off * a, 2)] = props
            steps[round(100 - off * (100 - b), 2)] = props
        keyframes.append((sel, name, sorted(steps.items())))
    for i, (sel, _o, frames) in enumerate(loop):
        name = f"propagation-round-{i}"
        first = frames[0][1]
        steps = {0.0: first}
        for off, props in frames:
            steps[round(a + off * (b - a), 2)] = props
        steps[100.0] = first
        keyframes.append((sel, name, sorted(steps.items())))
    for sel, name, _ in keyframes:
        lines.append(f"    {sel} {{ animation: {name} {cycle_ms}ms {EASE} {iterations} both; }}")
    for _sel, name, steps in keyframes:
        lines.append(f"    @keyframes {name} {{")
        for pct, props in steps:
            lines.append(f"      {pct:g}% {{ {_css_props(props)}; }}")
        lines.append("    }")
    lines.append("    @media (prefers-reduced-motion: reduce) {")
    lines.append("      .arrow, .scene, .scene * { animation: none !important; }")
    lines.append("      .scene { opacity: 0; }")
    lines.append("    }")
    lines.append("  </style>")
    return "\n".join(lines)



def motion_json(loop, loop_ms) -> str:
    def tracks(t):
        return [
            {
                "sel": sel,
                "box": _origin(origin)[0] if origin else None,
                "origin": _origin(origin)[1] if origin else None,
                "frames": [dict(offset=o, **p) for o, p in frames],
            }
            for sel, origin, frames in t
        ]

    return json.dumps(
        {"enterMs": ENTER_MS, "loopMs": loop_ms, "ease": EASE, "enter": tracks(ENTER), "loop": tracks(loop)},
        separators=(",", ":"),
    )


HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 689 689" width="689" height="689" role="img" aria-label="{label}">'


def check(key: str, tracks) -> None:
    """Browsers reject (and the app used to crash on) keyframes whose offsets go backwards."""
    for sel, _origin, frames in tracks:
        offs = [o for o, _ in frames]
        if any(o < 0 or o > 1 for o in offs) or any(b < a for a, b in zip(offs, offs[1:])):
            raise SystemExit(f"{key}: {sel} offsets out of order: {offs}")


def write(key: str, scene) -> None:
    check(key, ENTER + scene.LOOP)
    stem = "propagation_logo"
    desk = "\n".join([
        HEAD.format(label=scene.LABEL),
        "  <!-- Generated by scripts/build_propagation_logo.py from logo_scenes - edit there.",
        "       Plays once (arrow out, the scene, arrow back) and comes to rest as the plain Upande mark. Pure CSS. -->",
        loader_css(scene.LOOP, scene.LOOP_MS, iterations="1"),
        body(scene, rest_hidden=False) + "</svg>",
        "",
    ])
    (ROOT / f"{stem}.svg").write_text(desk)
    loader = "\n".join([
        HEAD.format(label=f"Upande {scene.LABEL}"),
        "  <!-- Generated by scripts/build_propagation_logo.py from logo_scenes — edit there.",
        "       The splash loader: the scene on a loop (in, the story, out). Pure CSS. -->",
        loader_css(scene.LOOP, scene.LOOP_MS),
        body(scene, rest_hidden=False) + "</svg>",
        "",
    ])
    (ROOT / f"{stem}_loader.svg").write_text(loader)
    print("wrote", stem)


def main(only: list[str] | None = None):
    ROOT.mkdir(parents=True, exist_ok=True)
    for mod in pkgutil.iter_modules(logo_scenes.__path__):
        if mod.name == "common":
            continue
        key = mod.name
        if only and key not in only:
            continue
        write(key, importlib.import_module(f"logo_scenes.{mod.name}"))


if __name__ == "__main__":
    main(sys.argv[1:] or None)
