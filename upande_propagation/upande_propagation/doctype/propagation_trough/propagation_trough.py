# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""A trough: the physical thing a planting goes into, and comes out of in lifts.

A trough is planted full or not at all. Its size decides how many plants that
is, so the minimum planting is a fact about the trough rather than about the
crop -- a bigger trough has a bigger minimum, and the same variety has
different minimums in different troughs.

How long it is held is not stored here. It is the protocol's answer: the
planting sits in the trough until the last lift is taken, plus whatever
turnaround the protocol allows. Storing it would mean a protocol change left
stale occupancy behind on every trough.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt


class PropagationTrough(Document):
	def validate(self):
		self.set_area()
		self.check_unit()
		if cint(self.plants_per_trough) <= 0:
			frappe.throw(_("A trough that takes no plants cannot be planted. "
			               "Set how many {0} holds.").format(self.trough_name))

	def set_area(self):
		if flt(self.length_m) and flt(self.width_m):
			self.area_sqm = round(flt(self.length_m) * flt(self.width_m), 4)

	def check_unit(self):
		"""The unit has to be one. A trough in a cold room is a filing error."""
		if not self.propagation_unit:
			return
		if not frappe.db.get_value("Warehouse", self.propagation_unit,
		                           "custom_prop_is_unit"):
			frappe.throw(_("{0} is not marked as a propagation unit, so a trough "
			               "cannot stand in it.").format(self.propagation_unit))
