# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from upande_propagation.api import get_batch_detail

no_cache = 1


def get_context(context):
	context.no_cache = 1
	context.show_sidebar = False

	name = frappe.form_dict.get("name")
	if not name:
		frappe.throw(_("No propagation batch given."), frappe.DoesNotExistError)
	if not frappe.db.exists("Propagation Batch", name):
		frappe.throw(_("Propagation Batch {0} not found.").format(name), frappe.DoesNotExistError)

	context.update(get_batch_detail(name))
	context.title = context.batch.name
	return context
