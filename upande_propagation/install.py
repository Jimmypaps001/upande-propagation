# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""Site setup that must run on a fresh install as well as on migrate.

`bench install-app` calls `set_all_patches_as_completed()`, which stamps every
patch in patches.txt as done **without executing it** — a new install already
has the final schema, so historical patches are pointless. Anything that sets a
site up (seeding settings, creating the dashboard page) therefore has to run
from these hooks, not from a patch, or it silently never happens.
"""

import frappe

from upande_propagation.patches.v1_0 import (
	add_propagation_unit_fields,
	create_propagation_dashboard_page,
	seed_propagation_settings,
)


def after_install():
	setup()


def after_migrate():
	setup()


def setup():
	"""Idempotent: seeds only what is missing, refreshes what is shipped."""
	seed_propagation_settings.execute()
	add_propagation_unit_fields.execute()
	create_propagation_dashboard_page.execute()
	sync_dashboard()


def sync_dashboard():
	"""Import the Dashboard record shipped with the app.

	Frappe's module file sync covers doctype / report / workspace / number_card /
	dashboard_chart / dashboard_chart_source, but not `Dashboard`, so the record
	has to be reloaded explicitly.
	"""
	frappe.reload_doc("upande_propagation", "dashboard", "propagation", force=True)
