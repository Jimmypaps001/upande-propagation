# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Take over the Summer Flowers propagation and motherstock doctypes.

Runs pre_model_sync. On a site that ran upande_summer_flowers (or mirrors it, as marginpar.local does)
these doctypes are DocType rows with module "Summer Flowers" -- and on the mirror, `custom = 1`, because they
were loaded as custom DocTypes. Both have to change BEFORE the model sync:

	module  -> "Upande Propagation", so the controller resolves through this app (otherwise migrate's
	           remove_orphan_doctypes sees a standard doctype whose module has no folder and DELETES it,
	           table and records with it);
	custom  -> 0, so this app's JSON is the definition and is synced onto the existing tables instead
	           of being treated as a clash with a custom doctype.

Nothing is created, dropped or renamed: the tables and the records stay where they are. Every step is a no-op
when its row is absent or already moved, so a fresh site and a second run are both harmless.
"""

import frappe

MODULE = "Upande Propagation"
OLD_MODULE = "Summer Flowers"

DOCTYPES = (
	"Summer Flower Propagation Plan",
	"Summer Flower Propagation Week",
	"Summer Flower Propagation Source",
	"Summer Flower Propagation Intake",
	"Summer Flower Propagation Allocation",
	"Summer Flower Propagation Actual",
	"Summer Flower Motherstock Plan",
	"Summer Flower Motherstock Week",
	"Summer Flower Motherstock Cycle",
	"Summer Flower Motherstock Generation",
	"Summer Flower Motherstock Batch",
)


def execute():
	if not frappe.db.exists("Module Def", MODULE):
		return
	for name in DOCTYPES:
		row = frappe.db.get_value("DocType", name, ["module", "custom"], as_dict=True)
		if not row:
			continue
		if row.module != OLD_MODULE and row.module != MODULE:
			# Somebody else's by now: leave it alone.
			continue
		if row.module != MODULE or row.custom:
			frappe.db.set_value("DocType", name, {"module": MODULE, "custom": 0}, update_modified=False)
