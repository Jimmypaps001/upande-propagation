# Copyright (c) 2026, Upande and contributors
# For license information, please see license.txt

"""The old upande_agriculture paths still reach working code.

	bench --site <site> run-tests --module upande_propagation.mobile.test_legacy
"""

import frappe
from frappe.tests import IntegrationTestCase


class TestLegacyPaths(IntegrationTestCase):
	def test_every_old_path_resolves_to_a_whitelisted_function(self):
		overrides = frappe.get_hooks("override_whitelisted_methods", app_name="upande_propagation")
		old = {k: v for k, v in overrides.items() if k.startswith("upande_agriculture.")}
		self.assertEqual(len(old), 6)
		for old_path, new_path in old.items():
			new_path = new_path[0] if isinstance(new_path, list) else new_path
			fn = frappe.get_attr(new_path)
			self.assertIn(fn, frappe.whitelisted, old_path)

	def test_seedling_request_needs_items(self):
		frappe.set_user("Administrator")
		frappe.local.request = frappe._dict(get_json=lambda: {"required_by_date": "2030-01-01"})
		try:
			frappe.local.response = frappe._dict()
			frappe.get_attr("upande_propagation.mobile.legacy.productionCreateSeedlingRequest")()
			self.assertIn("items is required", frappe.response["data"]["error"])
		finally:
			frappe.local.request = None

	def test_grower_candidates_shape(self):
		frappe.set_user("Administrator")
		frappe.local.request = frappe._dict(get_json=lambda: {"limit": 5})
		try:
			frappe.local.response = frappe._dict()
			frappe.get_attr("upande_propagation.mobile.legacy.productionListGrowerCandidates")()
			data = frappe.response["data"]
			self.assertEqual(data["count"], len(data["candidates"]))
		finally:
			frappe.local.request = None
