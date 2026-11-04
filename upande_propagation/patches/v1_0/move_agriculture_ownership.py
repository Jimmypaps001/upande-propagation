# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Settle who owns what after upande_agriculture was split up.

Runs pre_model_sync. `bench migrate` ends by deleting every standard DocType
whose controller can no longer be found through its module (frappe's
remove_orphan_doctypes). Crop Type and Agriculture Settings lost their folders
here when upande_production took them over, so if their rows still said
"Upande Propagation" they would be treated as orphans. Moving the module first
means the controller resolves through upande_production instead.

	Flower Trial (and its child tables)  Upande Agriculture -> Upande Propagation
	Crop Type, Agriculture Settings      Upande Propagation -> Crop Production

Only module is changed -- the tables, the records and the single's values stay
where they are. Every step is a no-op when its row (or the target module) is
absent, so a fresh site and a second run are both harmless.
"""

import frappe

PROPAGATION = "Upande Propagation"
AGRICULTURE = "Upande Agriculture"
PRODUCTION = "Crop Production"

TO_PROPAGATION = (
	"Flower Trial",
	"Flower Trial Bed Range",
	"Flower Trial Bed Detail",
	"FT Harvest Grade",
)
TO_PRODUCTION = ("Crop Type", "Agriculture Settings")


def execute():
	for name in TO_PROPAGATION:
		_move(name, AGRICULTURE, PROPAGATION)
	# Only once production's module is there to receive them; until then the
	# rows stay put and production's own sync takes them when it runs.
	if frappe.db.exists("Module Def", PRODUCTION):
		for name in TO_PRODUCTION:
			_move(name, PROPAGATION, PRODUCTION)


def _move(doctype, from_module, to_module):
	if frappe.db.get_value("DocType", doctype, "module") != from_module:
		return
	frappe.db.set_value("DocType", doctype, "module", to_module, update_modified=False)
