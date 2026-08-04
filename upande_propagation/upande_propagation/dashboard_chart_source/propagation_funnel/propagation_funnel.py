# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.utils import cint

# Each step of the funnel and the batch field it reads.
STEPS = (
	("Planned", "total_cuttings_planned"),
	("Cuttings received", "total_cuttings_received"),
	("Cuttings stuck", "total_cuttings_actual"),
	("Surviving", "total_survived"),
	("Dispatched", "total_dispatched"),
	("Still available", "available_to_dispatch"),
)


@frappe.whitelist()
def get(chart_name=None, chart=None, no_cache=None, filters=None, from_date=None, to_date=None, **kwargs):
	"""Cuttings in, seedlings out — the whole pipeline as one funnel."""
	if isinstance(filters, str):
		filters = json.loads(filters)
	filters = filters or {}

	conditions = {"docstatus": 1}
	if filters.get("propagation_batch"):
		conditions["name"] = filters["propagation_batch"]
	if filters.get("company"):
		conditions["company"] = filters["company"]

	batches = frappe.get_all(
		"Propagation Batch",
		filters=conditions,
		fields=[fieldname for _label, fieldname in STEPS],
	)

	values = [sum(cint(row.get(fieldname)) for row in batches) for _label, fieldname in STEPS]

	return {
		"labels": [_(label) for label, _fieldname in STEPS],
		"datasets": [{"name": _("Seedlings"), "values": values}],
		"type": "bar",
	}
