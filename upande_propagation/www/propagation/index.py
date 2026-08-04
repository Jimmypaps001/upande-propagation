# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe

from upande_propagation.api import get_overview

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False
	context.title = frappe._("Propagation")

	company = frappe.form_dict.get("company") or None
	context.update(get_overview(company))
	return context
