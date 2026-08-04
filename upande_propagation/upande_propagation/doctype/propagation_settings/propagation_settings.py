# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class PropagationSettings(Document):
	def validate(self):
		seen = set()
		for row in self.stage_durations:
			if row.stage in seen:
				frappe.throw(_("Stage {0} is listed more than once.").format(frappe.bold(row.stage)))
			seen.add(row.stage)
			if cint(row.expected_days) <= 0:
				frappe.throw(_("Row #{0}: Expected Days must be greater than zero.").format(row.idx))
