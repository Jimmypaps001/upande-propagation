"""Defaults for plant arrivals: where they land and what they are checked against.

Only ever fills a blank. A farm that has chosen its own receiving warehouse has
chosen it, and a patch that runs on every migrate must not keep putting its own
answer back.

The inspection template is deliberately not created here. It belongs to
upande_summer_flowers.summer_flowers.setup.plant_quality, which already builds
it with its eight parameters and switches it on per item; duplicating it under
this app would give the site two templates with the same intent and no way to
tell which one a delivery was actually judged against.
"""

import frappe

TEMPLATE = "Plant Material Incoming"


def execute():
	settings = frappe.get_single("Propagation Settings")
	changed = False

	if not settings.get("quality_inspection_template") and frappe.db.exists(
			"Quality Inspection Template", TEMPLATE):
		settings.quality_inspection_template = TEMPLATE
		changed = True

	if not settings.get("dispatch_stock_entry_type") and frappe.db.exists(
			"Stock Entry Type", "Material Transfer"):
		settings.dispatch_stock_entry_type = "Material Transfer"
		changed = True

	# The field is installed by add_propagation_unit_fields, which now runs
	# first -- but an older site can reach this patch without it, and a
	# convenience default is not worth bringing a migrate down for. Every
	# doctype change in the run is rolled back when a patch raises, so this
	# one line stopped an entire release from landing.
	has_unit_flag = frappe.db.has_column("Warehouse", "custom_prop_is_unit")

	if not settings.get("default_receipt_warehouse") and has_unit_flag:
		# The unit a batch is actually raised in is the honest default. Fall back
		# to nothing rather than to a company default: a plant delivery landing
		# in "Stores" is a delivery nobody in the nursery can find.
		units = frappe.get_all("Warehouse",
		                       filters={"custom_prop_is_unit": 1, "disabled": 0},
		                       pluck="name", order_by="name asc", limit=2)
		if len(units) == 1:
			settings.default_receipt_warehouse = units[0]
			changed = True

	if changed:
		settings.flags.ignore_permissions = True
		settings.save()
