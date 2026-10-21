# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""A block, kept the same way a greenhouse is.

A block and a greenhouse are the same kind of thing from the planner's side:
a piece of covered ground divided into beds, each bed under a variety, with a
history of what was replanted and what was uprooted. They were modelled
differently -- a greenhouse had varieties, bed ranges, individual beds and
logs; a block had one `variety` Link and a bed count -- which meant a block
holding three varieties could only say which one it was planted as.

So this reuses the greenhouse's own child tables AND its own methods rather
than keeping a parallel copy. Two implementations of "expand the ranges into
beds and roll them up" is two sets of rounding, and the one nobody looks at is
the one that drifts.

Block keeps `plant_count` and `custom_total_beds` because the summer-flower
planner reads them -- farm_bed_geometry sizes a farm's ground off
custom_total_beds -- so they are kept in step with the rolled-up figures
rather than left to disagree.
"""

import frappe
from frappe.model.document import Document

try:
	from upande_agriculture.upande_agriculture.doctype.greenhouse.greenhouse import (
		Greenhouse,
	)
except Exception:          # upande_agriculture absent: the block still saves
	Greenhouse = None


class Block(Document):
	def validate(self):
		self.set_area()
		if Greenhouse is None or not self.get("individual_beds") and not self.get("bed_range"):
			self.sync_legacy_counts()
			return
		# The greenhouse's own code, run against this document. The field names
		# were mirrored for exactly this reason.
		Greenhouse.expand_bed_ranges(self)
		Greenhouse.apply_logs(self)
		Greenhouse.roll_up(self)
		self.sync_legacy_counts()

	def set_area(self):
		if self.block_length and self.block_width:
			self.block_area = round(float(self.block_length) * float(self.block_width), 4)

	def sync_legacy_counts(self):
		"""Keep the older fields equal to the rolled-up ones.

		`custom_total_beds` is what the summer-flower planner sizes a farm's
		ground from, so letting it drift from the beds actually recorded is how
		a plan comes to claim ground that is not there.
		"""
		if self.get("number_of_beds"):
			self.custom_total_beds = self.number_of_beds
		if self.get("number_of_plants"):
			self.plant_count = self.number_of_plants
