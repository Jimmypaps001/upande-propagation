# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, getdate


class MotherBlock(Document):
	def validate(self):
		if cint(self.plant_count) < 0:
			frappe.throw(_("Plant Count cannot be negative."))


def update_cutting_totals(mother_block):
	"""Re-derive cuttings taken and last cutting date from submitted harvests."""
	if not mother_block or not frappe.db.exists("Mother Block", mother_block):
		return

	harvests = frappe.get_all(
		"Budwood Harvest",
		filters={"mother_block": mother_block, "docstatus": 1},
		fields=["number_of_stems", "harvest_datetime"],
	)
	stamps = [row.harvest_datetime for row in harvests if row.harvest_datetime]

	frappe.db.set_value(
		"Mother Block",
		mother_block,
		{
			"total_cuttings_taken": sum(cint(row.number_of_stems) for row in harvests),
			"last_cutting_date": getdate(max(stamps)) if stamps else None,
		},
		update_modified=False,
	)


@frappe.whitelist()
def recalculate(mother_block):
	doc = frappe.get_doc("Mother Block", mother_block)
	doc.check_permission("write")
	update_cutting_totals(mother_block)
	return True
