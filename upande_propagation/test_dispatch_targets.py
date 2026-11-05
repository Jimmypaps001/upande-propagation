"""dispatch_targets must not filter Farm on a `disabled` column the site's Farm may not have."""

from unittest import mock

import frappe
from frappe.tests import IntegrationTestCase

from upande_propagation.tests_support import skip_erpnext_test_records


def _ops():
	from upande_propagation import operations
	return operations


class TestDispatchTargets(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		skip_erpnext_test_records()

	def test_runs_against_this_sites_farm(self):
		out = _ops().dispatch_targets()
		self.assertEqual(set(out), {"farms", "greenhouses", "requests"})

	def _run(self, has):
		meta = mock.MagicMock()
		meta.has_field.side_effect = lambda f: f in has
		real_meta = frappe.get_meta
		seen = {}

		def spy(doctype, *a, **k):
			if doctype == "Farm":
				seen.update(k)
			return []

		with mock.patch.object(frappe, "get_meta",
		                       side_effect=lambda dt, *a, **k: meta if dt == "Farm" else real_meta(dt, *a, **k)), \
			mock.patch.object(frappe, "get_all", side_effect=spy):
			_ops().dispatch_targets(company="Acme")
		return seen

	def test_no_disabled_filter_without_the_field(self):
		seen = self._run({"farm_name", "company"})
		self.assertNotIn("disabled", seen["filters"])
		self.assertEqual(seen["filters"], {"company": "Acme"})

	def test_disabled_filter_with_the_field(self):
		seen = self._run({"disabled", "farm_name", "company"})
		self.assertEqual(seen["filters"], {"disabled": 0, "company": "Acme"})

	def test_farm_without_company_or_name_fields(self):
		seen = self._run(set())
		self.assertEqual(seen["filters"], {})
		self.assertEqual(seen["fields"], ["name"])
