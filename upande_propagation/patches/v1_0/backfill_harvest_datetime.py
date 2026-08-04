import frappe


def execute():
	"""Budwood Harvest.harvest_datetime was read-only with nothing to set it.

	Every existing record has it NULL; creation is the closest honest stand-in.
	"""
	frappe.db.sql(
		"""
		update `tabBudwood Harvest`
		set harvest_datetime = creation
		where harvest_datetime is null
		"""
	)
