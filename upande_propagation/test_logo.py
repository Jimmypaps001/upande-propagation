"""The generated Propagation mark is a CSS play-once SVG (see scripts/build_propagation_logo.py)."""

import re
import unittest

import frappe

IMAGES = frappe.get_app_path("upande_propagation", "public", "images")


def _read(name):
	with open(f"{IMAGES}/{name}") as f:
		return f.read()


class TestPropagationLogo(unittest.TestCase):
	def test_desk_mark_plays_once_and_rests(self):
		svg = _read("propagation_logo.svg")
		self.assertNotIn("<script", svg)
		self.assertNotIn("<metadata", svg)
		self.assertIn("@keyframes", svg)
		self.assertIn('class="arrow"', svg)
		anims = re.findall(r"animation: [^;]*ms[^;]*;", svg)
		self.assertTrue(anims)
		for a in anims:
			self.assertRegex(a, r" 1 both;$", a)
			self.assertNotIn("infinite", a)
		self.assertIn("prefers-reduced-motion: reduce", svg)
		# the arrow is back at full size at the end of its keyframes
		arrow = re.search(r"@keyframes propagation-in-0 \{(.*?)\n    \}", svg, re.S).group(1)
		last = arrow.strip().splitlines()[-1]
		self.assertIn("scale(1)", last)
		self.assertIn("100%", last)

	def test_keyframe_offsets_are_ordered(self):
		svg = _read("propagation_logo.svg")
		for body in re.findall(r"@keyframes [\w-]+ \{(.*?)\n    \}", svg, re.S):
			pcts = [float(x) for x in re.findall(r"^\s*([\d.]+)%", body, re.M)]
			self.assertEqual(pcts, sorted(pcts))

	def test_every_crop_has_a_play_once_mark_and_a_looping_loader(self):
		for key in ("standard-roses", "spray-roses", "summer-flowers"):
			mark = _read(f"propagation_logo_{key}.svg")
			loader = _read(f"propagation_logo_{key}_loader.svg")
			self.assertIn("@keyframes", mark)
			self.assertNotIn("<script", mark)
			for a in re.findall(r"animation: [^;]*ms[^;]*;", mark):
				self.assertRegex(a, r" 1 both;$", (key, a))
			self.assertIn("prefers-reduced-motion: reduce", mark)
			self.assertIn("infinite", loader)
			# the crop's scene is its own drawing, not the generic one
			self.assertNotEqual(mark, _read("propagation_logo.svg"))
			for body in re.findall(r"@keyframes [\w-]+ \{(.*?)\n    \}", mark, re.S):
				pcts = [float(x) for x in re.findall(r"^\s*([\d.]+)%", body, re.M)]
				self.assertEqual(pcts, sorted(pcts), key)

	def test_loader_still_loops(self):
		self.assertIn("infinite", _read("propagation_logo_loader.svg"))
