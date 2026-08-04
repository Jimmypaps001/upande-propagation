import frappe

from upande_propagation.upande_propagation.doctype.mother_block.mother_block import (
	update_cutting_totals,
)
from upande_propagation.upande_propagation.doctype.propagation_batch.propagation_batch import (
	recalculate_batch,
)
from upande_propagation.upande_propagation.doctype.seedling_request.seedling_request import (
	update_fulfilment,
)


def execute():
	"""Populate the derived fields that never had anything writing to them."""
	for block in frappe.get_all("Mother Block", pluck="name"):
		update_cutting_totals(block)

	for batch in frappe.get_all("Propagation Batch", filters={"docstatus": 1}, pluck="name"):
		recalculate_batch(batch, update_seedling_request=False)

	for request in frappe.get_all("Seedling Request", filters={"docstatus": 1}, pluck="name"):
		update_fulfilment(request)
