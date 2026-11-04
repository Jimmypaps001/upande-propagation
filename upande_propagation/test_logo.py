"""The generated Propagation mark carries valid motion metadata (see scripts/build_propagation_logo.py)."""

import json
import re
import unittest

import frappe

IMAGES = frappe.get_app_path("upande_propagation", "public", "images")


def _motion(name):
	with open(f"{IMAGES}/{name}") as f:
		svg = f.read()
	m = re.search(r'<metadata id="propagation-motion">(.*?)</metadata>', svg, re.S)
	assert m, "no motion metadata"
	return svg, json.loads(m.group(1))


class TestPropagationLogo(unittest.TestCase):
	def test_motion_metadata_is_valid(self):
		svg, spec = _motion("propagation_logo.svg")
		self.assertIn('class="arrow"', svg)
		self.assertGreater(spec["enterMs"], 0)
		self.assertGreater(spec["loopMs"], 0)
		for tracks in (spec["enter"], spec["loop"]):
			self.assertTrue(tracks)
			for t in tracks:
				self.assertTrue(t["sel"])
				self.assertTrue(svg.count(t["sel"].lstrip(".")), t["sel"])
				offs = [f["offset"] for f in t["frames"]]
				self.assertTrue(all(0 <= o <= 1 for o in offs), t["sel"])
				self.assertEqual(offs, sorted(offs), t["sel"])

	def test_loader_is_pure_css(self):
		svg = open(f"{IMAGES}/propagation_logo_loader.svg").read()
		self.assertIn("@keyframes", svg)
		self.assertNotIn("<script", svg)
