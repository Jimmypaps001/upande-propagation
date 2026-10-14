# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt
"""The propagation unit's own spec, on the Warehouse that is one.

A batch already names its propagation_unit, so the units in use can always be
read back off the batches. What cannot be is how much room one HAS -- and
without that there is no such thing as utilisation, only a running total with
nothing to measure it against. A unit standing empty between batches also
disappears from a list derived from batches alone, which is exactly when
somebody is looking for somewhere to put the next one.

Warehouse belongs to ERPNext, so these are custom fields. They are named
custom_prop_* rather than reusing the custom_sf_* capacity fields that summer
flowers installs: those count a summer-flower bench in TC and roots, which is a
different thing in a different chain, and one farm may run both.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELDS = {
	"Warehouse": [
		{
			"fieldname": "custom_prop_section",
			"fieldtype": "Section Break",
			"label": "Propagation",
			"insert_after": "warehouse_name",
			"collapsible": 1,
		},
		{
			"fieldname": "custom_prop_is_unit",
			"fieldtype": "Check",
			"label": "Propagation unit",
			"insert_after": "custom_prop_section",
			"description": "Batches are raised here, so it is offered to the propagation app.",
		},
		{
			"fieldname": "custom_prop_capacity_plants",
			"fieldtype": "Int",
			"label": "Capacity (plants)",
			"insert_after": "custom_prop_is_unit",
			"depends_on": "custom_prop_is_unit",
			"description": "How many plants the unit holds at once. Utilisation is measured against this.",
		},
		{
			"fieldname": "custom_prop_column",
			"fieldtype": "Column Break",
			"insert_after": "custom_prop_capacity_plants",
		},
		{
			"fieldname": "custom_prop_bench_sqm",
			"fieldtype": "Float",
			"label": "Bench area (m²)",
			"insert_after": "custom_prop_column",
			"depends_on": "custom_prop_is_unit",
		},
		{
			"fieldname": "custom_prop_spec",
			"fieldtype": "Small Text",
			"label": "Unit spec",
			"insert_after": "custom_prop_bench_sqm",
			"depends_on": "custom_prop_is_unit",
			"description": "Benching, misting, shading -- whatever distinguishes this unit.",
		},
	]
}


def execute():
	create_custom_fields(FIELDS, ignore_validate=True)
	_mark_units_already_in_use()


def _mark_units_already_in_use():
	"""Any warehouse that has held a batch is a propagation unit, demonstrably.

	Only ever sets the flag on. Somebody who has unticked a unit that is out of
	service meant it, and a migrate should not quietly put it back.
	"""
	used = frappe.get_all("Propagation Batch", pluck="propagation_unit")
	for name in {u for u in used if u}:
		if not frappe.db.get_value("Warehouse", name, "custom_prop_is_unit"):
			frappe.db.set_value("Warehouse", name, "custom_prop_is_unit", 1,
								update_modified=False)
